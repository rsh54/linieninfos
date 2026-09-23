# ÜSTRA-Proxy

Dieser kleine Proxy liest aktuelle ÜSTRA-Verkehrsmeldungen von `uestra.de` und liefert sie im JSON-Format der iPhone-App aus. Das ist der schnelle Standardweg und lädt keinen deutschlandweiten GTFS-Feed.

## Starten

```bash
cd realtime-proxy
python3 -m venv .venv
source .venv/bin/activate
python uestra_realtime_proxy.py
```

Dann im Browser testen:

```text
http://127.0.0.1:8765/alerts?lines=3,7,10
```

Der Proxy filtert anhand der in der App ausgewählten Linien. Beispiel: `?lines=3,7,10`.

## In der iPhone-App

Im Simulator kann als Datenquelle eingetragen werden:

```text
http://127.0.0.1:8765/alerts
```

Auf einem echten iPhone muss statt `127.0.0.1` die IP-Adresse des Macs im lokalen Netzwerk verwendet werden, zum Beispiel:

```text
http://192.168.178.42:8765/alerts
```

Die App hängt die aktuell ausgewählten Linien automatisch als `?lines=...` an.

## Optionaler GTFS-Modus

Der alte GTFS-Realtime-Modus ist noch vorhanden, aber bewusst nicht Standard, weil er einen großen deutschlandweiten Feed braucht. Falls du ihn testen willst:

```bash
pip install -r requirements.txt
UESTRA_SOURCE=gtfs python uestra_realtime_proxy.py
```

## Quellen

- ÜSTRA Meldungen: `https://www.uestra.de/aktuelles/neuigkeiten/aktuelle-meldungen/`
- Optional GTFS-Realtime: `https://realtime.gtfs.de/realtime-free.pb`
- Optional Static GTFS: `https://download.gtfs.de/germany/nv_free/latest.zip`

Die gtfs.de-Daten stehen unter Creative-Commons-Lizenz und werden ohne Garantie auf Vollständigkeit oder Korrektheit bereitgestellt.
