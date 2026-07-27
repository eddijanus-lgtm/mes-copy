# Maschinenprofil-Vertrag (Machine Profile Contract)

## 1. Zweck

Das MES soll keine festen Maschinen-, Stations-, Namespace- oder Signalstrukturen voraussetzen. Stattdessen beschreiben Maschinenprofile die Eigenschaften einer Maschine deklarativ in einer JSON-Datei. Dadurch können neue Maschinen hinzugefügt werden, ohne die MES-Fachlogik oder den Adapter-Code zu ändern.

## 2. Stand des ursprünglichen MA-02-Arbeitspakets (historisch)

- **MA-01** hat den neutralen `MachineAdapter`-Vertrag eingeführt: ein Interface, das MES-Fachlogik von konkreten Maschinen entkoppelt.
- **MA-02** definiert nun den konfigurierbaren Maschinenprofil-Vertrag: Typdefinitionen, JSON-Profile, ein JSON-Schema und isolierte Vertragstests.
- Der heutige Runtime-Stand ist in `machine-adapter-contract.md` dokumentiert:
  `MachineProfileService`, `OpcUaMachineAdapter`, Handshake und Recovery sind
  produktiv integriert.

## 3. Profilstruktur

Ein Maschinenprofil (`MachineProfile`) besteht aus folgenden Hauptbereichen:

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| `profileVersion` | string | Version des Profilformats |
| `machineId` | string | Eindeutige ID der Maschine |
| `displayName` | string | Anzeigename |
| `description` | string (optional) | Beschreibung |
| `transport` | enum | Nur `opcua` |
| `operatingMode` | enum | `observe`, `validate` oder `control` |
| `connection` | object | Verbindungsparameter (Endpoint, Security, Auth, Reconnect) |
| `namespaces` | array | Liste der Namespace-Definitionen |
| `routing` | object (bei gesteuertem Routing erforderlich) | Enthält `terminalResourceId`, den maschinenspezifischen Folgeressourcen-Wert am Routenende |
| `stations` | array | Liste der Stationen mit eindeutiger `resourceId`, verpflichtendem `resourceType`, optionalem Routing und Signalen |
| `orderParameterDefinitions` | array (optional) | Mapping externer Auftragsfelder auf neutrale Parameter- und Signalschlüssel |
| `resultCodes` | object (optional) | Maschinenspezifische Resultcodes für die Anzeige |
| `metadata` | object (optional) | Hersteller, Modell, Version |

### connection

Enthält `endpointUrl`, `applicationName`, `security` (Mode, Policy, Zertifikatsreferenzen), `authentication` (Typ, Env-Referenzen), Timeouts und `reconnect`-Konfiguration.

### routing

`terminalResourceId` ist der Wert, den der Adapter bei einem akzeptierten
letzten Routenschritt an die Maschine schreibt. Das MES nimmt nicht an, dass
`0` diese Bedeutung hat; jedes steuernde Maschinenprofil legt den Wert selbst
fest.

### signals

Jede Station besitzt ein Array von Signalen. Ein Signal beschreibt einen logischen Datenpunkt der Maschine mit den Feldern: `key`, `role`, `direction`, `namespace`, `identifier`, `dataType`, `access`, `required` sowie optionalem `description`, `scaling` und `metadata`.

## 4. Namespace-Auflösung

Ein zentraler Entwurfsentscheid: Profile speichern **Namespace-URIs**, keine festen Namespace-Indizes wie `ns=1`.

- Der Namespace-Index eines OPC-UA-Servers kann sich durch Neukonfiguration ändern.
- Ein späterer Adapter muss beim Verbindungsaufbau die URI gegen die Namespace-Tabelle des Servers auflösen.
- Der zur Laufzeit ermittelte Index ist flüchtig und darf nicht dauerhaft im Profil gespeichert werden.
- Signale referenzieren Namespace-Schlüssel aus der Profil-Root (`namespaces[]`), nicht direkt einen Index.

## 5. Signalmodell

Signale sind neutral modelliert:

- **key**: logischer Schlüssel innerhalb der Station
- **role**: fachliche Rolle (`workRequest`, `carrierId`, `processCompleted`, ...)
- **direction**: Datenrichtung (`machineToMes` oder `mesToMachine`)
- **namespace**: Verweis auf einen definierten Namespace-Schlüssel
- **identifier**: maschinenlesbarer Bezeichner (einfacher String, keine vollständige NodeID)
- **dataType**: erwarteter OPC-UA-Datentyp
- **access**: Zugriffsart (`read`, `write`, `readWrite`)
- **required**: Pflichtsignal oder optional
- **scaling**: optionale lineare Skalierung (Faktor, Offset)

Konkrete Maschinenbezeichnungen gehören nur in Profilwerte, nicht in die MES-Fachlogik oder die neutralen Contract-Typen. Die MES-Fachlogik arbeitet ausschließlich gegen Rollen und logische Schlüssel.

