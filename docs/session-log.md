# Session Log — wara-mes Development

_Dieses Protokoll dokumentiert jede Änderung, jeden Prompt und den Fortschritt des Projekts._

---

## 2026-07-22

### [10:50] Repository Initialisierung & Push zu GitHub
**Prompt:** "kannst du dir das wara-mes-projekt mal anschauen, welche technologien hat es?"
- Technologien identifiziert: NestJS 11, React 19, TypeScript 5.7, PostgreSQL 16, node-opcua, MQTT
- Prompt: "ich habe auf github ein leeres repository angelegt: hier wäre es: https://github.com/iot1-wara/wara-mes. achte auf den richtigen root ordner, nichts pushen oh nem go."
- Remote von `mes-app` auf `wara-mes` umgestellt
- SSH-Key generiert und auf GitHub hinterlegt
- Git force-push nach `https://github.com/iot1-wara/wara-mes.git` erfolgreich

### [10:56] Lokaler Start — PostgreSQL Container starten
**Prompt:** "kannst du die app mal lokal starten?"
- Docker-Daemon gestartet, User zur docker-Gruppe hinzugefügt (`sudo usermod -aG docker riegello`, `newgrp docker`)
- Docker Compose: `mes_db` (PostgreSQL 16 Alpine) läuft auf Port 5432
- Konflikt gelöst: Lokale PostgreSQL war im Weg → gestoppt mit `sudo systemctl stop postgresql`

### [11:00] Backend-Abhängigkeiten & Node.js Version
**Prompt:** "mach du!" / "ok starte den Server"
- npm nicht installiert → nachgeholt mit `sudo apt-get install -y npm`
- Initialer Start fehlgeschlagen: `node-opcua` + `hexy` Kompatibilitätsproblem mit Node v18 (`ERR_REQUIRE_ESM`)
- Node.js auf v20 upgedated: `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash - && sudo apt-get install -y nodejs` → v20.20.2

### [11:03] Datenbank-Verbindung fixen
**Prompt:** Backend startete, aber PostgreSQL-Auth schlug fehl ("client password must be a string")
- Datei `.env` erstellt:
  ```
  DB_HOST=localhost
  DB_PORT=5432
  DB_USERNAME=mes_admin
  DB_PASSWORD=change_me_in_production
  DB_DATABASE=mes_production
  ```

### [11:05] Backend erfolgreich gestartet
**Prompt:** "ok, starte den server"
- NestJS dev-server (port 3000) läuft mit allen Routes gemappt:
  - `/api/orders/active`, `/api/traces`, `/api/data-collection`, `/api/edge/opcua/*`, `/api/edge/mqtt/*`

### [11:08] Frontend-Installation & Build
**Prompt:** "ok, starte den server" (nach Backend)
- `cd frontend && npm install && npm run build` → Build erfolgreich (`dist/index.html` erstellt)
- Vite dev-server (port 5173) mit Proxy `/api` → localhost:3000
- Build-Fehler gefixt: Frontend musste gebaut werden (`npm run build`), dann lief `dev` ohne 404 Fehler

### [11:10] Session Log erstellt
**Prompt:** "lies mir die roadmap aus" / "wie schnell kannst du das umsetzten?" / "lege im repo ein dokument an..."
- Alle Dienste laufen: Backend (3000), Frontend (5173), PostgreSQL Docker (5432)
- Session Log erstellt mit voller Zeitstrahl-Dokumentation

---

## Phase 1: JWT Auth + RBAC — Implementation

### [11:15] Guide + Doc-Verzeichnis erstellen
**Prompt:** "öffne die doku verzeichniss" / "mach du es"
- Ordner `docs/guides/` erstellt mit README.md als Übersicht
- Guide-Dokument `docs/guides/01-jwt-rbac.md` erstellt mit:
  - Konzept-Erklärung zu JWT + RBAC
  - 6 Schritte für die Umsetzung (planned)
  - Checkliste nach der Implementation
  - Review-Felder

### [11:20] Schritt 1: Dependencies ✅
**Prompt:** "ok weiter gehts"
- `npm install @nestjs/passport passport passport-jwt bcryptjs`
- `npm install -D @types/passport-jwt @types/bcryptjs`
- Status in Guide aktualisiert

### [11:25] Schritt 2: User Entity + DTO
**Prompt:** "yes"
Erstellt:
- `src/users/user.entity.ts` — UserEntity mit RoleEnum (ADMIN/OPERATOR/VIEWER)
- `src/auth/dto/login.dto.ts` — username + password mit class-validator

