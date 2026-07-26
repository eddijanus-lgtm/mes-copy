# Normen-Gap-Analyse und Nachweismatrix

**Projekt:** WARA MES / Shopfloor Gateway

**Stand:** 26. Juli 2026

**Dokumentstatus:** Arbeitsstand 0.1 – technische Vorprüfung
**Technische Basis:** Git-Commit `552908acadf67a865c2cd9024e99497d1ed81113` einschließlich der zum Prüfzeitpunkt vorhandenen, noch nicht committeten Änderungen

## 1. Zweck und Abgrenzung

Dieses Dokument vergleicht den aktuellen Projektstand mit wesentlichen Themenfeldern verbreiteter Industrie- und ISO/IEC-Normen. Es beantwortet:

- Was ist im Quellcode oder in der Projektdokumentation bereits nachweisbar?
- Welche technische oder organisatorische Lücke besteht?
- Welcher Nachweis wird für eine belastbare Prüfung noch benötigt?
- Welche Maßnahmen haben vor einem produktiven Einsatz Vorrang?

Die Analyse ist **keine Zertifizierung und keine formale Konformitätsbewertung**. Sie basiert auf dem aktuellen Repository, ausgeführten Builds und Tests sowie öffentlich verfügbaren Normbeschreibungen. Für eine formale Bewertung werden die lizenzierten Volltexte der gewählten Normen, ein verbindlich festgelegter Geltungsbereich und gegebenenfalls eine akkreditierte Prüfstelle benötigt.

## 2. Bewertungsrahmen

| Norm oder Referenz | Relevanz für das Projekt | Einordnung |
|---|---|---|
| IEC 62264-1/-2/-3 | MES-Funktionen, Informationsmodelle und Schnittstellen zwischen Unternehmens- und Produktionsleitebene | Kernreferenz |
| IEC 62443-2-1/-3-3/-4-1 | OT-Sicherheitsprogramm, technische Systemanforderungen und sicherer Entwicklungslebenszyklus | Kernreferenz |
| IEC 62541 / OPC UA | Interoperable und sichere industrielle Kommunikation | Kernreferenz für OPC UA |
| ISO/IEC 27001 und 27002 | Informationssicherheits-Managementsystem und Sicherheitsmaßnahmen | Organisations- und Betriebsreferenz |
| ISO/IEC 25010 | Qualitätsmodell für Software und Systeme | Qualitätsreferenz |
| ISO 9001 | Qualitätsmanagement, beherrschte Prozesse und dokumentierte Nachweise | Organisationsreferenz |
| ISO 13849-1 | Sicherheit von Maschinensteuerungen | Nur relevant, wenn das MES eine Sicherheitsfunktion übernimmt oder beeinflusst |

Bewertungsstatus:

- **Erfüllt:** Implementierung und geeigneter Nachweis sind vorhanden.
- **Teilweise:** Eine technische Grundlage ist vorhanden, aber Umsetzung oder Nachweis ist unvollständig.
- **Offen:** Die Anforderung ist nicht belastbar umgesetzt oder nicht nachgewiesen.
- **Abzugrenzen:** Die Anwendbarkeit muss durch eine Risiko- und Geltungsbereichsentscheidung geklärt werden.

## 3. Gesamteinschätzung

| Themenfeld | Status | Kurzbegründung |
|---|---|---|
| MES-Funktionsumfang und IEC-62264-Nähe | Teilweise | Aufträge, Produkte, Routen, Ressourcen, Carrier und Produktionsdaten sind vorhanden; ein formales IEC-62264-Informationsmodell und Level-3/Level-4-Verträge fehlen. |
| API und Interoperabilität | Teilweise | REST-API und OpenAPI/Swagger sind vorhanden; Versionierung, vollständige Antwortverträge, Idempotenz und Lebenszyklusregeln fehlen. |
| OT- und Anwendungssicherheit | Offen | Authentifizierung, Rollen und Eingabevalidierung sind vorhanden; Zonenmodell, sichere OPC-UA-/MQTT-Konfiguration, Audit-Trail und Security-Lifecycle fehlen. |
| Softwarequalität | Teilweise | Builds und 267 Tests sind erfolgreich; Coverage und automatisierte Quality Gates reichen noch nicht aus. |
| Betrieb und Ausfallsicherheit | Offen | Reconnect und einfache Health-Endpunkte existieren; echte Dependency-Checks, Backups, Restore-Tests, Migrationen, Monitoring und Wiederanlaufnachweise fehlen. |
| Qualitäts- und Sicherheitsmanagement | Offen | Technische Dokumente sind vorhanden; freigegebene Prozesse, Verantwortlichkeiten, Änderungsnachweise, Risikoakte und interne Audits fehlen. |
| Funktionale Sicherheit | Abzugrenzen | Das System bietet Maschinenbefehle, darf aber ohne gesonderten Sicherheitsnachweis keine Sicherheitsfunktion übernehmen. |

