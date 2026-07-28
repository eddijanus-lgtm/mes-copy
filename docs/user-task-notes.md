## Kleine Fixes

- Bei Prozessdaten den Button "Filter zurücksetzen" auf die Größe der Max-/Min-Felder anpassen.
- "Min Value" und "Max Value" in "Min" und "Max" umbenennen.
- Alle Aufträge in der Datenbank löschen; die Aufträge werden neu aufgebaut.

## Routenplanung

Die Routenplanung soll intuitiv und einfach sein. Auf der Seite gibt es eine Auflistung und den Button "Neue Route anlegen". Dieser öffnet ein Fenster im Stil der Website mit folgenden Feldern:

- Routenname zur Wiedererkennung
- Routen-ID als Identifikator für spätere Referenzen
- Maschinen-ID zur Auswahl der verwendeten Maschine

Darunter befindet sich eine Liste mit Plus- und Minus-Aktion. Plus fügt eine zunächst "Neue Stationsaktion" genannte Aktion hinzu. Der Name kann wie in Excel direkt im Feld geändert werden. Danach wird eine Station der ausgewählten Maschine und eine dort verfügbare Aktion ausgewählt, beispielsweise "Platziere 5 Kugeln im Glas". Rechts entfernt ein X-Button die Stationsaktion.

Die Reihenfolge muss erhalten bleiben. Aktionen für Station 1, Station 2 und erneut Station 1 bedeuten: Carrier fährt zu Station 1 und führt die Aktion aus, danach zu Station 2 und danach wieder zu Station 1.