### [11:30] Schritt 3: Auth-Module erstellt
**Prompt:** (vorheriger: "yes")
Erstellt:
- `src/auth/auth.module.ts` — Modul mit Passport, JwtModule (async via ConfigService)
- `src/auth/auth.service.ts` — login(), register(), validateUser(), seedDefaultAdmin()
- `src/auth/auth.controller.ts` — POST /auth/login, /register, /seed
- `src/auth/jwt.strategy.ts` — JWT Strategy mit Bearer-Token Extraktion
- `src/auth/roles.guard.ts` — Custom Guard für RBAC (prüfe @Roles())
- `src/auth/jwt.auth.guard.ts` — Wrapper für Passport AuthGuard
- `src/app.module.ts` — AuthModule hinzugefügt

### [11:35] Schritt 4: Global AuthGuard
- `src/main.ts` angepasst: global JwtAuthGuard + ValidationPipe + CORS

### [11:40] Fehlerbehebung
**Prompts:** "was hast du gerade gemacht?" / "mach"
Fehler gefunden + behoben:
1. `ConflictBadRequestException` → fehlender Enum-Member → zu `BadRequestException` gefixt
2. `@nestjs/jwt` nicht installiert → nachinstalliert mit `npm install @nestjs/jwt`
3. auth.controller.ts falsche Typen (ReadableStream statt Body) → neu geschrieben mit @Body()
4. NestJS Compiler-Cache alt (`dist/` und `.nest-cli-cache` gelöscht)
5. `ConflictBadRequestException` in auth.service.ts:34 → zu `BadRequestException` gefixt

### [11:50] Auth-Backend Build erfolgreich ✅
**Prompt:** "ok lass uns weiter machen" / "tu das"
- UnauthorizedException import in auth.controller.ts gefixt
- `npx nest build` ohne Fehler abgeschlossen → Backend startet mit JWT-Auth

---

### Geplante Dateien noch:
- Frontend: Login-Seite, AuthContext, API-Interceptor
- Seed-Befehl zum Initialisieren des Admins nach dem ersten Start

_Benutzt von: riegello_
_Letzte Aktualisierung: 2026-07-22T11:42:00+02:00_

### [12:38] Frontend-Systemstatus eingebunden und ausgeliefert
**Prompts:** "Kannst du im frontend irgendwelche variablen unten rechts ... einspielen?" / "kannst du bitte dafür sorgen dass auf unserer http://localhost:3000/ seite das frontend sich updatet?" / "TUE ES1"
- `frontend/src/components/SystemStatus.jsx` erstellt: zeigt Backend-, Datenbank- und JWT-Status unten rechts und aktualisiert alle 5 Sekunden.
- `SystemStatus` in `frontend/src/App.jsx` global eingebunden.
- Frontend mit `npm run build` neu gebaut; neuer Build: `frontend/dist/assets/index-D2yCh3kl.js`.
- Vite dauerhaft auf `http://localhost:5173/` gestartet und mit HTTP 200 geprüft.
- `http://localhost:3000/` liefert den aktualisierten Frontend-Build ebenfalls mit HTTP 200 aus.

### [12:40] Backend-Fehler und JWT-Status diagnostiziert und korrigiert
**Prompts:** "warum backend error und JWT Token missing?" / "ja"
- Ursache des HTTP-500 identifiziert: alter Backend-Build lief seit 11:15; aktueller Health-Code war noch nicht aktiv.
- Globalen JWT-Guard über `APP_GUARD` registriert und `@Public()` für Login, Seed und Health eingeführt.
- Manuelle Base64-Zeichenfolge durch echten, signierten JWT via `JwtService.signAsync()` ersetzt.
- Öffentlichen `GET /api/health` mit echtem TypeORM-Datenbankcheck umgesetzt.
- Frontend-Statusbox auf `/api/health` umgestellt; Datenbankstatus wird nicht mehr geraten.
- Status `JWT Token: Missing` in verständlicheres `Session: Not logged in` geändert.
- Regression in `main.ts` korrigiert: `/api`-Präfix und Auslieferung von `frontend/dist` wiederhergestellt.
- Routingfehler korrigiert: `/api/orders/active` stand hinter `/:id` und wurde als ungültige UUID interpretiert.
- Backend- und Frontend-Build erfolgreich.
- Verifiziert: Health HTTP 200, DB `up`, ohne JWT HTTP 401, Login liefert signierten JWT, mit JWT Orders HTTP 200.
- `git diff --check` ohne Fehler; Jest meldet weiterhin "No tests found", da noch keine Unit-Tests vorhanden sind.