**Fazit:** Die Architektur eignet sich als Entwicklungs- und Demonstrationsbasis. Für einen industriellen Produktivbetrieb fehlen vor allem beherrschte Betriebsprozesse, Security-by-Design-Nachweise, verlässliche Produktionsdaten und eine formal dokumentierte Systemgrenze.

## 4. Normen- und Nachweismatrix

### 4.1 MES, Informationsmodell und Schnittstellen

| ID | Ziel | Status | Vorhandener Nachweis | Lücke und erforderlicher Nachweis |
|---|---|---|---|---|
| MES-01 | MES-Funktionen und Level-3-Systemgrenze festlegen | Teilweise | Module für Aufträge, Produkte, Routen, Maschinen, Carrier, Material, Trace und Datenerfassung; `docs/architecture.md` | Verbindlichen Geltungsbereich, Verantwortlichkeiten und Abgrenzung zu ERP, SCADA/SPS und Safety-Systemen freigeben. |
| MES-02 | Einheitliches Produktions- und Ressourcenmodell | Teilweise | Entities und DTOs in `src/orders`, `src/products`, `src/machines`, `src/carriers` und `src/materials` | Begriffe und Attribute gegen IEC 62264 mappen; Master-Data-Owner, Lebenszyklen und Pflichtfelder dokumentieren. |
| MES-03 | Beherrschte Produktionsrouten und Statusübergänge | Teilweise | Transaktionen und pessimistische Sperren in `src/orders/routing.service.ts` | Formale Zustandsautomaten, erlaubte Übergänge, Fehlerfälle und Abnahmetests fehlen. Mehrere Statusfelder sind freie Strings. |
| MES-04 | Integrität referenzieller Produktionsdaten | Offen | Eindeutigkeitsregeln und eine Versionsspalte bei Carriern | Viele fachliche UUID-Verweise besitzen keine nachgewiesenen Datenbank-Fremdschlüssel; Integritätsregeln und Migrationsnachweis fehlen. |
| MES-05 | Nachvollziehbarkeit und Genealogie | Teilweise | Trace-, Data-Collection- und Handshake-Daten werden gespeichert | Aufbewahrung, Unveränderbarkeit, Korrekturverfahren, Zeitqualität und lückenlose Produktgenealogie sind nicht nachgewiesen. |
| MES-06 | Level-3/Level-4-Nachrichtenverträge | Teilweise | Webshop-Aufträge über MQTT und REST-Verträge | Kanonisches Nachrichtenmodell, Schema-Versionierung, Message-ID, Idempotenz, Dublettenbehandlung und fachliche Bestätigungen fehlen. |
| MES-07 | Verlässliche Produktionskennzahlen | Offen | Schichtbericht-Endpunkte und DTOs | `src/shifts/shifts.service.ts` erzeugt OEE-, Durchsatz- und Stillstandswerte teilweise per `Math.random()`. Vor Produktivbetrieb durch berechnete, rückverfolgbare Werte ersetzen. |
| API-01 | Maschinenlesbare API-Dokumentation | Teilweise | OpenAPI/Swagger-Konfiguration in `src/swagger.ts`; Tags, standardisierte Erfolgs- und Fehlerverträge, Beispiele, Security-Scheme und OpenAPI-Vertragstest | Für komplexe fachliche Antworten sollten schrittweise noch spezifische Response-DTOs anstelle des generischen Fallback-Schemas ergänzt werden. |
| API-02 | Stabiler API-Lebenszyklus | Erfüllt | Versionierter `/api/v1`-Vertrag, vorübergehender unversionierter Kompatibilitätspfad und `docs/guides/11-api-lifecycle.md` | Abschaltung des Kompatibilitätspfads erst nach dokumentierter Clientprüfung durchführen. |
| API-03 | Robuste Schreiboperationen | Teilweise | Validierung, Transaktionen und Konfliktbehandlung in Teilen der Anwendung | Idempotency Keys, einheitliche Concurrency-Kontrolle und Wiederholungssemantik für alle kritischen Befehle fehlen. |

