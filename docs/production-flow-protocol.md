# Protokoll: Auftrag bis Produktion

Stand: 2026-07-23

## Ziel

Dieses Protokoll beschreibt einen kompletten Demoablauf vom Webshop-Auftrag bis zum Abschluss der Produktion im MES. Es dokumentiert, welche Systeme beteiligt sind, welche Daten uebertragen werden und woran erkennbar ist, dass die Demo nicht nur im Frontend simuliert wird.

## Beteiligte Systeme

| System | Rolle | Adresse / Hinweis |
| --- | --- | --- |
| Frontend | Bedienoberflaeche und Live-Anzeige | `http://localhost:5173` |
| Backend / MES API | Auftragsanlage, Routing und Carrier-Tracking | `http://localhost:3000/api` |
| Shopfloor Gateway | OT/IT-Vermittlung fuer OPC-UA, MQTT und stMES-Handshakes | `http://localhost:3000/api/shopfloor` |
| PostgreSQL | Persistenz fuer Auftraege, Routen, Carrier und Stammdaten | Docker-Container `mes_db_dev`, Port `5433` |
| MQTT Broker | Eingang der Webshop-Bestellungen | lokal `mqtt://localhost:1883` |
| OPC-UA-Testanlage | Simulierte SPS-/Produktionslinie | `opc.tcp://localhost:4840/UA/WaraMesTest` |

## Simulierte SPS-Stationen

Es werden drei OPC-UA-/SPS-Stationen simuliert:

| Schritt | Resource | Station | Operation | Zykluszeit |
| --- | ---: | --- | --- | ---: |
| 1 | 1 | `S01 Deckelzufuehrung` | `Deckelfarbe bereitstellen` | 90 s |
| 2 | 2 | `S02 Kugeldosierung` | `Kugeln dosieren` | 120 s |
| 3 | 3 | `Q01 Endkontrolle` | `Deckel und Kugeln pruefen` | 60 s |

Die Stationen werden durch `tools/opcua-test-server.js` bereitgestellt. Die Kommunikation erfolgt trotzdem ueber echte OPC-UA-Nodes und nicht nur ueber eine Frontend-Animation.

## Webshop-Auftrag

Der Webshop sendet eine MQTT-Nachricht auf das Topic:

```text
i4.0/production/orders
```

Beispielpayload aus dem verifizierten Test:

```json
{
  "bDeckelfarbe": 1,
  "uiKugelRot": 1,
  "uiKugelGruen": 2,
  "uiKugelBlau": 4,
  "xAuftragAusstehend": false,
  "uiAnzahlAustehenderAuftraege": 0
}
```

Das Backend mappt die Webshop-Parameter auf Produktionsparameter:

| Webshop-Feld | MES-/SPS-Parameter | Bedeutung |
| --- | --- | --- |
| `bDeckelfarbe` | `iPar1` | Deckelfarbe |
| `uiKugelRot` | `iPar2` | Anzahl rote Kugeln |
| `uiKugelGruen` | `iPar3` | Anzahl gruene Kugeln |
| `uiKugelBlau` | `iPar4` | Anzahl blaue Kugeln |

Im Test wurde daraus folgender Auftrag erzeugt:

```text
WEBSHOP-20260723081021
```

## Ablauf Schritt Fuer Schritt

### 1. MQTT-Nachricht wird empfangen

Der lokale MQTT-Broker nimmt die Webshop-Nachricht entgegen. Das Backend ist auf das Topic `i4.0/production/orders` subscribed und verarbeitet die Nachricht automatisch.

Ergebnis:

- Auftrag wird im MES angelegt.
- Route mit drei Stationen wird erzeugt.
- Carrier `128` wird dem Auftrag zugeordnet.
- Auftrag startet mit Status `in_progress`.

Initialer DB-Zustand:

```json
{
  "order": {
    "name": "WEBSHOP-20260723081021",
    "status": "in_progress",
    "quantity": 1,
    "completed_quantity": 0
  },
  "carrier": {
    "carrier_number": 128,
    "status": "assigned",
    "current_step_no": 1,
    "current_resource_id": null
  }
}
```

### 2. Carrier kommt an Station 1 an

Die OPC-UA-Testanlage gibt Carrier `128` in die Linie frei. Station 1 setzt ueber OPC-UA einen stMES-Request.

Technisch relevante Werte:

- `Station1.stMES.Query.xStart = true`
- `Station1.stMES.Query.uiCarrierId = 128`
- `Station1.stMES.Query.uiResourceId = 1`

Das Shopfloor Gateway erkennt den Request und leitet ihn an das MES-Routing weiter. Das MES prueft die Route; das Gateway schreibt die Antwort anschliessend zurueck an die SPS-Nodes.

Danach steht der Carrier in der DB auf:

```json
{
  "carrier_number": 128,
  "status": "in_process",
  "current_step_no": 1,
  "current_resource_id": 1
}
```

### 3. Station 1 produziert

Station 1 simuliert die Operation `Deckelfarbe bereitstellen`. Nach Ablauf der Zykluszeit schreibt die OPC-UA-Testanlage Prozessdaten in den DB151-Bereich.

