#!/usr/bin/env python3
"""Tiny ÜSTRA/GVH realtime proxy for UestraLinienblick.

It exposes /alerts?lines=3,7,10 and returns the JSON shape expected by the
iPhone app. The data source is DELFI/gtfs.de GTFS-Realtime ServiceAlerts.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Iterable

from google.transit import gtfs_realtime_pb2


REALTIME_URL = os.environ.get("UESTRA_GTFS_RT_URL", "https://realtime.gtfs.de/realtime-free.pb")
STATIC_GTFS_URL = os.environ.get("UESTRA_STATIC_GTFS_URL", "https://download.gtfs.de/germany/nv_free/latest.zip")
AGENCY_MATCH = [
    item.strip().lower()
    for item in os.environ.get("UESTRA_AGENCY_MATCH", "üstra,uestra,gvh,großraum-verkehr,hannover").split(",")
    if item.strip()
]
TEXT_CONTEXT_MATCH = [
    item.strip().lower()
    for item in os.environ.get(
        "UESTRA_TEXT_CONTEXT_MATCH",
        "üstra,uestra,gvh,hannover,garbsen,laatzen,langenhagen,ronnenberg,wettbergen,stoecken,stöcken,ahlem,misburg,anderten,messe,kröpcke,kroepcke"
    ).split(",")
    if item.strip()
]
CACHE_DIR = Path(os.environ.get("UESTRA_PROXY_CACHE", Path(__file__).with_name(".cache")))
ROUTE_CACHE = CACHE_DIR / "routes.json"
STATIC_ZIP = CACHE_DIR / "gtfs_nv_latest.zip"
DEFAULT_PORT = int(os.environ.get("PORT", "8765"))


@dataclass(frozen=True)
class RouteInfo:
    route_id: str
    short_name: str
    agency_id: str
    agency_name: str


def main() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", DEFAULT_PORT), Handler)
    print(f"ÜSTRA realtime proxy listening on http://127.0.0.1:{DEFAULT_PORT}/alerts")
    print("First request may download the static GTFS route table once.")
    server.serve_forever()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            self.send_json({"ok": True})
            return

        if parsed.path != "/alerts":
            self.send_error(404, "Use /alerts?lines=3,7,10")
            return

        query = urllib.parse.parse_qs(parsed.query)
        lines = parse_lines(query.get("lines", [""])[0])

        try:
            alerts = get_alerts(lines)
            self.send_json({"alerts": alerts})
        except Exception as exc:  # Keep the iPhone app response readable.
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(exc)}, ensure_ascii=False).encode("utf-8"))

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")

    def send_json(self, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def get_alerts(lines: set[str]) -> list[dict[str, object]]:
    routes = load_routes()
    feed = fetch_realtime_feed()
    now = iso_now()
    results: dict[str, dict[str, object]] = {}

    for entity in feed.entity:
        if not entity.HasField("alert"):
            continue

        alert = entity.alert
        title = translated_text(alert.header_text) or "Verkehrsmeldung"
        detail = translated_text(alert.description_text) or title
        url = translated_text(alert.url) if alert.HasField("url") else None

        affected_lines = lines_for_alert(alert, routes, title, detail)
        for line in affected_lines:
            if lines and line not in lines:
                continue

            key = f"{entity.id or digest(title + detail)}-{line}"
            results[key] = {
                "id": key,
                "line": line,
                "title": title,
                "detail": detail,
                "severity": severity_for(alert, title, detail),
                "updatedAt": now,
                "url": url or "https://www.uestra.de/aktuelles/neuigkeiten/aktuelle-meldungen/",
            }

    return sorted(results.values(), key=lambda item: str(item["updatedAt"]), reverse=True)


def load_routes() -> dict[str, RouteInfo]:
    if ROUTE_CACHE.exists():
        with ROUTE_CACHE.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)
        return {route_id: RouteInfo(**item) for route_id, item in raw.items()}

    download_static_feed()

    with zipfile.ZipFile(STATIC_ZIP) as archive:
        agencies = read_agencies(archive)
        routes: dict[str, RouteInfo] = {}
        with archive.open("routes.txt") as route_file:
            rows = csv.DictReader((line.decode("utf-8-sig") for line in route_file))
            for row in rows:
                route_id = row.get("route_id", "").strip()
                short_name = row.get("route_short_name", "").strip()
                agency_id = row.get("agency_id", "").strip()
                agency_name = agencies.get(agency_id, "")
                if not route_id or not short_name:
                    continue
                if AGENCY_MATCH and not text_matches(agency_name, AGENCY_MATCH):
                    continue
                routes[route_id] = RouteInfo(route_id, short_name, agency_id, agency_name)

    with ROUTE_CACHE.open("w", encoding="utf-8") as handle:
        json.dump({key: value.__dict__ for key, value in routes.items()}, handle, ensure_ascii=False, indent=2)

    return routes


def download_static_feed() -> None:
    if STATIC_ZIP.exists():
        return

    print(f"Downloading static GTFS route table from {STATIC_GTFS_URL}")
    request = urllib.request.Request(STATIC_GTFS_URL, headers={"User-Agent": "UestraLinienblick/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        with STATIC_ZIP.open("wb") as handle:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)


def read_agencies(archive: zipfile.ZipFile) -> dict[str, str]:
    with archive.open("agency.txt") as agency_file:
        rows = csv.DictReader((line.decode("utf-8-sig") for line in agency_file))
        return {
            row.get("agency_id", "").strip(): row.get("agency_name", "").strip()
            for row in rows
            if row.get("agency_id")
        }


def fetch_realtime_feed() -> gtfs_realtime_pb2.FeedMessage:
    request = urllib.request.Request(REALTIME_URL, headers={"User-Agent": "UestraLinienblick/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read()

    feed = gtfs_realtime_pb2.FeedMessage()
    feed.ParseFromString(data)
    return feed


def lines_for_alert(alert: gtfs_realtime_pb2.Alert, routes: dict[str, RouteInfo], *texts: str) -> set[str]:
    lines: set[str] = set()
    for entity in alert.informed_entity:
        route_id = entity.route_id
        if route_id in routes:
            lines.add(normalize_line(routes[route_id].short_name))

    if lines:
        return {line for line in lines if line}

    # Fallback for agency-wide Hannover alerts whose text contains "Linie 7" etc.
    text = " ".join(texts)
    if not text_matches(text, TEXT_CONTEXT_MATCH):
        return set()

    for match in re.findall(r"\b(?:Linie|Linien)\s+([A-Za-z]?\d{1,3}[A-Za-z]?)\b", text, flags=re.IGNORECASE):
        lines.add(normalize_line(match))

    return {line for line in lines if line}


def severity_for(alert: gtfs_realtime_pb2.Alert, title: str, detail: str) -> str:
    text = f"{title} {detail}".lower()
    if any(word in text for word in ["ausfall", "entfällt", "entfallen", "cancel"]):
        return "cancellation"
    if any(word in text for word in ["störung", "gesperrt", "sperrung", "ersatzverkehr", "umleitung"]):
        return "disruption"
    if any(word in text for word in ["verspät", "delay"]):
        return "delay"

    if alert.effect in {
        gtfs_realtime_pb2.Alert.NO_SERVICE,
        gtfs_realtime_pb2.Alert.REDUCED_SERVICE,
        gtfs_realtime_pb2.Alert.SIGNIFICANT_DELAYS,
        gtfs_realtime_pb2.Alert.DETOUR,
    }:
        return "disruption"

    return "info"


def translated_text(value: gtfs_realtime_pb2.TranslatedString) -> str:
    if not value.translation:
        return ""

    for language in ("de", "de-DE", ""):
        for translation in value.translation:
            if translation.language == language:
                return translation.text.strip()

    return value.translation[0].text.strip()


def parse_lines(value: str) -> set[str]:
    return {
        normalize_line(part)
        for part in re.split(r"[,;\s]+", value)
        if normalize_line(part)
    }


def normalize_line(value: str) -> str:
    return value.strip().upper().replace(" ", "")


def text_matches(text: str, needles: Iterable[str]) -> bool:
    normalized = text.lower()
    return any(needle in normalized for needle in needles)


def digest(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:12]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


if __name__ == "__main__":
    main()