### 4.2 OT-, Kommunikations- und Anwendungssicherheit

| ID | Ziel | Status | Vorhandener Nachweis | Lücke und erforderlicher Nachweis |
|---|---|---|---|---|
| SEC-01 | Rollenbasierter Zugriff mit minimalen Rechten | Teilweise | Globale JWT- und Rollen-Guards; Rollen `admin`, `operator`, `viewer` | Rollen-/Rechtematrix, regelmäßige Rezertifizierung, Benutzer-Deaktivierung und Separation of Duties fehlen. |
| SEC-02 | Sichere Anmeldung und Sitzungen | Teilweise | Bcrypt, Login-Drosselung und JWT-Ablaufzeit | MFA, Kontosperre, Token-Widerruf/-Rotation, Issuer/Audience, Schlüsselrotation und dokumentierte Passwortregeln fehlen. |
| SEC-03 | Schutz von Browser-Sitzungen | Offen | Tokenbasierter API-Zugriff | JWT wird in `frontend/src/providers/AuthProvider.jsx` im `localStorage` gespeichert. Eine XSS-resistentere Sitzungsstrategie und aktivierte CSP fehlen. |
| SEC-04 | Sichere OPC-UA-Kommunikation | Offen | Reconnect, Node-ID-Allowlist und Profiltypen für Security-Optionen | Der Runtime-Client in `src/opcua/opcua.service.ts` erstellt eine anonyme Session ohne nachgewiesene Security Policy, Signierung/Verschlüsselung, Zertifikatsvertrauen oder Widerrufsprüfung. |
| SEC-05 | Sichere MQTT-Kommunikation | Offen | Topic-Allowlist und Gateway-Service | Standardwert ist unverschlüsseltes `mqtt://`; TLS/mTLS, Broker-ACLs, Identitätsverwaltung und Zertifikatswechsel fehlen. MQTT ist aktuell nachrangig, bleibt aber vor Produktivnutzung abzusichern. |
| SEC-06 | OT-Zonen und sichere Kommunikationswege | Offen | Architekturübersicht des Gateways | Zonen-/Conduit-Modell, Firewall-Regeln, Netzwerksegmentierung, erlaubte Datenflüsse und Ziel-Security-Level fehlen. |
| SEC-07 | Nachvollziehbare sicherheitsrelevante Aktionen | Offen | Fachliche Logs und Handshake-Daten in Teilen vorhanden | Manipulationsgeschützter Audit-Trail für Login, Rechteänderungen, Konfigurationen und Maschinenbefehle mit Benutzer, Zeit und Ergebnis fehlt. |
| SEC-08 | Schwachstellen- und Abhängigkeitsmanagement | Offen | `package-lock.json` ermöglicht reproduzierbare Abhängigkeitsauflösung | `npm audit --omit=dev` meldet am 26.07.2026 zwei High-Severity-Funde (`@nestjs/swagger`/`js-yaml`). Prozess, SLA, SBOM, Scan-Gate und dokumentierter Fix fehlen. |
| SEC-09 | Sicherer Entwicklungslebenszyklus | Offen | Reviews und Tests sind über Git grundsätzlich möglich | Security-Anforderungen, Threat Modeling, Secure-Coding-Regeln, SAST/DAST, Dependency Scan, Freigabe und Vulnerability-Disclosure-Prozess fehlen. |
| SEC-10 | Geheimnisse und Transportverschlüsselung | Teilweise | `.env` ist ignoriert; `.env.example` verwendet Platzhalter; Reverse-Proxy-Beispiel nennt TLS | Secret Store, Rotation, TLS-Erzwingung, Zertifikatsbetrieb und Nachweis sicherer Produktionskonfiguration fehlen. |
| SEC-11 | Sichere Standardkonfiguration | Offen | Eingabevalidierung, Helmet und CORS-Allowlist | CSP ist explizit deaktiviert; Swagger ist nicht produktionsabhängig beschränkt; Compose enthält ein Default-Passwort und veröffentlicht den Datenbankport. |
| SEC-12 | Sicherheitsvorfälle und Wiederherstellung | Offen | Keine belastbaren Nachweise gefunden | Incident-Response-Plan, Kontakte, Meldewege, Forensik- und Wiederanlaufverfahren sowie Übungen dokumentieren. |