Danach schaltet das Backend den Carrier auf den naechsten Routenschritt weiter:

```json
{
  "carrier_number": 128,
  "status": "assigned",
  "current_step_no": 2,
  "current_resource_id": null
}
```

### 4. Carrier wird zu Station 2 transportiert

Die Demoanlage simuliert eine Transportzeit und loest anschliessend an Station 2 wieder einen stMES-Request aus.

Station 2 fragt fuer Carrier `128` Produktionsdaten an. Das Shopfloor Gateway vermittelt die Anfrage an das MES. Das MES prueft:

- Ist Carrier bekannt?
- Ist ein Auftrag zugeordnet?
- Ist Schritt 2 die richtige Ressource?
- Welche Parameter gehoeren zu diesem Auftrag?

Bei Erfolg wird der Carrier an Station 2 in Bearbeitung gesetzt:

```json
{
  "carrier_number": 128,
  "status": "in_process",
  "current_step_no": 2,
  "current_resource_id": 2
}
```

### 5. Station 2 produziert

Station 2 simuliert die Operation `Kugeln dosieren`. Die Parameter aus dem Webshop werden weiterverwendet:

```json
{
  "iPar1": 1,
  "iPar2": 1,
  "iPar3": 2,
  "iPar4": 4
}
```

Nach Abschluss schreibt die Station Prozessdaten zurueck. Das Backend erkennt den Zeitstempel und schaltet auf Schritt 3 weiter.

### 6. Carrier kommt an Station 3 an

Station 3 ist die Endkontrolle. Auch hier erfolgt wieder ein echter OPC-UA-stMES-Request mit Carrier `128`.

Der Carrier steht waehrend der Endkontrolle auf:

```json
{
  "carrier_number": 128,
  "status": "in_process",
  "current_step_no": 3,
  "current_resource_id": 3
}
```

### 7. Endkontrolle schliesst Produktion ab

Nach Abschluss von Station 3 schreibt die OPC-UA-Testanlage finale Prozessdaten:

```json
{
  "iCarrierID": 128,
  "iStepNo": 3,
  "iResourceID": 3,
  "iPar1": 1,
  "iPar2": 1,
  "iPar3": 2,
  "iPar4": 4,
  "ldtTimeStamp": "2026-07-23T08:19:03.519Z"
}
```

Das Shopfloor Gateway meldet den Prozessabschluss an das MES. Das MES erkennt, dass kein weiterer Routenschritt existiert. Dadurch wird der Carrier abgeschlossen und der Auftrag auf `completed` gesetzt.

Finaler DB-Zustand:

```json
{
  "name": "WEBSHOP-20260723081021",
  "status": "completed",
  "completed_quantity": 1,
  "carrier_number": 128,
  "carrier_status": "completed",
  "current_step_no": 3,
  "current_resource_id": null
}
```

## Carrier-Tracking

Der Carrier wird dauerhaft in PostgreSQL getrackt. Entscheidend sind diese Felder:

| Feld | Bedeutung |
| --- | --- |
| `carrier_number` | Physische bzw. simulierte Carrier-ID, z. B. `128` |
| `order_id` | Zugeordneter MES-Auftrag |
| `status` | `assigned`, `in_process` oder `completed` |
| `current_step_no` | Aktueller Routenschritt |
| `current_resource_id` | Aktuelle Station, solange der Carrier in Bearbeitung ist |

Typische Statusfolge:

```text
assigned Schritt 1 -> in_process Station 1 -> assigned Schritt 2 -> in_process Station 2 -> in_process Station 3 -> completed
```

## Bewertung Der Demo

Die Demo ist eine lokale Live-Demo, nicht nur ein Frontend-Mock.

Nachgewiesen wurde:

- MQTT-Nachrichten werden real publiziert und vom Backend konsumiert.
- Auftraege, Routen und Carrier werden real in PostgreSQL gespeichert.
- Die Produktionslinie wird ueber einen echten OPC-UA-Server simuliert.
- Das Backend reagiert auf echte OPC-UA-Node-Aenderungen.
- Die Stationen schreiben Prozessdaten mit Zeitstempel zurueck.
- Der Auftrag wird erst nach Abschluss der letzten Station als fertig markiert.

Einschraenkung:

- Die SPS ist simuliert durch `tools/opcua-test-server.js`.
- Es ist keine physische Anlage angeschlossen.
- Der Test lief gegen den lokalen MQTT-Broker `localhost:1883`, nicht gegen den externen Broker `10.10.10.253:1883`.

## Bekannte Auffaelligkeit

Wenn die OPC-UA-Testanlage waehrend eines laufenden Produktionszyklus neu gestartet wird, kann ein Carrier in der DB auf `in_process` stehen bleiben. Grund: Die DB kennt den Carrier-Zustand weiter, aber die simulierte Anlage verliert ihren internen Stationszustand.

Im normalen ununterbrochenen Ablauf funktioniert der komplette Prozess bis `completed`.
