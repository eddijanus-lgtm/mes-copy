# Alternative OPC-UA-Maschine

Diese Testgegenstelle bildet keine WARA-Station nach. Sie simuliert eine
NovaPress NX-9000 eines anderen Herstellers mit eigener Namespace-URI,
abweichender Node-Struktur und profilgetriebener Integration.

## Observe-Modus

`profile.json` und `server.js` bilden die erste, ausschließlich lesende
Inbetriebnahme einer einzelnen Pressstation ab:

```powershell
$env:OPC_UA_TEST_SERVER_PORT = "4841"
node test-machines/alternate-opcua-machine/server.js
```

## Multi-Station-Control-Modus

`control-profile.json` und `server-multistation.js` bilden eine
Equipment-Hierarchie ab:

```text
NovaPress NX-9000 (R70, Maschinensteuerung)
├── Materialzuführung (R71)
├── Servo-Pressstation (R72)
└── Qualitätsprüfung und Ausschleusung (R73)
```

Jede Work Unit besitzt einen unabhängigen, profilkonfigurierten
Routing-Handshake. Maschinenweite Start-, Stop-, Pause- und Reset-Befehle
liegen ausschließlich an R70. Presskraft und Haltezeit werden ausschließlich
an R72 geschrieben.

Start:

```powershell
$env:OPC_UA_TEST_SERVER_PORT = "4841"
node test-machines/alternate-opcua-machine/server-multistation.js
```

Prüfung wie bei einer externen Anlage:

```powershell
$env:OPCUA_SCAN_ENDPOINT = "opc.tcp://127.0.0.1:4841/UA/NovaPress"
npm run opcua:scan
npm run opcua:validate-profile -- test-machines/alternate-opcua-machine/control-profile.json
npm run opcua:check-profile -- test-machines/alternate-opcua-machine/control-profile.json
npm run test:e2e:alternate-machine-control
```

Die Hierarchie orientiert sich an ISA-95 Equipment/Work Units und OPC UA for
Machinery. Der Simulator beansprucht keine formale OPC-UA-Zertifizierung.
NovaPress-Namen, NodeIds und Resultcodes bleiben vollständig im Profil und in
der externen Testmaschine; der MES-Kern bleibt maschinenneutral.
