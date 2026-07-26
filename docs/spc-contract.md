# SPS-Vertrag / OPC UA Communication Specification

**Version:** 1.0.0  
**Datum:** 2026-07-23  
**Status:** Entwurf (basierend auf Demo-Simulator)

---

## 1. Überblick

Dieses Dokument definiert die Kommunikationsspezifikation zwischen der **MES-Instanz** (Shopfloor Gateway) und einer realen **SPS-Anlage** über **OPC UA**. Der Vertrag legt Message-Formate, Datentypen, Timeouts, Fehlercodes und Zustandsübergänge fest.

---

## 2. SPS-Struktur

| Parameter            | Wert                                   | Beschreibung                                                       |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| OPC UA Server URI    | `opc.tcp://<host>:4840/UA/WaraMesTest` | Endpunkt der SPS-Anlage                                            |
| Station Resource IDs | Konfiguration (z.B. `1,2,3`)           | Stationsnummer für jede Station                                    |
| DataBlock            | DB151                                  | Prozessdaten-Block (`ns=1;s=Station${resourceId}.dbProcessData.*`) |
| Query Block          | stMES.Query                            | Steuerungsblock (`ns=1;s=Station${resourceId}.stMES.Query.*`)      |

---

## 3. MES → SPS Nachricht (Schreibzugriff)

### 3.1 Auftragsübertragung an Station

| OPC UA Variable    | Typ     | Beschreibung                                      | Wertebereich |
| ------------------ | ------- | ------------------------------------------------- | ------------ |
| `xQryBusy`         | Boolean | Busy-Flag (true = MES arbeitet an Anfrage)        | `true/false` |
| `xDone`            | Boolean | Erfolgs-Flag (true = Erfolgreich, false = Fehler) | `true/false` |
| `xError`           | Boolean | Fehler-Flag (true = Fehler aufgetreten)           | `true/false` |
| `sOrderNo`         | String  | Bestellungsnummer (order name / carrier ID)       | alphanumeric |
| `sPartNo`          | String  | Teilenummer / Teilebezeichnung                    | alphanumeric |
| `uiOperationNo`    | UInt16  | operationsnummer (OpNr.) im Auftrag               | 0–65535      |
| `iStepNo`          | Int16   | Aktueller Schritt im Prozessschritt               | -32768–32767 |
| `uiNextResourceId` | UInt16  | Nächste Station-ID (Routingsentscheidung)         | 0–65535      |
| `iPar1`            | Int16   | Parametervariable 1                               | -32768–32767 |
| `iPar2`            | Int16   | Parametervariable 2                               | -32768–32767 |
| `iPar3`            | Int16   | Parametervariable 3                               | -32768–32767 |
| `iPar4`            | Int16   | Parametervariable 4                               | -32768–32767 |
| `uiResultCode`     | UInt16  | Ergebniscode (siehe Abschnitt 5.2)                | 0–65535      |

### 3.2 Beispiel für Schreibzugriff

```typescript
// MES → SPS: Auftragsbertragung via OPC UA writeNodes()
await this.opcUa.writeNodes([
  { nodeId: prefix + 'sOrderNo', dataType: 'String', value: response.orderNo },
  { nodeId: prefix + 'sPartNo', dataType: 'String', value: response.partNo },
  {
    nodeId: prefix + 'uiOperationNo',
    dataType: 'UInt16',
    value: response.operationNo,
  },
  { nodeId: prefix + 'iStepNo', dataType: 'Int16', value: response.stepNo },
  {
    nodeId: prefix + 'uiNextResourceId',
    dataType: 'UInt16',
    value: response.nextResourceId,
  },
  { nodeId: prefix + 'iPar1', dataType: 'Int16', value: 5 },
  { nodeId: prefix + 'iPar2', dataType: 'Int16', value: 10 },
]);
```

---

## 4. SPS → MES Nachricht (Lesegangriff)

### 4.1 Prozessdaten von der Station

| OPC UA Variable | Typ      | Beschreibung                            | Wertebereich |
| --------------- | -------- | --------------------------------------- | ------------ |
| `iCarrierID`    | Int16    | Carrier-Kennung (Tragernummer)          | -32768–32767 |
| `iStepNo`       | Int16    | Aktueller Schritt im Prozess            | -32768–32767 |
| `iResourceID`   | Int16    | Aktuelle Station-ID                     | 0–65535      |
| `iPar1-iPar4`   | Int16    | Parametervariablen von der SPS          | -32768–32767 |
| `ldtTimeStamp`  | DateTime | Zeitstempel des letzten Prozessschritts | ISO-Format   |

### 4.2 Handshake-Status vom System

| OPC UA Variable | Typ     | Beschreibung                               | Wertebereich |
| --------------- | ------- | ------------------------------------------ | ------------ |
| `xStart`        | Boolean | Starttrigger (true = neue Anfrage von SPS) | `true/false` |
| `xQryBusy`      | Boolean | MES ist mit Antwort beschäftigt            | `true/false` |
| `xDone`         | Boolean | Antwort erfolgreich abgeschlossen          | `true/false` |
| `xError`        | Boolean | Fehler aufgetreten während der Antwort     | `true/false` |
| `uiCarrierId`   | UInt16  | Angefragte Carrier-Kennung                 | 0–65535      |
| `uiResultCode`  | UInt16  | Ergebniscode (siehe Abschnitt 5.2)         | 0–65535      |
| `sOrderNo`      | String  | Aktueller Auftrag (von vorheriger Antwort) | alphanumeric |
| `uiOperationNo` | UInt16  | operationsnummer (von vorheriger Antwort)  | 0–65535      |