### 4.3 Softwarequalität, Verfügbarkeit und Betrieb

| ID | Ziel | Status | Vorhandener Nachweis | Lücke und erforderlicher Nachweis |
|---|---|---|---|---|
| QUA-01 | Funktionale Eignung | Teilweise | Backend- und Frontend-Build erfolgreich; am 26.07.2026 sind 17 Testsuiten mit 267 Tests vollständig grün | Anforderungen und Tests müssen noch durchgängig rückverfolgbar werden; eine verbindliche Coverage-Grenze fehlt. |
| QUA-02 | Automatisierte Qualitätskontrollen | Offen | Lokale Build- und Testskripte | Keine CI-Pipeline oder verpflichtenden Gates für Build, Tests, Coverage, Lint, Security und Artefakte gefunden. |
| QUA-03 | Wartbarkeit und Änderbarkeit | Teilweise | Modulare NestJS-Struktur, DTOs und zentrale Guards/Filter | Doppelte Datenbankkonfiguration, zahlreiche lose Typen und fehlende Architekturentscheidungen erschweren beherrschte Änderungen. |
| QUA-04 | Performance und Kapazität | Teilweise | TimescaleDB-Konzept und Benchmark-Skript; dokumentierter lokaler Wert von etwa 36.496 Writes/s | Lastprofil, Kapazitätsgrenzen, repräsentative Lasttests und SLOs fehlen; dokumentiertes Ziel von 50.000 Writes/s ist nicht erreicht. |
| OPS-01 | Wahrheitsgetreue Zustandsüberwachung | Offen | `/health` und `/health/combined` vorhanden | `src/health/health.controller.ts` meldet OPC UA und MQTT statisch als `available`. Echte Readiness-/Liveness- und Dependency-Prüfungen fehlen. |
| OPS-02 | Beherrschte Datenbankänderungen | Offen | TypeORM und ein Timescale-Setup-Skript vorhanden | Keine allgemeine, versionierte Migrationskette; zwei unterschiedliche `synchronize`-Konfigurationen; Rollback- und Freigabenachweis fehlen. |
| OPS-03 | Datensicherung und Wiederanlauf | Offen | Persistentes Docker-Volume | Backupplan, Verschlüsselung, RPO/RTO, Restore-Anleitung und protokollierter Restore-Test fehlen. |
| OPS-04 | Protokollierung und Monitoring | Teilweise | NestJS-Logging und Prozessmanager-Beispiel | Zentrale strukturierte Logs, Metriken, Alarmierung, Korrelation, Aufbewahrung, Zugriffsschutz und Manipulationsschutz fehlen. |
| OPS-05 | Kontrolliertes Deployment | Offen | PM2- und Reverse-Proxy-Beispiele in `docs/deploy.md` | Unveränderliche Images, signierte Artefakte, Staging/Production-Promotion, Rollback, Konfigurationsbaseline und Deployment-Protokoll fehlen. |
| OPS-06 | Geordneter Prozess-Lebenszyklus | Teilweise | Graceful-Shutdown-Hooks vorhanden | Signalbehandlung beendet den Prozess auch bei regulärem Shutdown mit Exit-Code 1; Verhalten und Wiederanlauftest korrigieren und nachweisen. |

### 4.4 Managementsystem, Dokumentation und funktionale Sicherheit

