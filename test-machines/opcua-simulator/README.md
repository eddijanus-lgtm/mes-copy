# Simulierte OPC-UA-Testmaschine

Dieser Ordner stellt ausschließlich die Maschinenseite der Testumgebung bereit.
Der Server emuliert eine SPS als echten OPC-UA-Server. Das MES verbindet sich
damit über denselben produktiven `OpcUaMachineAdapter` und denselben
`node-opcua`-Client wie mit einer physischen Maschine.

Es gibt keinen Simulator- oder Mock-Adapter im MES.

Zusätzlich zu den Produktionsstationen stellt die Testmaschine ein neutrales
RFID-Carrier-Inventar bereit. Es enthält einen gültigen Snapshot mit Revision,
Kapazität, Gesamt-/Verfügbar-Zähler und primitive OPC-UA-Signale je Lagerplatz.
Beim Auslagern, Erkennen an einer Station und Rücklagern werden physischer
Zustand, Reader und Zeitstempel aktualisiert. Das MES greift weiterhin nur über
das Maschinenprofil und den produktiven Adapter darauf zu.

```bash
npm run start:test-machine
```

Die Default-Konfiguration simuliert vier Lagerplätze und die Carrier
`128,129,130,131`. Sie kann über folgende Variablen verändert werden:

```env
DEMO_INVENTORY_CAPACITY=4
DEMO_INVENTORY_VALID=true
DEMO_INVENTORY_CARRIER_IDS=128,129,130,131
DEMO_INVENTORY_READER_ID=DEMO-PALLET-STORE-RFID
DEMO_INVENTORY_INVALID_SLOTS=
```

`DEMO_INVENTORY_INVALID_SLOTS=2` simuliert beispielsweise einen ungültigen
RFID-Lesevorgang am zweiten Platz. Das mitgelieferte `profile.json` bildet vier
Slots ab. Für eine andere Kapazität werden ausschließlich die Slot-Einträge in
diesem Testmaschinenprofil ergänzt oder entfernt; MES-Code bleibt unverändert.
Mit `DEMO_INVENTORY_VALID=false` lässt sich außerdem ein ungültiger kompletter
Bestandssnapshot testen.

Für den Wechsel auf eine reale Maschine wird nur `MACHINE_PROFILE_PATH` auf das
Profil der realen Anlage gesetzt. MES-Fachlogik und Adapter-Provider bleiben
unverändert.
