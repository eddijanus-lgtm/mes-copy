# Simulierte OPC-UA-Testmaschine

Dieser Ordner stellt ausschließlich die Maschinenseite der Testumgebung bereit.
Der Server emuliert eine SPS als echten OPC-UA-Server. Das MES verbindet sich
damit über denselben produktiven `OpcUaMachineAdapter` und denselben
`node-opcua`-Client wie mit einer physischen Maschine.

Es gibt keinen Simulator- oder Mock-Adapter im MES.

Jede Produktionsstation stellt außerdem kumulative Gut- und Ausschusszähler
sowie ihre ideale Zykluszeit als OPC-UA-Knoten bereit. Das Maschinenprofil
ordnet diese Knoten den neutralen Rollen `goodCount`, `rejectCount` und
`idealCycleTimeMs` zu. Das MES speichert Änderungen über den normalen
Adapter-Telemetriepfad und berechnet daraus OEE. Optionale Ausschussraten werden
ausschließlich auf der simulierten Maschinenseite konfiguriert:

```env
SIMULATOR_SCRAP_RATE_S01=0
SIMULATOR_SCRAP_RATE_S02=0
SIMULATOR_SCRAP_RATE_Q01=0
```

Die Werte liegen zwischen `0` und `1`; zum Beispiel entspricht `0.03` einer
simulierten Ausschusswahrscheinlichkeit von drei Prozent je Stationszyklus.

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

## Virtuelle SPS fuer ein echtes MES

Das Docker-Deployment bildet den bei der echten SPS gelesenen Siemens-Vertrag
einschließlich Namespace-Reihenfolge, `dbProcessData`-Node-IDs, Datentypen und
Schreibrechten nach. Docker veröffentlicht OPC UA auf Port `4840` des PCs. Ein
MES auf demselben Rechner verwendet dafür `127.0.0.1`; die physische SPS kann
unter `192.168.0.1` verbunden bleiben. Macvlan, eine weitere IP-Adresse und
`sudo` werden nicht benötigt.

```bash
./tools/virtual-plc.sh start
```

Das echte MES verbindet sich anschließend ohne Simulator-Sonderweg mit:

```text
opc.tcp://127.0.0.1:4840
Security: None
Authentication: Anonymous
```

Falls die Adresse oder der externe Port des PCs abweicht, können sie vor dem
Start überschrieben werden:

```bash
PLC_ADVERTISED_HOST=192.168.0.20 \
PLC_OPCUA_PORT=4840 \
./tools/virtual-plc.sh start
```

Status, Logs und Beenden:

```bash
./tools/virtual-plc.sh status
./tools/virtual-plc.sh logs
./tools/virtual-plc.sh stop
```
