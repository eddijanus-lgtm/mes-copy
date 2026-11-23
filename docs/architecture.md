# Architektur

## System-Übersicht

```
┌──────────────┐     OPC UA      ┌──────────────┐       MQTT       ┌──────────────┐
│  Maschinen   │ ◄────────────► │              │ ◄─────────────► │  Broker /    │
│  (PLCs, SPS) │                │ Shopfloor GW │                 │  Sensoren    │
└──────────────┘                │ ┌──────────┐ │                 └──────────────┘
                                │ │ OPC UA   │ │
                                │ │ Client   │ │
                                │ └──────────┘ │
                                │              │
                                │ ┌──────────┐ │
                                │ │ MQTT     │ │
                                │ │ Client   │ │
                                │ └──────────┘ │
                                └──────────────┘
                                        │
                            ┌───────────▼──────────┐
                            │  TimescaleDB         │
                            │  (PostgreSQL + TS)    │
                            └──────────────────────┘
```

## Module-Übersicht

| Modul | Path | Aufgabe |
|-------|------|---------|
| **Alarms** | `src/alarms/` | Alarm-Verwaltung: Erstellen, Query, Acknowledge, Löschen |
| **Machines** | `src/machines/` | Maschinen-Registry: Online-Status, Heartbeat, Location |
| **Orders** | `src/orders/` | Produktionsaufträge: CRUD, Fortschritt-tracking |
| **Traces** | `src/traces/` | Trace-Daten: Prozess-Dokumentation pro Auftrag/Maschine |
| **DataCollection** | `src/data-collection/` | Rohdaten-Sammlung: Zeitreihendaten von Maschinen |
| **Shopfloor Gateway** | `src/opcua/` | OPC-UA Client, MQTT Adapter, stMES-Vermittlung, Health-Endpoints |

## Datenfluss

1. **SHOPFLOOR-EINGANG**: OPC-UA und MQTT liefern SPS-, Stations- und Webshop-Ereignisse.
2. **GATEWAY-VERMITTLUNG**: Das Shopfloor Gateway normalisiert Protokolldaten und gibt stMES-Anfragen an das MES weiter.
3. **MES-ENTSCHEIDUNG**: RoutingService prueft Auftrag, Carrier und erwarteten Routenschritt.
4. **SHOPFLOOR-ANTWORT**: Das Gateway schreibt Auftrags-, Operations- und Parameterdaten zurueck an die SPS-Nodes.
5. **PERSISTENZ UND VISUALISIERUNG**: TimescaleDB speichert relationale Produktionsdaten und Zeitreihendaten; React zeigt Live-Daten und Verlauf.

## Zeitreihen-Architektur

Phase 3 migriert `data_points` von einer normalen PostgreSQL-Tabelle zu einer TimescaleDB-Hypertable:

- Hypertable: `data_points`, partitioniert nach `timestamp`
- Chunking: tägliche Chunks (`INTERVAL '1 day'`)
- Compression: aktiviert, Segmentierung nach `machine_id,node_id`, Kompression ab 7 Tagen
- Retention: Rohdaten werden nach 90 Tagen automatisch entfernt
- Continuous Aggregate: `data_points_1min` berechnet 1-Minuten-Werte pro Maschine und Node

Das relationale Datenmodell bleibt PostgreSQL-kompatibel. NestJS/TypeORM schreibt weiter über `DataPointEntity`; TimescaleDB übernimmt Partitionierung, Compression und Retention in der Datenbank.

## Schlüsselkomponenten

### OPC UA Service (`src/opcua/opcua.service.ts`)
- Verbindet sich mit einem OPC UA Server
- Liest Nodes periodisch aus
- Reconnect-Logik bei Verbindungsabbrüchen

### MqttGatewayService (`src/opcua/mqtt-gateway.service.ts`)
- Subscribt auf MQTT-Themes für Maschinen-Events
- Publish von aggregierten Daten

### DataCollection Service (`src/data-collection/data-collection.service.ts`)
- Speichert Zeitreihendaten (DataPoints) pro Maschine
- Bietet bulk-write API für effiziente Inserts
- Nutzt `data_points` als TimescaleDB-Hypertable und kann historische Trends über `data_points_1min` abfragen

### Shopfloor Gateway Controller (`src/opcua/shopfloor-gateway.controller.ts`)
- Health-Check Endpoints unter `/api/shopfloor/*`
- OPC-UA-/MQTT-Status-Anzeige
- Direkte erlaubte Lesezugriffe auf OPC-UA-Nodes
- Historie fuer stMES-Handshakes, MQTT-Nachrichten und Webshop-Auftraege
# Demo Carrier- und Stationsrouting

> Der derzeitige stMES-Nodevertrag ist eine lokale Demo-Annahme und nicht aus einer echten UDT-Dokumentation abgeleitet.

Das Demo-Modell trennt:

- `MachineEntity` als Station/Resource mit OPC-UA-Konfiguration
- `CarrierEntity` als physischer, wiederverwendbarer Werkstückträger
- `OrderEntity` als Produktionsauftrag
- `OrderRouteStepEntity` als normalisierter Workplan
- `StMesHandshakeEntity` als dauerhaftes Request-/Response-Journal

OPC-UA-Subscriptions erkennen `xStart` und Prozessabschluss pro Station. `RoutingService` sperrt Carrier transaktional, prüft den erwarteten Routenschritt und liefert die Demo-Antwort. Stationen werden parallel verarbeitet; pro Station verhindert eine serielle Sperre doppelte gleichzeitige Bearbeitung.

Der vollständige erfundene Vertrag und alle vor Produktion zu ersetzenden Annahmen stehen in `docs/guides/07-stmes-demo-contract.md`.
