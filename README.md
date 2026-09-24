# Linienblick PWA

Diese Version laeuft als Web-App auf normalem Webspace, z. B. all-inkl. Sie braucht keinen Apple Developer Account, kein TestFlight und kein Xcode.

Linienblick ist ein privates, inoffizielles Open-Source-Projekt. Es gibt keine Anmeldung, kein Tracking und keine offiziellen Garantien der UESTRA.

## Nutzen und Testen

Die App zeigt aktuelle Abfahrten fuer eine gewaehlte Haltestelle und Verkehrsmeldungen/Stoerungen fuer die dort passenden Linien. Beim Wechsel der Haltestelle werden die Linien automatisch neu ermittelt. Nicht benoetigte Linien lassen sich in der Auswahl entfernen.

Oeffentliche Test-URL:

```text
https://nas1.de/linienblick/
```

## Hochladen

1. Auf dem Webspace einen Ordner anlegen, z. B. `linienblick`.
2. Den kompletten Inhalt dieses Ordners hochladen.
3. HTTPS fuer die Domain/Subdomain aktivieren.
4. Im Browser oeffnen:

   `https://deine-domain.de/linienblick/`

## Auf dem iPhone installieren

1. Safari oeffnen.
2. Die URL der PWA oeffnen.
3. Teilen-Button antippen.
4. `Zum Home-Bildschirm` waehlen.

## Dateien

- `index.html` - App-Oberflaeche
- `app.js` - Linien, Abfahrtshaltestelle, Laden, Darstellung
- `style.css` - Layout
- `api.php` - all-inkl/PHP-Proxy fuer UESTRA-Meldungen
- `manifest.json` und `icons/` - Homescreen-App
- `sw.js` - Service Worker fuer App-Shell-Cache
- `PRIVACY.md` - Datenschutz- und Transparenzhinweise
- `LICENSE` - Open-Source-Lizenz

## Hinweise

`api.php` ruft UESTRA-Webmeldungen und EFA-Abfahrten serverseitig ab und gibt JSON zurueck. Das vermeidet CORS-Probleme im iPhone-Safari.

Die App ist keine offizielle App der UESTRA. Fuer verbindliche Informationen gelten die offiziellen Angebote der UESTRA und der jeweiligen Verkehrsunternehmen.

## Abfahrten

Die App zeigt Abfahrten vor den Meldungen. Die Haltestelle wird lokal im Browser gespeichert. Beispiel-Endpunkt:

```text
api.php?type=departures&stop=Paracelsusweg&lines=3,7,9,10
```

Wenn kein Ort per Komma angegeben ist, ergaenzt die App automatisch `, Hannover`. `Paracelsusweg`, `Paracelsusweg, Hannover` und `Hannover, Paracelsusweg` sind dadurch zulaessige Eingaben.
