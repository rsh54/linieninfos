# Linienblick PWA

Diese Version laeuft als Web-App auf normalem Webspace, z. B. all-inkl. Sie braucht keinen Apple Developer Account, kein TestFlight und kein Xcode.

Linienblick ist ein privates, inoffizielles Open-Source-Projekt. Es gibt keine Anmeldung und kein Tracking.

## Nutzen und Testen

Die App zeigt aktuelle Abfahrten fuer eine gewaehlte Haltestelle und Verkehrsmeldungen (nur Hannover) fuer die dort passenden Linien. Beim Wechsel der Haltestelle wird zuerst eine Trefferliste angezeigt. Nach Auswahl des passenden Treffers werden die Linien automatisch neu ermittelt. Nicht benoetigte Linien lassen sich in der Auswahl entfernen.

Aktuell enthalten:

- Haltestellensuche ueber EFA mit Trefferliste und `Mehr`-Button
- Abfahrten mit Echtzeit-Prognose, Verspaetung in Klammern und Gleis-/Steiganzeige
- numerische Bahn-Gleise als `Gleis 10`, `Gleis 11` usw.; Steige wie `SB1` oder `UB3` bleiben unveraendert
- DB-Fernverkehr mit lesbarer Linienanzeige, z. B. `ICE859` oder `IC2049`
- Haltestellen-Favoriten mit gespeicherter Linienauswahl
- Button `Linien neu laden`, um alle Linien der aktuellen Haltestelle frisch aus EFA zu uebernehmen
- Verkehrsmeldungen nur fuer Hannover, passend zu den ausgewaehlten Linien

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

## Auf Android installieren

1. Chrome oeffnen.
2. Die URL der PWA oeffnen.
3. Drei-Punkte-Menue oeffnen.
4. `Zum Startbildschirm hinzufuegen` oder `App installieren` waehlen.
5. Bestaetigen.

## Dateien

- `index.html` - App-Oberflaeche
- `app.js` - Linien, Abfahrtshaltestelle, Laden, Darstellung
- `style.css` - Layout
- `api.php` - all-inkl/PHP-Proxy fuer EFA-Abfahrten und Verkehrsmeldungen
- `manifest.json` und `icons/` - Homescreen-App
- `sw.js` - Service Worker fuer App-Shell-Cache
- `PRIVACY.md` - Datenschutz- und Transparenzhinweise
- `LICENSE` - Open-Source-Lizenz

## Hinweise

`api.php` ruft EFA-Abfahrten und Verkehrsmeldungen (nur Hannover) serverseitig ab und gibt JSON zurueck. Das vermeidet CORS-Probleme im iPhone-Safari.

Die App ist ein privates, inoffizielles Projekt. Fuer verbindliche Informationen gelten die offiziellen Angebote der jeweiligen Verkehrsunternehmen.

## Abfahrten

Die App zeigt Abfahrten vor den Meldungen. Die Haltestelle wird lokal im Browser gespeichert. Bei der Eingabe einer Haltestelle zeigt die App eine Trefferliste an. Nach Auswahl eines Treffers wird die konkrete EFA-Haltestelle gespeichert.

Die angezeigte Zeit basiert auf der EFA-Prognose, wenn Echtzeitdaten vorhanden sind. Eine Verspaetung wie `(+5)` bedeutet: Die angezeigte Abfahrt ist bereits die prognostizierte Abfahrt inklusive Verspaetung; `(+5)` erklaert nur die Abweichung vom Plan.

Bei Bahnhofshaltestellen koennen auch Bahnlinien erscheinen. S-Bahn und Regionalverkehr werden wie von EFA geliefert angezeigt, z. B. `S3`, `RE30` oder `RE60`. Reine Fernverkehrsnummern werden anhand der EFA-Produktdaten als `ICE...` oder `IC...` dargestellt.

## Favoriten

Mit `Favorit speichern` wird die aktuelle Haltestelle zusammen mit der aktuellen Linienauswahl lokal im Browser gespeichert. Beim Antippen eines Favoriten werden Haltestelle und Linien wiederhergestellt.

Wenn bei derselben Haltestelle die Linienauswahl geaendert wurde, erscheint `Favorit aktualisieren`. Damit wird der gespeicherte Favorit mit der neuen Linienauswahl ersetzt.

`Linien neu laden` holt alle aktuell verfuegbaren Linien der ausgewaehlten Haltestelle neu aus EFA. Gespeicherte Favoriten werden dadurch nicht automatisch ueberschrieben; bei Abweichungen kann der Favorit anschliessend aktualisiert werden.

Beispiel-Endpunkt:

```text
api.php?type=departures&stop=Paracelsusweg&lines=3,7,9,10
```

Die Trefferliste wird in der App seitenweise angezeigt; weitere Treffer erscheinen ueber `Mehr`.