---

## 5. Ablauf & Protokollzustände

### 5.1 stMES-Handshake-Zustände

```
SPS                              MES
 |                                |
 | ← xStart=true (Anfrage)       |
 | → xQryBusy=true               | Busy: Prüfe Auftrag und Routschritt
 | → sOrderNo, iPar1-iPar4 etc.  | Write auftragsparameter
 | → xDone=true / xError=true    | Antwort übermitteln
 | ← xStart=false                | Bestätigung zuruecksetzen
 | → xQryBusy=false              | Abschluss
```

### 5.2 Zeitmodi und Polling

| Parameter                    | Wert                      | Beschreibung                      |
| ---------------------------- | ------------------------- | --------------------------------- |
| OPC UA Subscription (xStart) | 100ms polling             | Für xStart-Flag Monitoring        |
| Prozessdaten-Polling         | 1000ms alle Stationen     | dbProcessData lesen und speichern |
| Maximale Antwortzeit MES     | 2 Sekunden                | SLA für Auftragsentscheidung      |
| Reconnect-Intervall          | 5000ms bei Netzwerkfehler | Automatische Wiederverbindung     |

---

## 6. Fehlercodes (uiResultCode)

| Code   | Name                   | Beschreibung                       |
| ------ | ---------------------- | ---------------------------------- |
| 0x0000 | OK                     | Auftrag erfolgreich übermittelt    |
| 0x8001 | ORDER_NOT_FOUND        | Kein zugeordneter Auftrag gefunden |
| 0x8002 | CARRIER_NOT_READY      | Carrier nicht bereit / unbekannt   |
| 0x8003 | STEP_ALREADY_COMPLETED | Schritt bereits abgeschlossen      |
| 0x8004 | INTERNAL_ERROR         | Interner Fehler in MES-Logic       |

---

## 7. MQTT Topic-Routing (zusätzliche Kommunikation)

| MQTT Topic               | Richtung                | Zweck                                      |
| ------------------------ | ----------------------- | ------------------------------------------ |
| `i4.0/production/orders` | Ingress (Webshop → MES) | Webshop-Bestellungen als Auftrag erstellen |

Der Webshop sendet den Auftragsnamen in `order_name` und die
Produktionsparameter im verschachtelten Objekt `params`.

**Verbindlicher Webshop-Payload:**

```json
{
  "order_name": "#WEB-ORDER-123",
  "params": {
    "bDeckelfarbe": true,
    "uiKugelRot": 10,
    "uiKugelGruen": 20,
    "uiKugelBlau": 30
  }
}
```

`order_name` muss eine nichtleere Zeichenkette sein. Die vier Felder in
`params` sind verpflichtend; die Kugelanzahlen müssen nichtnegative
Ganzzahlen sein. Der MQTT-Übersetzer übernimmt `order_name` als MES-Auftragsname
und konvertiert `bDeckelfarbe` von Boolean nach Integer (`true → 1`,
`false → 0`). Anschließend gilt das Mapping `bDeckelfarbe → iPar1`,
`uiKugelRot → iPar2`, `uiKugelGruen → iPar3` und `uiKugelBlau → iPar4`.

Das bisherige flache Payload-Format wird aus Gründen der Abwärtskompatibilität
noch akzeptiert, ist aber nicht der Webshop-Vertrag.

Die Broker-Adresse kommt aus `MQTT_BROKER_URL`; die lokale Demo verwendet
`mqtt://localhost:1883`. Im Schulnetz verwendet der Webshop den externen Broker
`mqtt://10.10.10.253:1883`. Demo-Nachrichten werden mit QoS 1 und
`retain=false` gesendet. Das Backend abonniert aktuell mit QoS 0. Eine fachliche
Bestätigungs-Topic, Message-ID, Idempotenz und eine Dead-Letter-Queue sind noch
nicht implementiert.

---

## 8. Versionierung & Änderungsverfahren

### 8.1 Änderungsmanagement

- Jede Änderung der OPC UA-Variablen oder Message-Formate muss versioniert werden
- Abwärtskompatibilitaet muss gewahrt bleiben, wo moglich
- SPS- und MES-seitige Aenderungen muessen parallel released werden

### 8.2 Gültigkeit

- Dieser Vertrag gilt fuer alle Stationen der Anlage mit DB151
- Fuer individuelle Stationen ohne DB151 sind abweichende Spezifikationen moeglich

---

## 9. Test & Validaition

### 9.1 Testumgebung (Demo-Simulator)

Die externe Testmaschine in `test-machines/opcua-simulator/server.js` simuliert 3 Stationen mit kurzen Zeiten. Das MES verwendet dafür den produktiven OPC-UA-Adapter:

- Station 1: 5 Sekunden Zykluszeit
- Station 2: 6 Sekunden Zykluszeit
- Station 3: 4 Sekunden Zykluszeit

### 9.2 Echte SPS-Anbindung (spareter Schritt)

Wenn der Vertrag fir eine reale Maschine abgestimmt ist, wird:

- Die Simulation durch echte SPS-Schnittstellen ersetzt
- Der Polling-Zyklus an die reale Anlage angepasst
- Die OPC UA Endpunkt-Konfiguration aktualisiert

---

_Generator: wara-mes MES team_  
_Let update: 2026-07-23 (Phase 4)_