Für OEE liefern Produktionsstationen die Rollen `idealCycleTimeMs`,
`goodCount` und `rejectCount`. Die Zähler sind kumulative Maschinenzähler.
Das MES speichert nur Änderungen, berücksichtigt Zähler-Resets und berechnet
Performance und Produktqualität aus den Differenzen im angefragten Zeitraum.
Fehlt eine Rolle oder gibt es keinen abgeschlossenen Zyklus, bleibt OEE
explizit nicht verfügbar.

## 6. Security und Secrets

- Profile enthalten keine echten Passwörter, Private Keys oder Zertifikatsinhalte.
- Zugangsdaten werden ausschließlich über Umgebungsvariablennamen referenziert (`passwordEnv`, `usernameEnv`, `privateKeyPathEnv`, `certificatePathEnv`).
- Security Mode und Policy sind deklarativ (`None`, `Sign`, `SignAndEncrypt`).
- Zertifikats- und Key-Pfade werden indirekt referenziert, sodass die tatsächlichen Werte zur Laufzeit aus der Umgebung geladen werden.

## 7. Enthaltene Profile

### test-machines/opcua-simulator/profile.json

- Konkretes lokales Beispielprofil für den OPC-UA-Simulator
- `operatingMode: control`
- Anonyme Authentifizierung
- Drei Stationen: `station-a`, `station-b`, `station-c`
- Vollständiger Handshake, Routingparameter, Prozessabschluss, Telemetrie und optionale Bedienkommandos werden über Signalrollen beschrieben.
- Ideale Zykluszeit sowie Gut- und Ausschusszähler kommen als echte
  OPC-UA-Signale aus dem externen Simulator.

### wara.machine.template.json

- Vorlage für die reale Lernfabrik (WARA)
- Enthält ausschließlich Platzhalter (`YOUR_MACHINE_ID`, `YOUR_ENDPOINT`, ...)
- `operatingMode: validate`, bis der reale SPS-Vertrag einschließlich
  Resultcodes bestätigt wurde
- `username`-Authentifizierung über Env-Referenzen (`OPCUA_USERNAME`, `OPCUA_PASSWORD`)
- Keine echten Zugangsdaten
- Keine bestätigten Node-Identifier (müssen durch reale Werte ersetzt werden)

## 8. JSON Schema

`config/machines/machine-profile.schema.json`:

- Entspricht JSON Schema Draft 2020-12
- Definiert strukturelle Einschränkungen (required-Felder, Typen, minItems, minLength)
- Enthält vollständige Enumerationen für Transport, OperatingMode, Security, Authentication, DataType, Access, Direction und Signalrollen
- Nutzt `$defs` für wiederverwendbare Komponenten (connection, security, authentication, reconnect, namespace, station, signal, scaling, envReference)
- Setzt `additionalProperties: false` auf allen strukturierten Objekten (außer metadata)
- Die Runtime validiert Struktur und Semantik zusätzlich beim Start und bricht bei widersprüchlichen Profilen verständlich ab.

## 9. Vertragstests

`src/machines/profiles/machine-profile.contract.spec.ts` enthält 47 isolierte Tests:

- JSON-Ladbarkeit aller drei Profildateien
- Simulator-Grundstruktur (Version, ID, Modus, Transport, Stationen)
- WARA-Vorlagenstruktur (Platzhalter, control-Modus, Env-Referenzen)
- Namespace-Regeln (kein `ns=`, key+uri vorhanden, Signal-Namespace-Verweise)
- Stations- und Signalstruktur (Pflichtfelder, Eindeutigkeit, minItems)
- Keine vollständigen NodeIDs in Identifiern
- Keine eingebetteten Secrets
- Schema-Grundstruktur (Draft 2020-12, $defs, required, additionalProperties)
- Enum-Konsistenz zwischen Profilwerten und Schema-Enums
- Simulator-Signalumfang (9 Signale, alle erwarteten Rollen)

## 10. Runtime-Status

`MachineProfileService`, `OpcUaService`, `OpcUaMachineAdapter`, Handshake,
Recovery, Routing und Dashboard verwenden das aktive Profil produktiv. Beim
Anwendungsstart werden die Stationen mit der Datenbank synchronisiert. Diese
Datensätze sind als `profile_managed` markiert und können nicht als zweite
Konfigurationsquelle über die Maschinen-CRUD-API verändert oder gelöscht werden.

Die simulierte Maschine liegt ausschließlich unter
`test-machines/opcua-simulator/`. Sie benutzt denselben echten OPC-UA-Adapter wie
eine physische Maschine. Auch Produktionszähler, Maschinenstatus,
Persistierung und OEE durchlaufen denselben Runtime-Pfad; simuliert ist nur die
externe SPS-Gegenstelle.
