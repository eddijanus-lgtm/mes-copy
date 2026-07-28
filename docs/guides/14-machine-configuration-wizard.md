# 14 - Wizard „Maschine konfigurieren“

_Stand: 28. Juli 2026_  
_Status: Implementierung geprüft; bekannte Lücken sind in diesem Dokument ausgewiesen._

## Zweck und Abgrenzung

Der Wizard erstellt und versioniert Maschinenprofile. Ein Profil beschreibt die
MES-Sicht auf eine Maschine, ihre Stationen, deren OPC-UA-Verbindungen und die
Zuordnung technischer OPC-UA-Nodes zu fachlichen Signalen. Es ersetzt weder
SPS-Logik noch Maschinen- oder Arbeitssicherheitsfunktionen.

Dieses Dokument beschreibt den tatsächlich implementierten Stand in Frontend,
Backend und Datenbank. Anforderungen, die fachlich benötigt, im Wizard aber
noch nicht vollständig umgesetzt sind, stehen getrennt unter
[Ergebnis der Vollständigkeitsprüfung](#ergebnis-der-vollständigkeitsprüfung).

## Voraussetzungen

Vor der ersten Verwendung werden benötigt:

| Voraussetzung | Zweck |
|---|---|
| Migration `npm run migrate:machine-profiles` | Legt die versionierte Tabelle `machine_profile_versions` und ihre Indizes an. |
| Administratorrolle | Nur `admin` darf Profile erstellen, ändern, prüfen, aktivieren oder löschen. `operator` und `viewer` dürfen Profile lesen. |
| Erreichbarer OPC-UA-Endpoint | Verbindungstest, Browser, Discovery und Live-Prüfung laufen vom Backend aus. |
| Freigegebener Netzwerkpfad | DNS/IP, Port, Firewall und gegebenenfalls Resource Path müssen vom Backend erreichbar sein. |
| Security- und Login-Daten | Security Mode, Policy und Authentifizierungsart müssen zur SPS passen. |
| Backend-Umgebungsvariablen | Zugangsdaten und Zertifikatspfade werden nicht im Profil gespeichert. Erlaubt sind nur Referenzen mit Präfix `OPCUA_`. |
| Fachliche Signalliste | Node-ID allein beschreibt nicht ihre MES-Bedeutung. Rollen und Pflichtsignale müssen mit SPS- und Prozessverantwortlichen abgestimmt sein. |
| Änderungszusammenfassung | Der Wizard verlangt beim Speichern eine Beschreibung der Änderung. |

Die Oberfläche ist unter `/machines` erreichbar. Der Button heißt für
Administratoren **Maschine konfigurieren**, für andere Rollen
**Maschinenprofile ansehen**. Der Wizard ist ein modaler Dialog und besitzt
keine eigene URL.

## Verantwortliche Implementierung

| Bereich | Datei | Funktion |
|---|---|---|
| Einstieg und Rollenübergabe | `frontend/src/pages/Machines.jsx` | Öffnet den Wizard, ordnet Maschinen zu Profilen zu und aktualisiert den Maschinenbaum nach Änderungen. |
| Wizard und Formulare | `frontend/src/components/MachineProfileWizard.jsx` | Verwaltet Schritte, lokalen Entwurf, Stationen, Signale, Commissioning-Aufrufe und Lifecycle-Aktionen. |
| Frontend-Defaults und Entwurfsprüfung | `frontend/src/utils/machineProfileConfig.js` | Erzeugt neue Profile/Verbindungen, normalisiert geladene Dokumente, prüft Duplikate und Hierarchiezyklen. |
| HTTP-Client | `frontend/src/api/client.js` | Verwendet `/api/v1`, setzt das JWT, serialisiert JSON und vereinheitlicht Clientfehler. |
| API-Routen und Rollen | `src/machines/profiles/machine-profiles.controller.ts` | Stellt Profil-, Commissioning-, Prüf- und Aktivierungsendpunkte bereit. |
| Request-DTOs | `src/machines/profiles/machine-profile.dto.ts` | Prüft die äußere Request-Form und Limits von Browse und Discovery. |
| Lifecycle und Persistenz | `src/machines/profiles/machine-profile-management.service.ts` | Erstellt Versionen, schützt Secrets und IDs, speichert Prüfergebnisse und schaltet Profile aktiv. |
| Struktur- und Fachvalidierung | `src/machines/profiles/machine-profile.service.ts` | Prüft Profilform, Verbindungen, Signale, Routing, Inventar und Hierarchie; lädt das aktive Runtime-Profil. |
| OPC-UA-Commissioning | `src/machines/profiles/opcua-commissioning.service.ts` | Testet Verbindungen, browsed Nodes, erkennt Signale und führt die lesende Live-Prüfung aus. |
| Datenbankmodell | `src/machines/profiles/machine-profile.entity.ts` | Bildet versionierte Profildokumente und Prüfresultate in PostgreSQL ab. |
| Maschinensynchronisierung | `src/machines/profiles/machine-profile-sync.service.ts` | Überführt Stationen des aktiven Profils beim Start in die Tabelle `machines`. |
| Runtime-OPC-UA | `src/opcua/opcua.service.ts` | Erstellt beim Backend-Start die konfigurierten Sessions und begrenzt Schreibzugriffe auf das aktive Profil. |
| Formeller Profilvertrag | `config/machines/machine-profile.schema.json` | Dokumentiert die vorgesehene JSON-Struktur; wird derzeit nicht direkt auf HTTP-Requests angewendet. |

## Datenmodell

### Profilwurzel

| Feld | Eingabe im Frontend | Funktion im Backend/Runtime |
|---|---|---|
| `profileVersion` | Automatisch `1.0` | Version des Dokumentformats, nicht die Datenbank-Versionsnummer. |
| `machineId` | Pflichtfeld | Stabile technische Profilidentität. Das Backend prüft Format und globale Eindeutigkeit; bei späteren Versionen darf sie nicht geändert werden. |
| `displayName` | Pflichtfeld | Lesbarer Maschinenname in Profilübersicht und Maschinenansicht. |
| `description` | Optional | Dokumentiert Zweck und Umfang der Maschine. |
| `manufacturer`, `model`, `machineVersion`, `location` | Optional | Stammdaten für Anzeige und Nachvollziehbarkeit. |
| `transport` | Automatisch `opcua` | Legt den aktuell einzigen unterstützten Transport fest. |
| `operatingMode` | Auswahl `observe`, `validate`, `control` | Begrenzt Runtime-Rechte. Neuanlagen werden serverseitig immer zuerst als `observe` gespeichert. `control` erlaubt nur explizit konfigurierte Schreib-Nodes und verlangt zusätzliche Aktivierungsfreigaben. |
| `connection` | Im aktiven Wizard nicht direkt bearbeitbar | Legacy-/Fallback-Verbindung und Vorlage für Stationen. Die zugehörige Frontend-Komponente existiert, ist aber nicht eingebunden. |
| `namespaces` | Indirekt durch Verbindungstest/Discovery | Ordnet stabile Namespace-URIs lokalen Schlüsseln zu, auf die Signale verweisen. Eine direkte Bearbeitung fehlt im aktiven Wizard. |
| `routing` | Im aktiven Wizard nicht vollständig bearbeitbar | Enthält unter anderem die terminale Ressource für den Control-/Routing-Ablauf. |
| `routingResultCodes` | Bei Wechsel zu `control` automatisch vorbelegt | Übersetzt Routing-Ergebnisse wie `accepted`, `wrong_resource` oder `internal_error` in SPS-Zahlencodes. |
| `stations` | Pflicht, mindestens eine Station im Wizard | Enthält Ressourcen, Verbindungen und Signale der Maschine. |
| `metadata` | Nicht im Wizard bearbeitbar | Freie technische Zusatzinformationen. |

### Station

| Feld | Eingabe im Frontend | Funktion im Backend/Runtime |
|---|---|---|
| `stationId` | Pflichtfeld | Profilintern eindeutiger stabiler Schlüssel. Wird auch für Stations-API-Routen verwendet. |
| `resourceId` | Pflichtfeld, Vorschlag vom Backend | Global eindeutige positive MES-Ressourcennummer für Maschinenbaum, Routing und Historie. |
| `parentResourceId` | Optional aus vorhandenen Stationen | Bildet die Hierarchie Maschine, Work Unit und Komponente. Zyklen sind ungültig. |
| `displayName` | Pflichtfeld | Lesbarer Stationsname. |
| `description` | Optional | Fachliche Erläuterung der Station. |
| `enabled` | Schalter | Nur aktivierte Stationen werden live verbunden und fachlich verwendet. |
| `equipmentLevel` | `machine`, `work_unit`, `component` | Klassifiziert die Station in der Equipment-Hierarchie. |
| `resourceType` | `production`, `inventory`, `storage`, `hybrid` | Beschreibt die fachliche Ressourcenart. |
| `executionModel` | `machine_job` oder `work_unit_jobs` | Legt fest, ob Jobs auf Maschinen- oder Work-Unit-Ebene ausgeführt werden. |
| `jobInterface` | `signal_handshake`, `job_control`, `telemetry_only` | Definiert die erwartete Kopplung zwischen MES und Maschine. |
| `capabilities` | Mehrfachauswahl | Schaltet Fähigkeiten wie `production`, `routing`, `control`, `inventory`, `storage` und `telemetry` fachlich frei. |
| `connection` | Vollständiger OPC-UA-Dialog | Eigene Verbindung je Station. Dadurch können mehrere unabhängige Endpoints und Sessions in einem Profil betrieben werden. |
| `routing` | Derzeit nicht im Wizard bearbeitbar | Benötigt `sequence`, `operationNo`, `operation` und optional `enabled` für die Standardroute. |
| `inventory` | Derzeit nicht im Wizard bearbeitbar | Verknüpft Inventar- und Slot-Felder mit Signalschlüsseln. |
| `signals` | Manuell, per Browser oder Discovery | Technische und fachliche Schnittstelle dieser Station. |

### OPC-UA-Verbindung

| Feld | Funktion |
|---|---|
| `endpointUrl` | Vollständige `opc.tcp://`-Adresse. Pflichtfeld im Stationseditor. |
| `applicationName` | Clientname, mit dem sich das MES beim Server meldet. |
| `security.mode` | `None`, `Sign` oder `SignAndEncrypt`. |
| `security.policy` | Kryptografische OPC-UA-Policy, beispielsweise `Basic256Sha256`. |
| `authentication.type` | `anonymous`, `username` oder `certificate`. |
| `usernameEnv`, `passwordEnv` | Namen von `OPCUA_*`-Umgebungsvariablen für Benutzeranmeldung. Keine Klartextwerte. |
| `certificatePathEnv`, `privateKeyPathEnv` | Namen von `OPCUA_*`-Umgebungsvariablen, deren Werte auf Zertifikat und Private Key zeigen. |
| `connectionTimeoutMs` | Maximale Dauer des Verbindungsaufbaus. |
| `sessionTimeoutMs` | Gewünschte OPC-UA-Session-Laufzeit. |
| `reconnect.enabled` | Aktiviert automatische Wiederverbindung. |
| `reconnect.initialDelayMs` | Erste Wartezeit vor erneutem Verbindungsversuch. |
| `reconnect.maximumDelayMs` | Obergrenze der Wartezeit. |
| `reconnect.backoffMultiplier` | Faktor für die wachsende Wartezeit. |
| `reconnect.maxAttempts` | Maximale Anzahl der Versuche. |

Das Backend durchsucht zu persistierende Dokumente rekursiv nach Secret-Feldern,
Klartext-Passwörtern, Token und PEM-Inhalten. Der Wizard speichert nur Namen von
Umgebungsvariablen. Connection-Test, Browse, Discovery und Live-Verifikation
verwenden ausschließlich Browse-/Read-Operationen.

### Signal

| Feld | Funktion |
|---|---|
| `key` | Profilintern verwendeter, fachlich stabiler Signalschlüssel. |
| `role` | Fachliche Bedeutung, zum Beispiel `processActive`, `goodCount`, `orderId`, `controlStart` oder `custom`. |
| `namespace` | Schlüssel eines Eintrags aus `namespaces`; entkoppelt Signale von veränderlichen Namespace-Indizes. |
| `identifier` | OPC-UA-Identifier des Nodes, bevorzugt ohne fest eingebrannten Namespace-Index. |
| `dataType` | Erwarteter OPC-UA-Typ, etwa `Boolean`, `UInt32`, `Float`, `String` oder `DateTime`. |
| `access` | Erwarteter Zugriff `read`, `write` oder `readWrite`. |
| `direction` | Datenfluss `machineToMes` oder `mesToMachine`. |
| `required` | Fehlender oder inkompatibler Node macht die Live-Prüfung ungültig. |
| `event.trigger` | Auswertung bei `change`, `rising` oder `falling`. |
| Skalierungsfaktor und Offset | Rechnet technische Werte in fachliche Einheiten um. |
| `description` | Dokumentiert Quelle, Einheit oder fachliche Besonderheiten. |

Discovery kann technische Nodes erkennen, setzt aber keine verlässliche
fachliche Rolle. Die Rolle muss von einer fachkundigen Person bestätigt werden.

## Ablauf im Frontend

### 1. Profile laden oder neu beginnen

Beim Öffnen ruft der Wizard parallel `GET /machine-profiles` und
`GET /machine-profiles/suggestions` auf. Die Liste enthält je logischem Profil
die neueste Version sowie gegebenenfalls die davon abweichende aktive
Runtime-Version. Die Vorschläge liefern eine neue `machineId` und eine freie
`resourceId`; sie sind nicht reserviert und können bei parallelen Sitzungen
kollidieren.

Ein neues Profil startet mit `operatingMode: observe`, einem Namespace-Platzhalter
und ohne Station. Ein vorhandenes Dokument wird im Frontend um
Verbindungsdefaults, Signalarrays und Stationsverbindungen ergänzt.

### 2. Schritt „Maschine“

Der Administrator erfasst Maschinen-ID, Anzeigename und optionale Stammdaten.
Die UI bietet die drei Betriebsmodi an. Bei neuen, noch nicht gespeicherten
Profilen ist die Modusauswahl gesperrt; unabhängig davon erzwingt das Backend
beim ersten Speichern `observe`.

### 3. Schritt „Stationen“

Mindestens eine Station wird mit positiver Ressourcen-ID, Stations-ID,
Anzeigename und Endpoint benötigt. Der Editor prüft diese Pflichtfelder und
verhindert einen zweiten Stationsendpoint mit demselben Host. Security,
Authentifizierung, Timeouts und Reconnect werden pro Station gepflegt.

Der Verbindungstest sendet die noch nicht gespeicherte Verbindung an
`POST /machine-profiles/commissioning/test-connection`. Das Backend öffnet eine
temporäre Session, liest unter anderem das NamespaceArray und schließt die
Session anschließend wieder.

### 4. Schritt „Signale“

Signale können manuell erfasst oder lesend aus dem OPC-UA-Adressraum übernommen
werden:

| Aktion | API | Verhalten |
|---|---|---|
| Node-Browser | `POST /machine-profiles/commissioning/browse` | Listet Objekte und Variablen unterhalb eines Start-Nodes, maximal 500 Nodes pro Request. |
| Discovery | `POST /machine-profiles/commissioning/discover-signals` | Durchsucht maximal Tiefe 10 und 5000 Nodes; der Wizard fordert Tiefe 6 und 2000 Nodes an. |
| Manuell | keine API bis zum Profilspeichern | Erfasst Namespace, Identifier, Typ, Zugriff, Richtung, Trigger und Rolle lokal. |

Discovery ergänzt nur neue Namespace-/Identifier-Kombinationen und überschreibt
keine vorhandenen Signale. Der Wizard filtert Datentypen, die seine Auswahlliste
nicht unterstützt.

### 5. Schritt „Speichern“

Die Zusammenfassung zeigt Stammdaten, Stationen, Hierarchie, Signalumfang,
Routing-Vorschau und bekannte Prüfresultate. Der Wizard verlangt vor dem ersten
Speichern:

- `machineId` und `displayName`;
- mindestens eine Station;
- eine Änderungszusammenfassung.

`POST /machine-profiles` erzeugt Version 1. `PATCH /machine-profiles/:profileId`
ändert keine vorhandene Zeile, sondern erzeugt die nächste Version. Ein
unverändertes Dokument wird nicht erneut gespeichert. Validierung,
Live-Verifikation und Aktivierung speichern lokale Änderungen zuerst automatisch.

### 6. Struktur prüfen

`POST /machine-profiles/:profileId/validate` führt die vollständige Backendprüfung
aus. Sie umfasst insbesondere:

- Dokumentstruktur und zulässige Enum-Werte;
- Maschinen-, Stations- und globale Ressourcen-IDs;
- Verbindungsparameter und Secret-Referenzen;
- eindeutige Stationen, Ressourcen, Signale und Routingsequenzen;
- Hierarchie und Zyklusfreiheit;
- Namespace- und Signalreferenzen;
- Routing-, Control- und Inventarregeln.

Ergebnis und Status werden an derselben Profilversion gespeichert. Ein gültiges
Profil erhält den Status `structurally_valid`.

### 7. Live verifizieren

`POST /machine-profiles/:profileId/verify` verbindet jede aktivierte Station
lesend und prüft für alle Signale:

- Existenz des Nodes;
- Namespace-Auflösung;
- Datentyp;
- erwartete Zugriffsrechte.

Ein fehlendes Pflichtsignal macht das Profil ungültig. Ein tatsächlich fehlendes
optionales Signal wird gemeldet, verhindert den Erfolg aber nicht. Das Ergebnis
wird als `liveValidationResult` persistiert; ein gültiges Profil erhält den
Status `live_validated`.

### 8. Aktivieren und Runtime übernehmen

Zur Aktivierung muss die `machineId` exakt eingegeben werden. Für `control` sind
zusätzlich die Sicherheitsbestätigung und eine erfolgreiche Live-Prüfung genau
dieser Version erforderlich. Das Backend führt die Strukturprüfung nochmals aus.

Innerhalb einer Datenbanktransaktion wird die bisher aktive Version deaktiviert
und die Zielversion aktiviert. Systemweit darf aufgrund eines partiellen
Unique-Index nur eine Profilversion aktiv sein. Aktivierung und Deaktivierung
melden `restartRequired: true`; es gibt keinen Hot Reload.

Beim nächsten Backend-Start:

1. wird die aktive Datenbankversion geladen;
2. werden ihre Stationen als `profile_managed` in `machines` synchronisiert;
3. werden nicht mehr aktive profilverwaltete Ressourcen offline gesetzt;
4. baut der OPC-UA-Service die Sessions auf;
5. verwenden Routing und weitere Fachservices dieselbe gecachte Konfiguration.

Existiert keine aktive Datenbankversion, dient `MACHINE_PROFILE_PATH` als
Legacy-Fallback.

## API-Referenz des Wizards

Alle Routen liegen unter `/api/v1` und benötigen ein JWT.

| Methode | Route | Rollen | Zweck |
|---|---|---|---|
| `GET` | `/machine-profiles` | admin, operator, viewer | Neueste Profilversionen anzeigen. |
| `GET` | `/machine-profiles/suggestions` | admin | Maschinen- und Ressourcen-ID vorschlagen. |
| `POST` | `/machine-profiles` | admin | Version 1 als Draft und im Modus `observe` anlegen. |
| `PATCH` | `/machine-profiles/:profileId` | admin | Neue Version eines Profils anlegen. |
| `POST` | `/machine-profiles/commissioning/test-connection` | admin | Ungespeicherte Verbindung read-only testen. |
| `POST` | `/machine-profiles/commissioning/browse` | admin | Ungespeicherten Endpoint read-only browsen. |
| `POST` | `/machine-profiles/commissioning/discover-signals` | admin | Technische Signalkandidaten erkennen. |
| `POST` | `/machine-profiles/:profileId/validate` | admin | Neueste Version strukturell und fachlich validieren. |
| `POST` | `/machine-profiles/:profileId/verify` | admin | Neueste Version gegen reale OPC-UA-Server prüfen. |
| `POST` | `/machine-profiles/:profileId/activate` | admin | Zielversion nach Bestätigung systemweit aktivieren. |
| `POST` | `/machine-profiles/:profileId/deactivate` | admin | Aktive Runtime-Version deaktivieren. |

Der Controller bietet zusätzlich Detail-, History-, Stations-, Signal- und
gespeicherte Browse-/Test-Endpunkte. Der Wizard speichert regulär das gesamte
Dokument und verwendet diese Teilrouten nicht.

## Persistenz und Status

Die Tabelle `machine_profile_versions` speichert pro Änderung eine Zeile mit:

- logischer `profile_id` und fortlaufender `version`;
- redundanter `machine_id`;
- Lifecycle-Status und `active`-Flag;
- vollständigem Profildokument als JSONB;
- Struktur- und Live-Prüfergebnis als JSONB;
- Ersteller, Änderungszusammenfassung und Zeitstempel.

Relevante Statuswerte im Ablauf sind `draft`, `structurally_valid`,
`live_validated`, `active` und `disabled`. Ein neuer Draft kann neben einer
älteren aktiven Runtime-Version existieren. Dadurch bleibt die laufende Anlage
unverändert, bis eine neue Version ausdrücklich aktiviert und das Backend neu
gestartet wurde.

## Fehler- und Sicherheitsverhalten

- Der globale `ValidationPipe` verwirft unbekannte DTO-Felder und transformiert
  primitive Requestwerte. Das verschachtelte Profildokument wird dabei nur als
  Objekt erkannt; seine vollständige Prüfung erfolgt erst über `validate` oder
  bei der Aktivierung.
- Das Backend lehnt Klartext-Secrets, sensible Schlüsselnamen und PEM-Inhalte im
  Profildokument ab.
- UI-Persistenz akzeptiert nur dedizierte `OPCUA_*`-Referenzen.
- Commissioning ist read-only, bereinigt Fehlerausgaben und schließt Sessions in
  einem `finally`-Block.
- Runtime-Schreiben ist nur in `control` und nur auf explizit im aktiven Profil
  zugelassene Nodes möglich.
- Die API liefert Fehler mit Status, Meldung, Pfad, Zeitstempel und Request-ID.
- Für alle Profilrouten gelten JWT, Rollenprüfung und globales Rate Limiting.

## Ergebnis der Vollständigkeitsprüfung

### Gesamturteil

Der technische Kern für Stammdaten, Stationsverbindungen, Signalmapping,
Versionierung, read-only Commissioning, Prüfung und Aktivierung ist vorhanden.
Der Wizard ist jedoch **noch nicht vollständig**, wenn Maschinenprofile mit
Routing, Inventar, manuell gepflegten Namespaces oder einem durchgängig
erzwungenen Freigabeprozess konfiguriert werden sollen.

### Kritische funktionale Lücken

| Priorität | Befund | Auswirkung |
|---|---|---|
| Hoch | Die vorhandene `ConnectionStep`-Komponente ist nicht in einen Wizard-Schritt eingebunden. | Root-Verbindung und Namespaces können nicht direkt bearbeitet werden. Die Beschreibung in `10-real-machine-commissioning.md`, Standardwerte im Wizard zu pflegen, entspricht damit nicht vollständig der aktuellen UI. |
| Hoch | Stationsrouting (`enabled`, `sequence`, `operationNo`, `operation`) hat keine Eingabefelder. | Der Wizard zeigt und validiert Standardrouten, kann sie aber nicht vollständig neu erstellen oder korrigieren. |
| Hoch | Inventarkonfiguration und Slot-Signalreferenzen sind nicht im Wizard bearbeitbar. | Profile für `inventory`, `storage` oder entsprechende Hybridressourcen benötigen einen anderen Bearbeitungsweg. |
| Hoch | Lokale Entwurfsfehler deaktivieren Speichern und Aktivieren nicht. | Erkannte doppelte IDs, Routingfehler oder Hierarchiezyklen können als Draft gespeichert werden; die API muss sie spätestens bei Aktivierung ablehnen. |
| Hoch | `SaveMachineProfileDto` prüft nur, ob `document` ein Objekt ist. | Unvollständige oder strukturell ungültige Drafts können über die API persistiert werden. Die vollständige Validierung ist nicht Voraussetzung des Speicherns. |
| Hoch | Ein aktives Profil kann gelöscht werden, ohne die bereits geladene Runtime zu stoppen oder einen Neustart zu melden. | Datenbank und laufende OPC-UA-Runtime können bis zum Neustart unterschiedliche Zustände haben. |
| Hoch | Profil-Löschen entfernt profilverwaltete Maschinen anhand aller historischen Ressourcen-IDs. | Eine inzwischen von einem anderen Profil verwendete Ressourcen-ID kann fälschlich aus `machines` entfernt werden. |

### Weitere Inkonsistenzen und Risiken

| Priorität | Befund | Auswirkung |
|---|---|---|
| Mittel | Der Wizard lässt `machineId` optisch ändern; Backend und Inline-Editor behandeln sie als stabil. | Änderung endet erst beim Speichern als Backendfehler und ist für Benutzer irreführend. |
| Mittel | Ein Verbindungstest kann die komplette Namespace-Liste durch `ns0`, `ns1`, ... ersetzen, ohne bestehende Signalreferenzen zu migrieren. | Bereits konfigurierte Signale können auf nicht mehr vorhandene Namespace-Schlüssel zeigen. |
| Mittel | Stations-, Signal- und Browser-State werden beim Profilwechsel nicht vollständig zurückgesetzt. | Editorinhalte eines vorherigen Profils können im neuen Kontext sichtbar bleiben. |
| Mittel | Schließen und Profilwechsel warnen nicht vor ungespeicherten Änderungen. | Lokale Änderungen können unbemerkt verloren gehen. |
| Mittel | Signalprüfung im Editor kontrolliert nur Schlüssel und Identifier. | Doppelte Schlüssel/Adressen, unbekannte Namespaces und unplausible Kombinationen werden lokal nicht verhindert. |
| Mittel | JSON-Schema verlangt mindestens ein Signal je Station, der Runtime-Type-Guard akzeptiert `signals: []`. | Schema, Tests und tatsächlich akzeptierter Vertrag sind nicht deckungsgleich. |
| Mittel | Parallele Updates lesen dieselbe letzte Versionsnummer ohne Lock. | Einer der Requests kann am Unique-Constraint mit einem technischen statt fachlichen Konflikt scheitern. |
| Mittel | Aktivierung kann bei parallelem Update eine andere neueste Version validieren als anschließend aktiviert wird. | Prüf- und Zielversion können in einem Race auseinanderfallen. |
| Mittel | Konkrete `errors` einer fehlgeschlagenen Aktivierungsvalidierung werden vom globalen Exception-Filter nicht weitergegeben. | Das Frontend erhält nur die allgemeine Fehlermeldung. |
| Mittel | Der gesamte Wizard ist fest deutsch, obwohl die Anwendung Deutsch und Englisch unterstützt. | Bei englischer Spracheinstellung entsteht eine gemischte Oberfläche. |
| Niedrig | Dialoge besitzen keine Fokusfalle, Escape-Steuerung oder Fokus-Rückgabe. | Eingeschränkte Tastatur- und Screenreader-Bedienung. |
| Niedrig | Vorschläge für Ressourcen-IDs werden nicht reserviert. | Zwei offene Wizard-Sitzungen können denselben Vorschlag erhalten; der Konflikt erscheint erst beim Speichern. |

### Notwendige Maßnahmen für einen vollständigen Wizard

1. Root-Verbindung und Namespace-Verwaltung entweder als eigenen Schritt
   einbinden oder vollständig durch stationsbezogene Funktionen ersetzen.
2. Routingfelder und, falls fachlich benötigt, Inventar-/Slotkonfiguration in
   den Stationseditor aufnehmen.
3. `machineId` nach der ersten Persistenz im Wizard sperren.
4. Lokale Fehler vor Speichern und Aktivieren blockieren und dieselben Regeln
   serverseitig beim Speichern anwenden.
5. Namespace-Änderungen referenzsicher migrieren oder vor dem Ersetzen eine
   explizite Konfliktauflösung verlangen.
6. Löschen aktiver Profile sperren oder kontrolliert deaktivieren und
   `restartRequired` liefern; Maschinen eindeutig ihrem Profil zuordnen, statt
   historische Ressourcen-IDs zum Löschen zu verwenden.
7. Versionserzeugung und Aktivierung durch Transaktion/Lock gegen parallele
   Änderungen absichern.
8. JSON-Schema, Type-Guards, HTTP-Validierung und Tests auf einen gemeinsamen
   Vertrag bringen.
9. Dirty-State, vollständigen Editor-Reset, Dialog-Accessibility und i18n
   ergänzen.
10. Komponenten-, Controller-, Rollen-, Integrations- und E2E-Tests für den
    vollständigen Wizard-Lifecycle ergänzen.

## Abnahmecheckliste

Vor der Aktivierung eines realen Profils sollte unabhängig von den derzeitigen
UI-Sperren geprüft werden:

- [ ] `machineId` ist eindeutig, fachlich abgestimmt und bleibt dauerhaft stabil.
- [ ] Jede `resourceId` ist positiv und global eindeutig.
- [ ] Stationshierarchie ist vollständig und zyklusfrei.
- [ ] Jeder aktivierte Endpoint ist vom Backend erreichbar.
- [ ] Security Mode, Policy und Authentifizierung stimmen mit der SPS überein.
- [ ] Im Profil stehen nur `OPCUA_*`-Referenzen, keine Zugangsdaten.
- [ ] Namespace-URIs und alle Signalreferenzen sind konsistent.
- [ ] Fachliche Rollen, Datentypen, Zugriff und Richtung jedes Signals sind bestätigt.
- [ ] Routing und Inventar wurden, falls benötigt, außerhalb der derzeit fehlenden UI-Felder korrekt ergänzt und validiert.
- [ ] Strukturvalidierung ist erfolgreich.
- [ ] Live-Prüfung aller Pflichtsignale ist erfolgreich.
- [ ] Für `control` liegen Sicherheitsfreigabe und erfolgreiche Live-Prüfung derselben Version vor.
- [ ] Änderungszusammenfassung nennt Grund, Umfang und verantwortliche Person.
- [ ] Backend-Neustart nach Aktivierung oder Deaktivierung ist eingeplant.
- [ ] Nach Neustart stimmen aktive Profilversion, Maschinenbaum, OPC-UA-Verbindungen und Telemetrie überein.

## Testabdeckung

Vorhanden sind Unit- und Vertragstests für Frontend-Normalisierung,
Profilvalidierung, Management-Lifecycle, Hierarchie, Routing-Ergebniscodes,
Runtimequelle und Maschinensynchronisierung. Nicht vorhanden sind insbesondere
React-Komponententests, HTTP-Controller-Tests und ein E2E-Test des kompletten
Wizard-Ablaufs einschließlich Rollen, Commissioning, Aktivierung und Neustart.

Die Frontend-Basistests liegen in
`frontend/src/utils/machineProfileConfig.test.js`. Die wichtigsten Backendtests
liegen unter `src/machines/profiles/*.spec.ts`.
