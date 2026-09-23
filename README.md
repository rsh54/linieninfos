# ÜSTRA Linienblick

Kleine SwiftUI-iPhone-App zum Anzeigen von ÜSTRA-Meldungen für ausgewählte Linien. Die App nutzt keine Push-Benachrichtigungen und keine SMS-Funktion. Sie lädt die Daten direkt vom iPhone beim Öffnen, per Aktualisieren-Button oder per Pull-to-refresh.

Wenn du nicht weißt, wo du anfangen sollst: Lies zuerst `START_HERE.md`.

## Öffnen

1. Öffne `UestraLinienblick.xcodeproj` in Xcode.
2. Wähle dein iPhone oder einen Simulator.
3. Starte die App mit Run.

## Datenquelle

In der App kann unter Einstellungen eine JSON-URL eingetragen werden. Erwartet wird entweder ein Array:

```json
[
  {
    "id": "alert-1",
    "line": "7",
    "title": "Störung",
    "detail": "Beschreibung",
    "severity": "disruption",
    "updatedAt": "2026-09-23T08:00:00Z",
    "url": "https://www.uestra.de/"
  }
]
```

oder ein Objekt:

```json
{
  "alerts": []
}
```

Erlaubte `severity`-Werte sind `info`, `delay`, `disruption` und `cancellation`.

Ohne URL zeigt die App Beispieldaten. Für echte Daten empfiehlt sich ein kleiner Home-Assistant- oder Server-Proxy, der die ÜSTRA/GVH-Meldungen in dieses Format bringt.

Zum schnellen Testen liegt `sample-alerts.json` im Projektordner.

## ÜSTRA-Daten

Standardmäßig lädt die App direkt von `uestra.de`. Es muss kein Mac, Home Assistant oder Proxy laufen.

Der Ordner `realtime-proxy` ist nur noch optional, falls du die Datenquelle lokal debuggen oder später anders bereitstellen willst.

## Optionaler Proxy

Der Proxy liest aktuelle ÜSTRA-Verkehrsmeldungen von uestra.de und liefert sie als App-JSON.

```bash
cd realtime-proxy
python3 -m venv .venv
source .venv/bin/activate
python uestra_realtime_proxy.py
```

Danach in der App als Datenquelle eintragen:

```text
http://127.0.0.1:8765/alerts
```

Im iPhone-Simulator zeigt `127.0.0.1` auf den Mac. Auf einem echten iPhone brauchst du die lokale IP-Adresse des Macs.
