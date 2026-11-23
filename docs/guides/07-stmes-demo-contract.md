# 07 - stMES Multi-Station Demo Contract

> **WICHTIG: ALLE stMES-FELDER, NODEIDS, RESULTCODES UND SIGNALFOLGEN IN DIESEM DOKUMENT SIND ERFUNDENE TESTDATEN.**
>
> Sie dienen ausschließlich der lokalen Demo, bis die echte Siemens-UDT-Dokumentation `stMES` vorliegt. Vor Anbindung einer realen SPS müssen Vertrag, Datentypen, Schreibrichtungen, Security und Zeitverhalten vollständig ersetzt und erneut getestet werden.

_Status: demo verified - not production compatible_

## Demo-Topologie

- Ein eigener OPC-UA-Prozess simuliert drei Stationen: Kugelbefüllung (Resource 1), Deckelbereitstellung (Resource 2) und Endkontrolle (Resource 3).
- Die Demo-Carrier 128 und 129 starten an der Kugelbefüllung und folgen der vom MES gemeldeten nächsten Resource.
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

Die [Startanleitung](../../README.md#mes-mit-simulierter-maschine-betreiben) beschreibt die lokale Konfiguration. Der Seed richtet `DEMO-ORDER-001` mit drei Routenschritten und den Carriern 128 und 129 ein. Beide Carrier durchlaufen die drei Stationen und der Auftrag erreicht nach der Endkontrolle eine Fertigmenge von 2.

Standardmäßig verwendet der Simulator die MES-API für die Auswahl zugewiesener Carrier. Mit `DEMO_CARRIER_IDS=128,129` kann stattdessen ein fester simulierter Wareneingang eingerichtet werden. Die Maschinenkommunikation läuft in beiden Betriebsarten über OPC UA.

## Austauschgrenze zur realen SPS

- Ausschließlich `tools/opcua-test-server.js` spielt die Rolle der SPS und initiiert Prozesssignale.
- Backend und Frontend enthalten keinen Demo-Replay-Endpunkt und treiben die SPS nicht künstlich an.
- Das MES reagiert auf `xStart`, schreibt die Antwortfelder und wertet die SPS-Quittierung sowie `ldtTimeStamp` aus.
- Wenn die reale SPS denselben Vertrag und dieselben NodeIds bereitstellt, wird der Testserver beendet und `OPC_UA_SERVER_ADDRESS` auf den realen Endpoint gesetzt.
- Solange die echte UDT-Dokumentation fehlt, ist ein reiner Endpoint-Wechsel nicht garantiert. Abweichende NodeIds, Typen oder Signalfolgen müssen zuerst im Vertrag und in der Konfiguration umgesetzt und gegen den Simulator getestet werden.

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
