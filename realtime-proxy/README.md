# Echtzeit-Proxy

Dieser kleine Proxy wandelt GTFS-Realtime Service Alerts von `gtfs.de` in das JSON-Format der iPhone-App um.

## Starten

```bash
cd realtime-proxy
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python uestra_realtime_proxy.py
```

Dann im Browser testen:

```text
http://127.0.0.1:8765/alerts?lines=3,7,10
```

Beim ersten Request lädt der Proxy einmal den statischen GTFS-Nahverkehrsfeed, um `route_id` auf Liniennummern und GVH/ÜSTRA/Hannover-Agenturen abbilden zu können. Das kann dauern und braucht Speicherplatz im Ordner `.cache`.

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

## Quellen

- Realtime: `https://realtime.gtfs.de/realtime-free.pb`
- Static GTFS: `https://download.gtfs.de/germany/nv_free/latest.zip`

Die gtfs.de-Daten stehen unter Creative-Commons-Lizenz und werden ohne Garantie auf Vollständigkeit oder Korrektheit bereitgestellt.
