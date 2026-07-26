# Neutraler MachineAdapter-Vertrag

## Ziel

Die MES-Fachlogik darf nicht erkennen müssen, ob die verbundene Gegenstelle eine
physische Maschine oder eine simulierte Testmaschine ist.

```text
MES-Fachlogik
  -> MachineAdapter
  -> OpcUaMachineAdapter (produktiv)
  -> OpcUaService / node-opcua (produktiv)
  -> physische SPS oder externer OPC-UA-Testserver
```

Nur die Gegenstelle wird für Tests simuliert. Adapter, Transport-Client,
Handshake, Recovery, Routing und Telemetriepfad bleiben produktiv.

## Verbindlicher Runtime-Vertrag

Der kanonische Vertrag liegt unter:

- `src/machines/adapters/machine-adapter.types.ts`
- `src/machines/adapters/machine-adapter.token.ts`

Der produktive Provider wird in `src/opcua/opcua.module.ts` immer so registriert:

```ts
{ provide: MACHINE_ADAPTER, useClass: OpcUaMachineAdapter }
```

Ein `useValue`-, Fake-, Mock- oder Simulator-Provider ist im MES-Runtime-Code
nicht zulässig.

Die MES-Komponenten `StMesHandshakeService`, `ConnectionRecoveryService`,
`TelemetryGateway` und `ShopfloorGatewayController` injizieren ausschließlich
`MACHINE_ADAPTER`. Nur `OpcUaMachineAdapter` kennt `OpcUaService` und konkrete
OPC-UA-Adressen.

## Maschinenprofile

Die konkrete Maschine wird über `MACHINE_PROFILE_PATH` beschrieben. Ein
Profil enthält Endpoint, Stationen, Signalrollen und Adressen. Der Wechsel von
der Testmaschine zu einer realen Anlage erfordert deshalb nur ein anderes
Profil; MES-Fachlogik und Adapter-Provider bleiben unverändert.

## Externe Testmaschine

Die simulierte SPS liegt vollständig außerhalb des MES-Runtimes:

- `test-machines/opcua-simulator/server.js`
- `test-machines/opcua-simulator/profile.json`

Sie stellt einen echten OPC-UA-Server bereit. Das MES verbindet sich damit über
den produktiven `OpcUaMachineAdapter`.

## Automatische Architekturprüfung

`src/architecture/mes-neutrality.spec.ts` verhindert:

- synthetische Zufallswerte im MES-Runtime-Code,
- Demo-, Fake-, Mock-, Stub- oder Simulator-Verzweigungen im MES,
- den Austausch des produktiven Adapter-Providers durch `useValue` oder
  `useFactory`,
- Simulatorartefakte innerhalb von `src/`.
