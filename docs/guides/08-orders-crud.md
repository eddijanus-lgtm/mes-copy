# 08 - Auftragsverwaltung

_Status: Phase 2.1 complete and verified - 2026-07-22_

## Funktionsumfang

Die Seite `/orders` stellt das vollständige CRUD für Produktionsaufträge bereit:

- Aufträge mit Name, Station, Operation, Priorität, Menge, Start und Zieltermin anlegen
- Stammdaten, Status und Fertigmenge bearbeiten
- nach Name oder Operation suchen und nach Status filtern
- Fortschritt und Status in der Übersicht verfolgen
- Aufträge nach Bestätigung löschen

## Berechtigungen

| Aktion | Viewer | Operator | Admin |
|---|---:|---:|---:|
| Anzeigen und filtern | ja | ja | ja |
| Anlegen und bearbeiten | nein | ja | ja |
| Löschen | nein | nein | ja |

Das Backend setzt dieselben Regeln unabhängig von der Sichtbarkeit der Buttons durch.

## Datenintegrität

- `completed_quantity` darf `quantity` nicht überschreiten.
- `quantity` darf nicht unter die bereits fertiggestellte Menge reduziert werden.
- Ein Auftrag mit zugeordneten Carriern kann nicht gelöscht werden.
- Beim Löschen eines unbenutzten Auftrags werden vorhandene Routenschrittdefinitionen entfernt.

## Verifikation

Der Zyklus `POST /api/v1/orders` -> `PATCH /api/v1/orders/:id` -> `DELETE /api/v1/orders/:id` wurde gegen die lokale PostgreSQL-Datenbank erfolgreich geprüft. Die Löschung des Demo-Auftrags mit zugeordneten Carriern wurde erwartungsgemäß mit HTTP 400 abgelehnt.