### [12:50] Phase 1.1: Umgebungsvariablen abgesichert
**Prompts:** "wie geht es jetzt weiter" / "ja"
- Doppelte Regeln in `.gitignore` bereinigt.
- `.env.example` mit Backend-, Datenbank-, JWT-, MQTT- und OPC-UA-Variablen erstellt.
- Verifiziert, dass die lokale `.env` ignoriert und nicht durch Git verfolgt wird.
- Lokales JWT-Secret gesetzt; unsicheren Standardwert aus Auth-Modul und JWT-Strategie entfernt.
- `JWT_SECRET` ist nun eine verpflichtende Startvariable über `ConfigService.getOrThrow()`.
- Backend erfolgreich gebaut und neu gestartet.
- Verifiziert: `/api/health` meldet DB `up`, Login erzeugt weiterhin einen signierten JWT, Port 3000 liefert das Frontend.
- Guide `docs/guides/00-environment-configuration.md` erstellt.

### [13:00] Phase 1.2: Frontend-Login-Grundlage
**Prompts:** "ja" / "ja"
- Bestehende React-Routen und direkte API-Aufrufe analysiert.
- `frontend/src/providers/AuthProvider.jsx` erstellt: JWT lesen, Ablauf prüfen, Login und Logout verwalten.
- `frontend/src/pages/Login.jsx` als responsive Login-Seite im bestehenden WARA-Design erstellt.
- `/login` öffentlich und alle Anwendungsrouten durch Redirect geschützt.
- Benutzername, Rolle und Logout in der Sidebar ergänzt.
- Systemstatus bleibt global sichtbar und erkennt die gespeicherte Sitzung.
- Frontend-Build erfolgreich; `/`, `/login` und Backend-Login verifiziert.
- Noch offen: Fachseiten verwenden direkte `fetch()`-Aufrufe und senden den JWT noch nicht automatisch mit.

### [13:10] Phase 1.2: Authentifizierter API-Client abgeschlossen
**Prompt:** "yes"
- `frontend/src/api/client.js` ergänzt automatisch `Authorization: Bearer <JWT>`.
- Bei HTTP 401 wird der ungültige Token entfernt und der AuthProvider beendet die Sitzung.
- Dashboard, Maschinen, Alarme, Traces und Edge vom direkten `fetch()` auf den zentralen Client migriert.
- Direkte Fetch-Aufrufe verbleiben nur für Login, zentralen Client und öffentlichen Health-Check.
- Frontend-Build und `git diff --check` erfolgreich.
- Authentifizierte Backend-Aufrufe für Maschinen, Alarme, Traces und Edge jeweils mit HTTP 200 verifiziert.
- Roadmap-Punkt 1.2 als abgeschlossen markiert.

### [13:20] Phase 1.3: RBAC für Maschinen und Benutzeranlage
**Prompts:** "geht weiter" / "ja"
- `@Roles()`-Decorator erstellt und `RolesGuard` global nach dem JWT-Guard registriert.
- Rollenmetadaten werden auf Controller- und Methodenebene ausgewertet.
- Maschinenrechte umgesetzt: alle Rollen lesen; Operator/Admin erstellen und ändern; nur Admin löscht.
- Benutzerregistrierung um validierte Rollenauswahl ergänzt und auf Admin beschränkt.
- Laufzeitfehler in Maschinenvalidierung gefunden und behoben: DTO-Import war fälschlich `type-only`.
- Verifiziert: Viewer GET 200, Viewer POST 403, Viewer Benutzeranlage 403, Operator CREATE erfolgreich, Operator DELETE 403, Admin DELETE 200.
- Temporäre Maschine sowie Viewer-/Operator-Testkonten nach dem Test entfernt.
- Roadmap-Punkt 1.3 bleibt teilweise offen, bis Orders, Alarms, Traces und Edge eigene Rollenregeln besitzen.

