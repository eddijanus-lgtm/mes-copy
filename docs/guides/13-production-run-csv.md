# Produktionslauf-CSV

## Zweck und Abgrenzung

Jeder abgeschlossene Auftrag besitzt einen herunterladbaren Produktionslauf:

```http
GET /api/v1/orders/{orderId}/production-log.csv
Authorization: Bearer <token>
```

Alle abgeschlossenen Aufträge können zusätzlich gemeinsam exportiert werden:

```http
GET /api/v1/orders/production-logs.csv
Authorization: Bearer <token>
```

Der Sammel-Export verwendet dasselbe Schema und schreibt alle `RUN_SUMMARY`- und `STATION_EXECUTION`-Datensätze unter einer gemeinsamen Kopfzeile. Laufende, geplante oder abgebrochene Aufträge sind nicht enthalten, weil für sie kein abgeschlossener Produktionslauf vorliegt.

Der Export ist für das FISI-Hausmesseprojekt als nachvollziehbarer MES-Demonstrationsnachweis ausgelegt. Er ist **keine IEC-/ISO-Zertifizierung**. Die Feldbegriffe orientieren sich an IEC 62264 / ISA-95, ohne das vollständige Informationsmodell der Norm umzusetzen.

## Formatregeln

- CSV gemäß RFC 4180 mit Komma als Trennzeichen und CRLF-Zeilenenden
- UTF-8 mit BOM für kompatibles Öffnen in Microsoft Excel
- Zeitstempel nach ISO 8601 in UTC
- Maschinenlesbare, stabile Spaltennamen in `snake_case`
- Doppelte Anführungszeichen werden RFC-4180-konform maskiert
- Schutz vor CSV-/Excel-Formelinjektion für Textwerte, die mit `=`, `+`, `-` oder `@` beginnen
- `schema_name=WARA_MES_PRODUCTION_RUN` und `schema_version=1.0` für spätere Schemaänderungen

## Datensätze

Der Export enthält:

1. `RUN_SUMMARY`: Zusammenfassung von Auftrag, Menge, Laufzeit, Carriern und Qualitätsstatus.
2. `STATION_EXECUTION`: Je persistierter stMES-Stationsausführung eine Zeile mit Station, Carrier, Ergebnis und Zeitmessungen.

Wichtige Feldgruppen:

| Gruppe | Felder |
|---|---|
| Schema | `schema_name`, `schema_version`, `record_type`, `exported_at_utc` |
| Auftrag | `production_order_id`, `production_order_name`, `order_status`, `operation` |
| Menge und Zeit | `planned_quantity`, `produced_quantity`, `production_start_utc`, `production_end_utc`, `production_duration_ms` |
| Carrier und Route | `carrier_numbers`, `carrier_number`, `route_step_no`, `operation_no` |
| Ressource | `work_unit_id`, `work_unit_name` |
| Ausführung | `execution_status`, `result_code`, `result_class` |
| Stationszeiten | `requested_at_utc`, `responded_at_utc`, `acknowledged_at_utc`, `station_cycle_time_ms`, `acknowledgement_delay_ms` |
| Prozessdaten | `route_parameters_json`, `request_payload_json`, `response_payload_json`, `error_message` |
| Qualität | `quality_status`, `quality_note` |

## Datenquelle und Nachvollziehbarkeit

Beim Abschluss eines Auftrags wird ein Produktions-Snapshot in `order_production_logs` gespeichert. Der Download wird aus diesem Snapshot erzeugt. Dadurch basiert der Export auf den zum Abschluss dokumentierten Auftrags-, Routen- und Handshake-Daten und benötigt keine separat verwaltete CSV-Datei.

Die aktuelle Qualitätsaussage `not_evaluated` bedeutet ausdrücklich: Der erfolgreiche Routenablauf ist dokumentiert, aber es existiert noch kein vollständiger Soll-Ist-Qualitätsvergleich mit Messwertgrenzen. Für einen echten Industrieeinsatz wären zusätzlich unter anderem Aufbewahrungsregeln, Manipulationsschutz, Zeitsynchronisationsnachweise, Produktgenealogie und freigegebene Qualitätsmerkmale erforderlich.
