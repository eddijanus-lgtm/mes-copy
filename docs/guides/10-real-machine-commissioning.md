# 10 – OPC-UA-Inbetriebnahme an der echten Anlage

_Status: UI-gestützte Inbetriebnahme verfügbar_
_Grundsatz: Die erste Inbetriebnahme ist ausschließlich lesend._

## Inbetriebnahme über die MES-Oberfläche

Für normale Anwender ist keine manuelle JSON-Bearbeitung mehr erforderlich. Vor
der ersten Nutzung richtet ein Administrator einmalig die versionierte
Profilablage ein:

```powershell
npm run migrate:machine-profiles
```

Danach erfolgt die Inbetriebnahme auf **Stationen → Maschine konfigurieren**:

1. Anzeigename, stabile technische `machineId`, Hersteller, Modell, Version und
   Standort erfassen. Neue Profile werden unabhängig von der Auswahl im
   Browser durch das Backend zunächst als `observe` gespeichert.
2. Standardwerte für OPC UA erfassen. Sie dienen bestehenden Legacy-Profilen
   und als Vorlage für neue Stationen.
3. Eine Maschinenressource und die untergeordneten Work Units beziehungsweise
   Komponenten anlegen. Jede Station erhält ihre eigene vollständige
   `opc.tcp://`-Verbindung mit Endpoint, Security, Authentifizierung, Timeouts
   und Reconnect. Für Benutzername, Passwort, Zertifikat und Private Key werden nur
   die Namen dedizierter `OPCUA_*`-Umgebungsvariablen gespeichert. Andere
   Variablennamen werden abgelehnt, damit keine fremden Backend-Secrets als
   Maschinenzugang verwendet werden können. Die Werte selbst werden nur im
   Backend-Prozess gesetzt.
   Der Assistent schlägt eine noch freie Ressourcennummer
   vor und zeigt die Hierarchie visuell an.
4. Routbare, aktivierte Produktionsstationen mit positiver Sequenz,
   Operationsnummer und Arbeitsgang versehen. Die sortierte Standardroute wird
   direkt angezeigt.
5. OPC-UA-Knoten den fachlichen MES-Signalrollen zuordnen. Der optionale Browser
   liest BrowseName, DisplayName, Node-ID, Datentyp und Zugriffsrechte. Eine
   fachliche Rolle wird nie automatisch behauptet; der Anwender muss die
   Auswahl bestätigen.
6. Entwurf speichern, strukturell validieren, die reale SPS read-only prüfen
   und die Zusammenfassung kontrollieren. Erst danach kann ein Administrator
   aktivieren.

Nach einer Aktivierung oder Deaktivierung zeigt das MES
**Backend-Neustart erforderlich**. Es gibt bewusst keinen partiellen Hot Reload.
Beim folgenden Start lädt das Backend die aktive Datenbankversion, synchronisiert
deren Ressourcen als `profile_managed` und verbindet den OPC-UA-Adapter damit.
Ressourcen des vorherigen Profils werden offline/deaktiviert, niemals hart
gelöscht.

## Namen und Verantwortlichkeiten

| Begriff | Festlegung | Bedeutung |
|---|---|---|
| Maschinenname | MES-Administrator gemeinsam mit Anlagenverantwortung | Für Menschen lesbarer Name der Gesamtanlage |
| `machineId` | MES-Administrator, nach Anlage technisch unveränderlich | Stabile technische Identität des Profils |
| Stationsname und `stationId` | Prozess-/Anlagenverantwortung | Maschine, Work Unit oder Komponente im MES-Modell |
| Ressourcennummer | MES-Administrator mit Assistentenvorschlag | Global eindeutige Nummer für Routing und Historie |
| SPS-Funktion | SPS-/Maschinenhersteller | Reale physische Funktion, Verriegelung und Sicherheit der Anlage |
| Arbeitsgang | Arbeitsvorbereitung/Prozessverantwortung | Fachliche Tätigkeit an einem Routenschritt |
| Standardroute | Maschinenprofil-Verantwortung | Grundsätzliche Reihenfolge für diese Maschinenkonfiguration |
| Produktarbeitsplan | Arbeitsvorbereitung | Produktspezifische Route; überschreibt bei Verwendung die Standardroute |

Das Maschinenprofil beschreibt, was das MES von der SPS lesen beziehungsweise
in einer später freigegebenen Stufe schreiben kann. Es ersetzt weder die
SPS-Logik noch Sicherheitsfunktionen oder lokale Maschinenfreigaben.

## Sicherheitsstufen

- `observe`: ausschließlich lesen, überwachen und Telemetrie erfassen. Neue
  Maschinen starten immer in diesem Modus.
- `validate`: ebenfalls keine OPC-UA-Schreiboperationen. Dient der Abnahme einer
  vollständig modellierten Signal- und Routingkonfiguration.
- `control`: Runtime-Schreibzugriffe sind möglich, aber nur für explizit im
  Profil zugelassene Nodes. Aktivierung verlangt neben der `machineId` eine
  zweite ausdrückliche Schreibfreigabe und eine erfolgreiche Live-Prüfung
  exakt derselben Profilversion. SPS-Verriegelungen und
  Maschinensicherheit bleiben zwingend wirksam.

Verbindungstest, OPC-UA-Browser und Live-Profilprüfung sind in allen Modi
ausschließlich lesend. Fehlermeldungen werden von Secret-Werten bereinigt.

## Persistenz und Legacy-Fallback

Maschinenprofile werden als vollständige, validierte JSONB-Dokumente in
`machine_profile_versions` gespeichert. Jede Änderung erzeugt eine neue Version
mit Ersteller, Zeitstempel, Änderungsgrund, Strukturprüfung und optionalem
Live-Prüfbericht. Mehrere Entwürfe sind möglich, aber ein partieller
PostgreSQL-Unique-Index erlaubt systemweit genau eine aktive Version.

Die Runtime unterstützt aktuell genau **ein aktives Profil**, darin aber
beliebig viele voneinander unabhängige Stations-Endpoints. Jede
Stationsverbindung besitzt eine eigene Session und Reconnect-Logik; der Ausfall
einer Station unterbricht die übrigen Verbindungen nicht. Beim Backend-Start
gilt folgende Reihenfolge:

1. aktive persistierte Profilversion;
2. falls keine existiert: Datei aus `MACHINE_PROFILE_PATH`.

`MACHINE_PROFILE_PATH` bleibt damit für Simulator, bestehende Installationen und
E2E-Tests erhalten. Sobald ein UI-Profil aktiv ist, ist die Datenbankversion die
Source of Truth; die Legacy-Datei wird nicht parallel eingemischt.

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

Der vollständige Ablauf kann vorab mit einer zweiten, herstellerfremden
OPC-UA-Gegenstelle geprobt werden:

```powershell
npm run test:e2e:alternate-machine
```

Dieser Test startet das MES zunächst ohne erreichbare Maschine, führt danach
Scan und Profilprüfung im Read-only-Modus aus, prüft Telemetrie, Persistierung
und OEE und simuliert abschließend Netzwerktrennung und Wiederverbindung.

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

## Legacy: Maschinenprofil als Datei erstellen

Dieser Abschnitt gilt nur für bestehende Automatisierung, Simulatoren und
Fehlersuche. Der normale Inbetriebnahmeablauf verwendet den UI-Assistenten.

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