### [13:30] Phase 1 vollständig abgeschlossen
**Prompts:** "wo kann ich benutzer anlegen?" / "gehört das zu phase 1 in der roadmap?" / "ok dann mach jetzt phase 1 fertig ohne weiter nachzufragen, nur wenn etwas unklar ist" / "OPCUA haben wir noch keine echte server anbindung, baue dazu einen testserver"
- Admin-only Benutzerseite `/users` mit Rollenauswahl erstellt; Sidebar und direkte Route sind rollenabhängig geschützt.
- Rollenabhängige Maschinenaktionen und Dashboard-Schnellzugriffe ergänzt.
- RBAC auf Orders, Alarme, Traces, Datenerfassung und Edge ausgeweitet.
- DTO-Laufzeitimports, Bulk-Validierung, UUID-, Integer-, Enum-, Datums- und Query-Validierung korrigiert.
- Öffentliche Seed-Route und festes Default-Passwort entfernt.
- Lokalen Admin-Bootstrap `npm run create-admin` ergänzt.
- OPC-UA-Testserver `npm run start:opcua-test` mit vier simulierten Machine1-Nodes erstellt.
- OPC-UA-Client verbindet sich real, erstellt eine Session, liest sekündlich Messwerte und verbindet sich nach Ausfall automatisch neu.
- Globale `uncaughtException`-/`unhandledRejection`-Unterdrückung entfernt; MQTT-Fehler lokal behandelt.
- Authentifizierten WebSocket `/api/edge/ws` mit JWT-Handshake und OPC-UA-/MQTT-Telemetrie implementiert.
- Edge-Frontend von Zufallswerten auf echte Live-Telemetrie umgestellt.
- Globales Rate Limit (120/min), Login-Limit (5/min), Helmet, CORS-Allowlist und transformierende ValidationPipe aktiviert.
- OPC-UA-Node- und MQTT-Topic-Allowlist ergänzt.
- Verifiziert: Builds erfolgreich, DB/OPC UA/MQTT gesund, Live-WebSocket-Daten, 4401 ohne JWT, 403 für Viewer-Mutationen, 400 bei fremden Feldern, 429 beim Login-Limit.
- OPC-UA-Ausfalltest erfolgreich: `false` bei Stop, automatische Wiederverbindung auf `true`.
- `npm audit --omit=dev` Backend und `npm audit` Frontend: 0 bekannte Sicherheitslücken.
- Reparierbare `fast-uri`-Entwicklungslücke mit `npm audit fix` aktualisiert; vollständiger Backend-Audit danach ebenfalls 0 Sicherheitslücken.
- Finale Backend-/Frontend-Builds erfolgreich; Jest läuft mit `--passWithNoTests` und bestätigt, dass aktuell noch keine Testdateien vorhanden sind.
- Phase 1 in `docs/roadmap.md` vollständig abgeschlossen. Kein Commit und kein Push durchgeführt.

### [13:40] OPC-UA-Testserver auf Siemens DB151 angepasst
**Prompt:** "ändere den OPC UA test server entsprechend des bildes"
- Testserver-Objekt auf `dbProcessData [DB151]` umgestellt.
- Variablen aus dem Bild übernommen: `iCarrierID`, `iStepNo`, `iResourceID`, `iPar1`, `iPar2`, `iPar3`, `iPar4`, `ldtTimeStamp`.
- Siemens-Startwerte übernommen: `128`, `2`, `2`, `1`, `3`, `5`, `7`, Epoch-Zeitstempel.
- Integer als OPC-UA-`Int16`, Zeitstempel als `DateTime`; alle Variablen les- und schreibbar.
- Backend-Polling, Node-Allowlist und Edge-Frontend auf die DB151-NodeIds umgestellt.
- Edge-Seite zeigt Werkstückträger, Workplan-Schritt, Stationsnummer, Deckelfarbe sowie rote, grüne und blaue Kugeln.
- Backend- und Frontend-Build erfolgreich.
- Alle acht Nodes per REST gelesen und kompletter DB151-Datensatz über JWT-WebSocket verifiziert.
- Kein Commit und kein Push durchgeführt.

