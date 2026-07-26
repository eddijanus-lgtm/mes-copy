# 10 – OPC-UA-Inbetriebnahme an der echten Anlage

_Status: vorbereitet – reale Maschinendaten stehen noch aus_
_Grundsatz: Die erste Inbetriebnahme ist ausschließlich lesend._

## Ziel

Die Zeit an der Anlage wird auf die Schritte begrenzt, die offline nicht möglich sind:

1. Netzwerkverbindung bestätigen.
2. OPC-UA-Endpoint und angebotene Security-Modi erfassen.
3. Address Space rein lesend exportieren.
4. die wenigen benötigten Signale gemeinsam mit der SPS-Verantwortung identifizieren;
5. ein offline erstelltes Maschinenprofil rein lesend gegen die Anlage prüfen.

Der Scanner und die Profilprüfung führen **keine OPC-UA-Schreiboperationen** aus. Scan-Berichte werden unter `artifacts/opcua-scans/` gespeichert und durch Git ignoriert, weil sie interne Maschinennamen und Netzwerkinformationen enthalten können.

## Vor dem ersten Maschinentag

- [ ] IP-Adresse oder DNS-Name der Anlage bekannt
- [ ] OPC-UA-Port und Resource Path bekannt
- [ ] MES-Rechner befindet sich im freigegebenen Netz
- [ ] Firewall-Freigabe ist mit der verantwortlichen Person geklärt
- [ ] Ansprechpartner für SPS und Arbeitssicherheit ist anwesend oder erreichbar
- [ ] Benutzername/Passwort oder Client-Zertifikat liegen getrennt vom Repository vor
- [ ] Schreibzugriffe sind ausdrücklich **nicht** freigegeben
- [ ] externe Testmaschine startet mit `npm run start:test-machine`
- [ ] Backend- und Frontend-Build sind erfolgreich

## Montag: ein lesender Scan

Zuerst den OPC-UA-Endpoint in der lokalen `.env` oder nur für den Prozess setzen. Zugangsdaten dürfen nicht in Git gespeichert werden.

```powershell
$env:OPCUA_SCAN_ENDPOINT = "opc.tcp://MACHINE:4840/RESOURCE_PATH"
npm run opcua:scan
```

Bei Benutzeranmeldung:

```powershell
$env:OPCUA_SCAN_USERNAME = "commissioning-user"
$env:OPCUA_SCAN_PASSWORD = "local-secret"
npm run opcua:scan
```

Für einen gesicherten Endpoint zusätzlich beispielsweise:

```powershell
$env:OPCUA_SCAN_SECURITY_MODE = "SignAndEncrypt"
$env:OPCUA_SCAN_SECURITY_POLICY = "Basic256Sha256"
npm run opcua:scan
```

Der Bericht enthält:

- angebotene Endpoints, Security Modes und User Token Types;
- NamespaceArray mit stabilen Namespace-URIs;
- Node-ID, BrowseName, DisplayName und Pfad;
- Datentyp und Zugriffsrechte von Variablen;
- keine gelesenen Prozesswerte und keine Zugangsdaten.

Falls der Server sehr groß ist, wird der Scan begrenzt:

```powershell
$env:OPCUA_SCAN_ROOT_NODE = "ns=2;s=KnownMachineRoot"
$env:OPCUA_SCAN_MAX_DEPTH = "6"
$env:OPCUA_SCAN_MAX_NODES = "5000"
npm run opcua:scan
```

## Offline: Maschinenprofil erstellen

1. `config/machines/commissioning.machine.template.json` kopieren.
2. Alle `YOUR_*`-Platzhalter mit Informationen aus dem Scan ersetzen.
3. Namespace-URI aus `namespaceArray` verwenden.
4. Nur die für Dashboard und Trace benötigten Lesesignale aufnehmen.
5. `operatingMode` auf `observe` belassen.
6. Keine Zugangsdaten in das Profil schreiben.

Das Profil kann vollständig offline geprüft werden:

```powershell
npm run opcua:validate-profile -- config/machines/real-machine.machine.json
```

Signal-Identifier dürfen entweder vollständig angegeben werden, zum Beispiel
`ns=3;s=Machine.State.Auto`, oder bevorzugt ohne Namespace-Index, zum Beispiel
`s=Machine.State.Auto`. Bei der zweiten Form löst die Profilprüfung den aktuellen
Index über die Namespace-URI auf.

## Dienstag: Profil rein lesend prüfen

```powershell
$env:OPCUA_SCAN_ENDPOINT = "opc.tcp://MACHINE:4840/RESOURCE_PATH"
npm run opcua:check-profile -- config/machines/real-machine.machine.json
```

Die Prüfung vergleicht:

- Existenz jedes Signals;
- erwarteten und tatsächlichen OPC-UA-Datentyp;
- lesende beziehungsweise schreibende Zugriffsrechte;
- Namespace-URI und aktuellen Namespace-Index.

Ein Exit-Code `2` bedeutet, dass das Profil erreichbar war, aber mindestens ein Signal nicht zum Server passt. Die Abweichungen stehen im JSON-Bericht und können anschließend offline korrigiert werden.

## Mittwoch: Abnahme des lesenden Umfangs

- [ ] Verbindung wird nach Backend-Neustart automatisch aufgebaut
- [ ] Dashboard zeigt den echten Verbindungszustand
- [ ] alle Pflichtsignale bestehen die Profilprüfung
- [ ] Netzwerktrennung wird erkannt
- [ ] automatische Wiederverbindung wurde geprüft
- [ ] keine OPC-UA-Schreiboperation wurde ausgeführt
- [ ] Scan, Profil und Testnotizen sind lokal gesichert
- [ ] sensible Scan-Berichte wurden nicht committed

Danach wird die Anlage nicht mehr benötigt, bis Simulator, Dashboard und Mapping offline angepasst sind.

## Spätere Schreibfreigabe

Schreibzugriffe sind ein eigener Meilenstein. Vor dem ersten Schreibtest müssen pro Signal schriftlich bekannt sein:

| Information | Beispiel |
|---|---|
| Zweck | Auftragsnummer an SPS übergeben |
| Node-ID und Datentyp | `ns=3;s=...`, `String` |
| erlaubte Werte und Länge | maximal 20 Zeichen |
| Signalrichtung | MES → SPS |
| Verhalten | Level, Puls oder Toggle |
| Quittierung | separates Ack-Signal |
| Timeout und Wiederholung | 5 Sekunden, keine automatische Wiederholung |
| sicherer Fehlerzustand | SPS verwirft unvollständige Anfrage |
| lokale Verriegelung | SPS prüft Automatikbetrieb und Anlagenfreigabe |
| Freigabe | Name und Datum der SPS-/Anlagenverantwortung |

Erst danach wird das geprüfte Profil zunächst mit `operatingMode: "validate"` betrieben. Nach erfolgreicher Simulator- und Abnahmeprüfung wird ausschließlich dieses Profil auf `control` umgestellt; dafür ist keine MES-Codeänderung erforderlich.

## Minimaler Informationsbedarf von der Anlage

Für die erste Messeversion benötigen wir nur:

- exakten Endpoint;
- Authentifizierung und Security Policy;
- Namespace-URI;
- Maschinenzustand beziehungsweise Betriebsart;
- Störung aktiv;
- Prozess aktiv;
- Zähler oder eindeutiges Fertig-Signal;
- optional Werkstück-/Carrier-ID;
- optional Auftragsnummer.

Alles Weitere wird erst aufgenommen, wenn es für das konkrete Vorführungsszenario erforderlich ist.