| ID | Ziel | Status | Vorhandener Nachweis | Lücke und erforderlicher Nachweis |
|---|---|---|---|---|
| GOV-01 | Verbindlicher Geltungsbereich und Verantwortlichkeiten | Offen | Projekt- und Architekturtexte | Systemgrenze, Asset Owner, Product Owner, Security-Verantwortung, Datenverantwortung und Freigabebefugnisse fehlen. |
| GOV-02 | Risiko- und Maßnahmenmanagement | Offen | Einzelne technische Schutzmaßnahmen | Freigegebene Risikoanalyse mit Bedrohungen, Auswirkungen, Bewertung, Maßnahmen, Restrestrisiko und Owner fehlt. |
| GOV-03 | Dokumenten- und Änderungslenkung | Teilweise | Git-Historie und Dokumentationsordner | Dokumente besitzen überwiegend keine Owner, Prüfer, Freigabe, Version, Review-Termin oder nachvollziehbare Genehmigung. |
| GOV-04 | Anforderungen und Abnahme | Offen | Roadmap und Tests | Eindeutige Anforderungen, Normzuordnung, Akzeptanzkriterien und Requirements-to-Test-Traceability fehlen. |
| GOV-05 | Nichtkonformität und Verbesserung | Offen | Git-Issues wären technisch nutzbar, sind lokal aber nicht nachweisbar | Definierter Fehler-, Ursachenanalyse-, CAPA- und Wirksamkeitsprüfungsprozess fehlt. |
| GOV-06 | Lieferanten und Komponenten | Offen | Abhängigkeitsdateien und Container-Image-Angaben | Lieferantenbewertung, Komponentenfreigabe, EOL-Überwachung, SBOM und Lizenz-/Vulnerability-Prüfung fehlen. |
| SAF-01 | MES von funktionaler Sicherheit abgrenzen | Abzugrenzen | Maschinensteuerungs-Endpunkte und direkte OPC-UA-Schreibzugriffe sind vorhanden | Schriftlich festlegen, dass das MES keine Schutzfunktion ersetzt. Befehle risikobewerten; sichere Zustände, lokale Verriegelungen und Autorisierung nachweisen. |
| SAF-02 | Safety-Anforderungen bei tatsächlicher Sicherheitsfunktion | Abzugrenzen | Kein Safety-Lifecycle-Nachweis gefunden | Falls das MES eine Sicherheitsfunktion übernimmt oder beeinflusst: PLr/SIL-Bewertung, validierte Architektur und unabhängige Safety-Prüfung sind erforderlich. |

## 5. Priorisierte Maßnahmen

### P0 – vor jedem realen Produktionsbetrieb

1. **Reale Daten statt Simulation:** Zufallswerte aus den Schicht- und OEE-Berichten entfernen; Berechnung, Datenherkunft und Qualitätskennzeichen nachweisen.
2. **Safety-Grenze festlegen:** Maschinenbefehle inventarisieren, sichere lokale Verriegelungen voraussetzen und dokumentieren, dass das MES keine Safety-Steuerung ersetzt.
3. **Echte Betriebszustände:** Health-Endpunkte an Datenbank, OPC UA und gegebenenfalls MQTT anbinden; Readiness, Liveness und Degraded State unterscheiden.
4. **Daten schützen:** Versionierte Migrationen, automatisierte Backups, definiertes RPO/RTO und erfolgreichen Restore-Test etablieren.
5. **High-Severity-Funde behandeln:** Advisory prüfen, sichere Paketversion festlegen, vollständigen Test ausführen und Entscheidung dokumentieren.
6. **Sichere OT-Kommunikation:** OPC UA mindestens mit Signierung/Verschlüsselung, Zertifikatsvertrauen und eindeutiger Identität betreiben; unverschlüsselte Produktionsverbindungen sperren.

### P1 – technische Industrialisierung

1. Zonen-/Conduit- und Datenflussmodell einschließlich Firewall- und Identitätsregeln erstellen.
2. Manipulationsgeschützten Audit-Trail für Benutzer-, Konfigurations- und Maschinenaktionen implementieren.
3. Den grünen Teststand erhalten und CI-Gates für Build, Test, Coverage, Lint, SAST und Dependency Audit einführen.
4. IEC-62264-Mapping, Statusautomaten, Master-Data-Verantwortung und Level-3/Level-4-Verträge dokumentieren.
5. Idempotenz für kritische Schreiboperationen ergänzen und fachliche Response-DTOs schrittweise weiter präzisieren.
6. Browser-Sitzungsmodell härten, CSP aktivieren und produktiven Swagger-Zugriff beschränken.

### P2 – Audit- und Betriebsreife