### [14:00] Mehrstations-Carrier-Routing mit erfundenem stMES-Demovertrag
**Prompts:** Architekturhinweise zu stationsbezogenem `stMES` und reisendem `dbProcessData`; anschließend: "nein hab ich gerade nicht, erfinde daten zum zweck der demo, später werden diese geändert, bitte genau dokumentieren das es sich hier um test daten handelt!"
- Lokale PDFs geprüft: vorhanden waren nur DB151 und eine grobe MES-/Stationsskizze, keine echte stMES-UDT-Tabelle.
- Erfundenen Demo-Vertrag ausdrücklich als nicht produktiv gekennzeichnet und in `docs/guides/07-stmes-demo-contract.md` vollständig dokumentiert.
- `CarrierEntity`, Carrier-API und Frontend-Seite `/carriers` implementiert.
- Normalisierte `OrderRouteStepEntity` und Route-API für Workplans implementiert.
- Maschinenmodell um Resource-ID und OPC-UA-Stationskonfiguration ergänzt.
- `StMesHandshakeEntity` als dauerhaftes Request-/Response-/Acknowledgement-Journal ergänzt.
- Zwei unabhängige Demo-Stationen mit eigenen `State`, `Query` und DB151-Bäumen im Testserver implementiert.
- Subscription-basierten Demo-Handshake `xStart → xQryBusy → xDone/xError → xStart=false` implementiert.
- Transaktionale Carrier-Auflösung und parallele Verarbeitung je Station implementiert.
- Subscription auf DB151-Zeitstempel schließt Routenschritte ab, schaltet Carrier weiter und aktualisiert Auftragsfortschritt.
- Demo-Resultcodes 0, 1, 2, 3, 4 und 9 definiert; Wiederholungen abgeschlossener Schritte sind idempotent.
- Reproduzierbaren, klar als Testdaten markierten Seed `npm run seed:stmes-demo` ergänzt.
- Multi-Station-WebSocket und Edge-Anzeige verifiziert; beide Resource-IDs 1 und 2 empfangen.
- Erfolgreich getestet: beide Stationen Resultcode 0, Carrier 128 auf Schritt 2 und Carrier 129 abgeschlossen.
- Modellprüfung korrigiert: Routenschritte sind wiederverwendbare Definitionen; Ausführungsstatus wird pro Carrier und Handshake gespeichert, damit mehrere Carrier denselben Workplan nutzen können.
- Kein Commit und kein Push durchgeführt.

### [14:18] Erneute End-to-End-Verifikation nach Modellkorrektur
**Prompt:** "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."
- Backend und Zwei-Stationen-OPC-UA-Testserver mit dem aktuellen Build neu gestartet und Demo-Daten erneut reproduzierbar geseedet.
- Beide Erstabfragen liefern Resultcode 0; Wiederholungen an der falschen beziehungsweise bereits abgeschlossenen Station liefern stabil Resultcode 3 und 4.
- Carrier 128 wurde korrekt auf Schritt 2 weitergeschaltet; Carrier 129 wurde abgeschlossen.
- Auftragsfortschritt ist korrekt `1/2`: Carrier 128 hat noch Schritt 2 offen, nur Carrier 129 ist vollständig abgeschlossen. Die frühere Angabe `2/2` war nach der Modellkorrektur fachlich falsch und wurde berichtigt.
- Persistiertes Handshake-Journal und das bereinigte Routenschritt-Schema verifiziert; Ausführungsstatus liegt nicht mehr auf den wiederverwendbaren Routenschritten.
- Backend- und Frontend-Build, Backend-Testkommando, beide npm-Audits und `git diff --check` erfolgreich; das Repository enthält derzeit keine Jest-Tests.
- Kein Commit und kein Push durchgeführt.

### [14:22] Gantt-Diagramm fuer den heutigen Arbeitstag
**Prompt:** "kannst du ein gantt diagramm erstellen von dem was heute alles gemacht wurde, teile es auf 3 personen auf, und zeitlich realistisch wir haben gearbeitet von 9:30 bis 15:00"
- Retrospektives Mermaid-Gantt fuer den Zeitraum 09:30-15:00 Uhr in `docs/gantt-2026-07-22.md` erstellt.
- Aufgaben realistisch auf Backend/Security, Frontend/Dokumentation und OPC-UA/Integration verteilt.
- Fuer jede Person eine gestaffelte Pause von 30 Minuten eingeplant; dies ergibt 15 Personenstunden Arbeitszeit bei 16,5 Personenstunden Anwesenheit.
- Die Zuordnung ist als nachtraegliche Kapazitaetsplanung gekennzeichnet, da keine personenbezogene Zeiterfassung vorliegt.
- Kein Commit und kein Push durchgeführt.

