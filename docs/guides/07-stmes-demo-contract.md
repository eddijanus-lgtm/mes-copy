# 07 - stMES Multi-Station Demo Contract

> **WICHTIG: ALLE stMES-FELDER, NODEIDS, RESULTCODES UND SIGNALFOLGEN IN DIESEM DOKUMENT SIND ERFUNDENE TESTDATEN.**
>
> Sie dienen ausschließlich der lokalen Demo, bis die echte Siemens-UDT-Dokumentation `stMES` vorliegt. Vor Anbindung einer realen SPS müssen Vertrag, Datentypen, Schreibrichtungen, Security und Zeitverhalten vollständig ersetzt und erneut getestet werden.

_Status: demo verified - not production compatible_

## Demo-Topologie

- Ein lokaler OPC-UA-Server stellt zwei unabhängige Stationen bereit.
- `Station1` besitzt Resource-ID 1 und Demo-Carrier 128.
- `Station2` besitzt Resource-ID 2 und Demo-Carrier 129.
- Jede Station besitzt eigene `stMES.State`, `stMES.Query` und `dbProcessData [DB151]`-Bäume.
- Das Backend verarbeitet Stationen parallel, aber pro Station seriell.

## Erfundenes State-Modell

Präfix: `ns=1;s=Station<resourceId>.stMES.State.`

| Feld | Demo-Typ | Richtung |
|---|---|---|
| `xAuto` | Boolean | SPS → MES |
| `xManual` | Boolean | SPS → MES |
| `xBusy` | Boolean | SPS → MES |
| `xReset` | Boolean | SPS → MES |
| `xErrL0`, `xErrL1`, `xErrL2` | Boolean | SPS → MES |

## Erfundenes Query-Modell

Präfix: `ns=1;s=Station<resourceId>.stMES.Query.`

| Feld | Demo-Typ | Richtung |
|---|---|---|
| `xStart` | Boolean | SPS → MES |
| `uiCarrierId` | UInt32 | SPS → MES |
| `uiResourceId` | UInt16 | SPS → MES |
| `xQryBusy` | Boolean | MES → SPS |
| `xDone`, `xError` | Boolean | MES → SPS |
| `sOrderNo`, `sPartNo` | String | MES → SPS |
| `uiOperationNo` | UInt16 | MES → SPS |
| `iStepNo` | Int16 | MES → SPS |
| `uiNextResourceId` | UInt16 | MES → SPS |
| `iPar1` bis `iPar4` | Int16 | MES → SPS |
| `uiResultCode` | UInt16 | MES → SPS |

## Erfundenes Handshake-Verhalten

1. SPS setzt `xStart=true` und hält das Signal.
2. MES erhält das Signal über OPC-UA-Subscription.
3. MES setzt `xQryBusy=true`.
4. MES sperrt den Carrier-Datensatz transaktional und löst Auftrag sowie Routenschritt auf.
5. MES schreibt Antwortfelder und setzt entweder `xDone=true` oder `xError=true`.
6. SPS übernimmt bei Erfolg die Parameter in ihre stationslokale DB151-Kopie.
7. SPS setzt `xStart=false`.
8. MES löscht Busy-, Done- und Error-Flags und markiert das Journal als quittiert.
9. Eine Änderung von `dbProcessData.ldtTimeStamp` schließt den Routenschritt ab und schaltet den Carrier weiter.

## Erfundenes Resultcode-Schema

| Code | Demo-Bedeutung |
|---:|---|
| 0 | OK |
| 1 | Carrier unbekannt |
| 2 | Auftrag oder Routenschritt fehlt |
| 3 | Carrier steht an der falschen Resource |
| 4 | Routenschritt bereits abgeschlossen |
| 9 | Interner Demo-Fehler |

## Persistenz

- `carriers`: physischer Werkstückträger, Auftragszuordnung und aktueller Schritt.
- `order_route_steps`: wiederverwendbare Workplan-Definition mit Resource, Operation und Parametern; Ausführungsfortschritt liegt pro Carrier, nicht global am Schritt.
- `stmes_handshakes`: dauerhaftes Request-/Response-/Acknowledgement-Journal.
- `machines.resource_id` und OPC-UA-Felder: Stationsidentität und spätere reale Verbindungskonfiguration.

## Demo starten

```bash
npm run start:test-machine
npm run start:prod
DEMO_ADMIN_USERNAME=<admin> DEMO_ADMIN_PASSWORD=<password> npm run seed:test-machine
```

Der Seed legt ausschließlich folgende Testdaten an beziehungsweise aktualisiert sie:

- `Demo Station 1`, Resource 1
- `Demo Station 2`, Resource 2
- `DEMO-ORDER-001`
- Carrier 128 und 129
- zwei Demo-Routenschritte mit Parametern 1, 3, 5 und 7

Für einen vollständig sichtbaren Lauf zuerst den Seed ausführen, dann die Edge-Seite öffnen und anschließend den Testserver neu starten. Der Simulator führt danach selbstständig einen SPS-getriebenen Ablauf aus:

1. Station 1 fordert Carrier 128 an und meldet Schritt 1 als abgeschlossen.
2. Station 2 fordert Carrier 129 an und schließt dessen Route ab.
3. Station 2 übernimmt Carrier 128, führt Schritt 2 aus und schließt dessen Route ab.
4. Der Auftrag erreicht dadurch `2/2 completed`.
5. Zusätzliche Anfragen demonstrieren die Ablehnung eines Carriers an der falschen Station und eines unbekannten Carriers.

## Austauschgrenze zur realen SPS

- Ausschließlich `test-machines/opcua-simulator/server.js` spielt die Rolle der SPS und initiiert Prozesssignale. Das MES verwendet dabei den echten `OpcUaMachineAdapter`.
- Backend und Frontend enthalten keinen Demo-Replay-Endpunkt und treiben die SPS nicht künstlich an.
- Das MES reagiert auf `xStart`, schreibt die Antwortfelder und wertet die SPS-Quittierung sowie `ldtTimeStamp` aus.
- Für die reale SPS wird `MACHINE_PROFILE_PATH` auf ein validiertes Anlagenprofil gesetzt. Endpoint, Namespace-URIs, Stationen, Rollen, Datentypen, Routing und Security werden aus diesem Profil geladen.
- Der Simulator darf eigene NodeIds und Signalnamen besitzen: Das MES arbeitet nur mit den semantischen Rollen des jeweils aktiven Profils. Der produktive Adapter bleibt dabei derselbe.

## Vor realer SPS-Anbindung zwingend ersetzen

- echte NodeIds und Namespace-URIs
- echte UDT-Datentypen und Wertebereiche
- tatsächliche PLC-/MES-Schreibrichtung
- Puls-/Level-/Toggle-Verhalten aller Flags
- echte Resultcodes und Fehlerreaktionen
- Cycle-/Sequence-ID für sichere Deduplizierung
- Timeout-, Retry- und Reconnect-Regeln
- OPC-UA-SecurityPolicy, Zertifikate und Benutzerrechte
- Klärung, ob DB151 zentral oder stationslokal existiert