1. ISMS-/QMS-Geltungsbereich, Rollen, Risikoakte und dokumentierte Freigabeprozesse etablieren.
2. Incident Response, Vulnerability Management, Patch-SLAs, SBOM und EOL-Management nachweisen.
3. SLOs, Lastprofile, Monitoring, Alerting, Log-Aufbewahrung und Wiederanlaufübungen einführen.
4. Anforderungen, Tests und Normbezug in einer durchgängigen Traceability-Matrix verbinden.
5. Interne Vorprüfung durchführen, Abweichungen behandeln und erst danach eine externe Konformitäts- oder Zertifizierungsprüfung planen.

## 6. Erforderliches Nachweispaket

Für eine spätere interne oder externe Prüfung sollte mindestens folgendes Nachweispaket versioniert vorliegen:

- freigegebener System-Scope und Architektur mit IT-/OT-/Safety-Grenzen;
- Asset-, Datenfluss-, Rollen- und Schnittstelleninventar;
- IEC-62264-Domänen- und Nachrichtenmapping;
- Risikoanalyse, Threat Model, Zonen-/Conduit-Modell und Maßnahmenplan;
- Security- und Quality-Anforderungen mit Freigabekriterien;
- SBOM, Scan-Berichte, Patch- und Schwachstellenprotokolle;
- CI-Protokolle für Build, Tests, Coverage und Security-Prüfungen;
- API-Spezifikation, Contract-Tests und Versions-/Deprecation-Regeln;
- Migrations-, Backup-, Restore-, Rollback- und Disaster-Recovery-Nachweise;
- Audit-Logs und Regeln für Aufbewahrung, Zugriff und Manipulationsschutz;
- Release Notes, Change Approvals, Abnahmeprotokolle und bekannte Restrisiken;
- Schulungs-, Incident-, CAPA- und interne Auditnachweise;
- bei Safety-Relevanz eine separate funktionale Sicherheitsakte.

## 7. Definition of Done für „industriereif“

Das Projekt sollte erst dann als industriereif bezeichnet werden, wenn:

- alle P0-Maßnahmen abgeschlossen und abgenommen sind;
- alle verpflichtenden Builds, Tests und Security-Gates reproduzierbar grün sind;
- keine unbehandelte kritische oder hohe Schwachstelle ohne genehmigte Risikobehandlung besteht;
- Produktionsdaten nachweislich real, korrekt, zeitlich nachvollziehbar und gegen unkontrollierte Änderung geschützt sind;
- Backup, Restore, Rollback, Netzwerkunterbrechung und Wiederanlauf praktisch getestet wurden;
- OT-Verbindungen authentifiziert und verschlüsselt sind;
- jede Maschinenaktion einem Benutzer oder technischen Principal zugeordnet und auditiert wird;
- Anforderungen, Risiken, Maßnahmen und Tests durchgängig rückverfolgbar sind;
- verantwortliche Personen Scope, Restrisiken und Produktionsfreigabe dokumentiert genehmigt haben.

## 8. Referenzen

- ISO, IEC 62264-1:2013: <https://www.iso.org/standard/57308.html>
- ISO, IEC 62264-2:2026: <https://www.iso.org/standard/86536.html>
- ISO, IEC 62264-3:2016: <https://www.iso.org/standard/67480.html>
- IEC, IEC 62443-2-1:2024: <https://webstore.iec.ch/en/publication/62883>
- IEC, IEC 62443-3-3:2013: <https://webstore.iec.ch/en/publication/7033>
- IEC, IEC 62443-4-1:2018: <https://webstore.iec.ch/en/publication/33615>
- ISO, ISO/IEC 27001:2022: <https://www.iso.org/standard/27001>
- ISO, ISO/IEC 27002:2022: <https://www.iso.org/standard/75652.html>
- ISO, ISO/IEC 25010:2023: <https://www.iso.org/standard/78176.html>
- ISO, ISO 9001:2015 und Revision in Entwicklung: <https://www.iso.org/standard/88464.html>
- ISO, ISO 13849-1:2023: <https://www.iso.org/standard/73481.html>
- OPC Foundation, OPC UA und IEC 62541: <https://opcfoundation.org/wp-content/uploads/2023/05/OPC-UA-Interoperability-For-Industrie4-and-IoT-EN.pdf>