### [14:38] Dynamische, SPS-getriebene Edge-Prozessansicht
**Prompts:** "erkläre das, es sieht zudem statisch aus" / "tu das" / "wichtig ist das es so funktioniert wie in echt, also das man am ende nur den test server entfernen muss und die echte verbindung macht"
- Ursache der statischen Wirkung analysiert: Das Backend sendete sekündlich identische DB151-Snapshots, während Query-Phasen und Resultcodes im Frontend nicht sichtbar waren.
- OPC-UA-Telemetrie um aktuelle stMES-Query-Signale und ereignisgetriebene Phasen für Anfrage, Busy, Antwort, Quittierung und Prozessabschluss erweitert.
- Persistiertes Handshake-Journal über `GET /api/edge/stmes/handshakes` für Reload-feste Ereignishistorie bereitgestellt.
- Edge-Seite um Live-Alter, Signalstatus, Resultcodes, Änderungsmarkierung, Stations-Timeline und Carrier-Route erweitert; Rohtelemetrie ist weiterhin aufklappbar verfügbar.
- Bewusst keinen Demo-Replay-Endpunkt im Produktivbackend ergänzt: Nur der austauschbare Testserver initiiert SPS-Signale.
- Testserver bildet einen realistischen Ablauf ab: Carrier 128 von Station 1 zu Station 2, Carrier 129 an Station 2, danach Fehlerfälle für falsche Station und unbekannten Carrier.
- End-to-End verifiziert: beide Carrier `completed`, Auftrag `DEMO-ORDER-001` auf `2/2 completed`, Live-Phasen und Resultcodes 0, 3 und 1 über authentifizierten WebSocket empfangen.
- Echte UDT-Dokumentation bleibt Voraussetzung dafür, dass später ausschließlich Endpoint und Testserver ausgetauscht werden können.
- Kein Commit und kein Push durchgeführt.

### [14:41] Scroll-Verhalten der Fachseiten korrigiert
**Prompt:** "auf dem dashboard auf der seite edge gateway lässt sich nicht scrollen"
- Ursache im globalen App-Layout gefunden: Der `h-screen`-Rahmen unterdrückte mit `overflow-hidden` den Dokument-Scroll, während der Inhaltsbereich keinen eigenen Scroll-Container besaß.
- Den zentralen Inhaltsbereich mit `min-h-0`, `min-w-0` und `overflow-y-auto` als vertikalen Scroll-Container definiert.
- Sidebar mit `shrink-0` gegen unbeabsichtigtes Zusammendrücken im Flex-Layout abgesichert.
- Die Korrektur gilt zentral für Edge und alle anderen langen Fachseiten.
- Kein Commit und kein Push durchgeführt.

### [14:48] MQTT-Subscribe im Edge-Browser verifiziert
**Prompt:** "teste mqtt subscribe es und zeig es im browser an"
- Vorhandene Subscriptions und den MQTT-zu-WebSocket-Pfad geprüft.
- Echte QoS-1-Testnachricht auf `mes/machines/demo-01/telemetry` publiziert und den Empfang als authentifizierte `edge.telemetry` mit `source: mqtt` verifiziert.
- MQTT-Service um einen flüchtigen Verlauf der letzten 50 empfangenen Nachrichten ergänzt und über `GET /api/edge/mqtt/messages` bereitgestellt.
- Edge-Seite um einen eigenen Bereich "MQTT Subscribe" mit Brokerstatus, Topic, Empfangszeit und dynamischer Payload-Darstellung erweitert.
- Testpayload mit `temperature: 43.2`, `pressure: 6.4`, `state: running` live über WebSocket und anschließend über den Verlauf-Endpunkt gelesen.
- Backend- und Frontend-Build sowie `git diff --check` erfolgreich; Edge-Route liefert HTTP 200.
- Kein Commit und kein Push durchgeführt.

### [15:02] Phase 2 gestartet und Orders-CRUD abgeschlossen
**Prompt:** "ok. starte phase 2. was ist da zu tun?"
- Phase-2-Umfang erläutert: vollständige Frontend-Funktionen für Orders, Alarme, Traces, globales Fehlerhandling und Maschinen-Bulkimport.
- Festgestellt, dass keine Orders-Seite existierte und das PATCH-DTO nur Status, Fortschritt und Fehlertext unterstützte.
- Neue Seite `/orders` mit Navigation, Dashboard-Schnellzugriff, Kennzahlen, Suche, Statusfilter, Fortschritt, Erstellen-, Bearbeiten- und Löschdialog umgesetzt.
- Rollen umgesetzt: Viewer liest, Operator/Admin erstellen und bearbeiten, nur Admin löscht.
- Backend-PATCH um Name, Priorität, Station, Operation, Menge sowie Start- und Zieltermin erweitert.
- Integritätsregeln ergänzt: Fertigmenge kann Gesamtmenge nicht überschreiten; Aufträge mit zugeordneten Carriern können nicht gelöscht werden.
- CRUD-End-to-End gegen PostgreSQL verifiziert und temporären Testauftrag wieder gelöscht; Schutz des Demo-Auftrags mit HTTP 400 verifiziert.
- Backend-/Frontend-Build, beide npm-Audits und `git diff --check` erfolgreich; weiterhin keine Jest-Testdateien vorhanden.
- Roadmap-Punkt 2.1 als abgeschlossen markiert. Kein Commit und kein Push durchgeführt.

