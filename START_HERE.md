# So bekommst du die App lauffähig aufs iPhone

## Was du jetzt hast

Das Projekt ist eine iPhone-App für Xcode. Sie ist noch nicht im App Store und noch nicht als fertige `.ipa` gebaut. Du kannst sie aber mit Xcode direkt auf deinem iPhone oder im iPhone-Simulator starten.

Ohne echte Datenquelle zeigt sie Beispieldaten. Für echte ÜSTRA-Meldungen brauchen wir als nächsten Schritt noch einen kleinen Daten-Endpunkt, am besten über Home Assistant oder einen Mini-Proxy.

## Variante A: Schnell am Mac testen

1. Installiere/öffne Xcode aus dem Mac App Store.
2. Öffne diese Datei in Xcode:

   `UestraLinienblick.xcodeproj`

3. Oben in Xcode als Ziel einen iPhone-Simulator auswählen.
4. Auf den Run-Button drücken.

Dann startet die App mit Beispieldaten.

## Variante B: Auf deinem echten iPhone testen

1. iPhone per Kabel an den Mac anschließen.
2. Xcode öffnen und `UestraLinienblick.xcodeproj` öffnen.
3. Oben dein iPhone als Ziel auswählen.
4. In Xcode unter `Signing & Capabilities` deine Apple-ID bzw. dein Team auswählen.
5. Run drücken.
6. Falls iOS die App blockiert: Auf dem iPhone unter Einstellungen > Allgemein > VPN & Geräteverwaltung dem Entwicklerprofil vertrauen.

Ein kostenloser Apple-Developer-Account reicht meist zum lokalen Testen. Für App-Store-Verteilung braucht man ein bezahltes Apple-Developer-Konto.

## Was aktuell noch fehlt

Die App kann eine JSON-URL laden. Für echte Meldungen liegt jetzt ein kleiner Proxy im Ordner `realtime-proxy`.

Die App erwartet Daten in diesem Format:

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

## Echtzeitdaten starten

Im Terminal:

```bash
cd realtime-proxy
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python uestra_realtime_proxy.py
```

Dann in der App unter Einstellungen als Datenquelle eintragen:

```text
http://127.0.0.1:8765/alerts
```

Wenn die App auf einem echten iPhone läuft, nimm statt `127.0.0.1` die IP-Adresse des Macs im WLAN.
