# ÜSTRA Linienblick

Kleine SwiftUI-iPhone-App zum Anzeigen von ÜSTRA/GVH-Meldungen für ausgewählte Linien. Die App nutzt keine Push-Benachrichtigungen und keine SMS-Funktion. Sie lädt die Daten beim Öffnen, per Aktualisieren-Button oder per Pull-to-refresh.

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