### [15:05] Gesamtfortschritt dokumentiert
**Prompt:** "dokumentiere alles. wo sind wir jetzt wieviel prozent fertig?"
- Implementierung, Berechtigungen, Integritätsregeln, Tests und Bedienung von Phase 2.1 sind in `docs/guides/08-orders-crud.md`, `docs/api.md` und diesem Session-Log dokumentiert.
- Roadmap um einen datierten Fortschrittsblock mit transparenter Berechnung ergänzt.
- Vollständig abgeschlossen sind 7 von 38 Aufgaben: Phase 1.1 bis 1.6 sowie Phase 2.1; dies entspricht 18,4 % ohne Teilanrechnung.
- Phase 4.2 und Phase 6.3 sind teilweise umgesetzt. Bei hälftiger Anrechnung liegt der Planungsfortschritt bei 21,1 %.
- Phase 1 steht bei 100 %, Phase 2 aktuell bei 20 %; nächster Arbeitspunkt ist Phase 2.2.
- Kein Commit und kein Push durchgeführt.

### [15:50] Phase 2/3 abgeschlossen und stMES-Demo stabilisiert
**Prompts:** "mache phase 2 alarme weiter" / "weiter" / "dann phase 3" / "DEMO-ORDER-001 wurde angelegt, sieht aber nicht so aus als würde sie bearbeitet werden" / "aktualisiere die roadmap"
- Phase 2 vollständig abgeschlossen: Alarme mit Inline-Acknowledge, Bulk-Operationen und CSV-Export; Traces mit `key_data_point`- und Min/Max-Value-Filter; Machines mit CSV-Template und CSV-Bulkimport.
- Beispielalarm-Seed `tools/seed-demo-alarms.js` ergänzt und 12 Testalarme erzeugt; Admin-Passwort lokal wieder auf `admin123!` gesetzt.
- Phase 3 technisch umgesetzt: Docker Compose auf `timescale/timescaledb:latest-pg16`, TimescaleDB-Container `mes_db` auf Port 5433, `data_points` als Hypertable, tägliches Chunking, Compression ab 7 Tagen, Retention 90 Tage und Continuous Aggregate `data_points_1min`.
- Reproduzierbare Skripte ergänzt: `npm run phase3:apply` und `npm run benchmark:timescale`.
- Lokaler Benchmark: 10.000 Messpunkte in ca. 0,28 s, rund 36.364 writes/sec. Funktional erfolgreich, Roadmap-Ziel >50K/sec noch offen für spätere Optimierung.
- Backend-Start nach Timescale-Fix repariert: TypeORM-Schema-Synchronisierung ist nun nur noch mit `TYPEORM_SYNCHRONIZE=true` aktiv, damit Hypertables nicht durch automatische Primary-Key-Neuanlage blockiert werden.
- stMES-Reconnect-Lücke behoben: Bereits aktive `xStart=true` SPS-Anfragen werden beim OPC-UA-Polling nacherkannt, nicht nur über Subscription-Change-Events.
- Retained MQTT-Webshop-Payload geleert, um ungewollte Wiederanlage alter `WEBSHOP-*` Aufträge beim Backend-Neustart zu vermeiden.
- Demo-Zyklus zurückgesetzt und erfolgreich verifiziert: `DEMO-ORDER-001` lief mit Carrier 128/129 über Resource 1, 2 und 3 bis `completed_quantity = 2/2`, beide Carrier `completed`.
- Roadmap auf Phase 2 = 100 %, Phase 3 = 100 % technisch umgesetzt, Gesamtfortschritt 21/48 = 43,8 % vollständig aktualisiert.
- Kein Commit und kein Push durchgeführt.
