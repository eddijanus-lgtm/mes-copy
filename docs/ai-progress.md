# KI-Fortschrittsdokumentation

## MA-01 – Neutraler MachineAdapter-Vertrag

**Datum:** 2026-07-25

**Branch:** `refactor/machine-adapter-contract`

**Ausgangs-Commit:** `a9db7fb378d003437a58e52af769fe68ec0133e7`

### Erstellte Dateien

- `src/machines/contracts/machine.types.ts`
- `src/machines/contracts/machine-adapter.interface.ts`
- `src/machines/contracts/machine-adapter.token.ts`
- `src/machines/contracts/machine-adapter.contract.spec.ts`
- `docs/architecture/machine-adapter-contract.md`
- `docs/ai-progress.md` (diese Datei)

### Was wurde erreicht?

- Neutrale Maschinentypen und das `MachineAdapter`-Interface definiert.
- Dependency-Injection-Token `MACHINE_ADAPTER` erstellt.
- Isolierter Vertragstest mit einem Fake-Adapter umgesetzt.
- Architekturdokumentation erstellt.

### Was wurde nicht migriert?

- Keine bestehende Laufzeitlogik migriert.
- Keine bestehenden Services, Module oder Tests verändert.
- Kein produktiver Provider registriert.
- Simulator nicht verändert.
- Kein Commit und kein Push erfolgt (Commit erst in CHUNK 6).

### Testergebnisse

| Bereich | Ergebnis |
|---------|----------|
| Isolierter Vertragstest | 1 Suite, 6 Tests bestanden |
| Build | erfolgreich |
| E2E-Tests | 4 Suites und 9 Tests bestanden |
| Unit-Tests | 12 Suites und 114 Tests bestanden |

Zwei Unit-Test-Suites waren bereits vor diesem Arbeitspaket fehlerhaft und wurden
nicht verändert:

- `downtime.service.spec.ts` – `TypeError: Type is not a function`
- `orders.service.spec.ts` – `carriersRepo.find is not a function`

12 Unit-Test-Suites bestanden, 2 bereits vorher fehlerhafte Suites blieben unverändert.
114 Unit-Tests bestanden, 17 bereits vorher fehlerhafte Tests blieben unverändert.

---

## MA-02 – Maschinenprofil-Vertrag

**Datum:** 2026-07-25

**Branch:** `feat/machine-profile-contract`

**Ausgangs-Commit:** `85faa50b7d1eee2b01fe8216292c505718c5c15c`

**Commit:** `current MA-02 branch HEAD`

### Erstellte Dateien

- `src/machines/profiles/machine-profile.types.ts`
- `src/machines/profiles/machine-profile.contract.spec.ts`
- `config/machines/simulator.machine.json`
- `config/machines/wara.machine.template.json`
- `config/machines/machine-profile.schema.json`
- `docs/architecture/machine-profile-contract.md`
- `docs/ai-progress.md` (diese Datei, aktualisiert)

### Was wurde erreicht?

- Maschinenprofil-Typen definiert (`MachineProfile` und alle Untertypen).
- Simulator-Profil (`simulator.machine.json`) mit 3 Stationen und 9 Signalen pro Station erstellt.
- WARA-Vorlage (`wara.machine.template.json`) mit Platzhaltern und Env-Referenzen erstellt.
- JSON-Schema (`machine-profile.schema.json`, Draft 2020-12) mit 9 `$defs` und vollständigen Enumerationen erstellt.
- 47 isolierte Vertragstests für Profile, Schema und Konsistenz erstellt.
- Architekturdokumentation (`docs/architecture/machine-profile-contract.md`) erstellt.
- Keine neuen Abhängigkeiten installiert (`ajv` nur transitiv, nicht direkt verwendet).

### Was wurde nicht migriert?

- Kein MachineProfileService erstellt.
- Keine Laufzeitvalidierung implementiert.
- Keine Änderungen an OpcUaService, Handshake, Recovery, OrdersService, Simulator oder NestJS-Modulen.
- Kein produktiver Provider registriert.

### Testergebnisse

| Bereich | Ergebnis |
|---------|----------|
| Isolierte Profiltests | 1 Suite, 47 Tests bestanden |
| Build | erfolgreich |
| E2E-Tests | 4 Suites und 9 Tests bestanden |
| Unit-Tests | 13 Suites und 161 Tests bestanden |

Zwei Unit-Test-Suites waren bereits vor MA-02 fehlerhaft und blieben unverändert:

- `downtime.service.spec.ts` – `TypeError: Type is not a function`
- `orders.service.spec.ts` – `carriersRepo.find is not a function`

13 Unit-Test-Suites bestanden, 2 bereits vorher fehlerhafte Suites blieben unverändert.
161 Unit-Tests bestanden, 17 bereits vorher fehlerhafte Tests blieben unverändert.
Nichts gepusht.

---

## MA-03 – Machine profile service

**Datum:** 2026-07-25

**Branch:** `feat/machine-profile-service`

**Ausgangs-Commit:** `0ed499b` (Merge-Commit auf main)

### Erstellte Dateien

- `src/machines/profiles/machine-profile-loader.types.ts`
- `src/machines/profiles/machine-profile.errors.ts`
- `src/machines/profiles/machine-profile.service.ts`
- `src/machines/profiles/machine-profile.service.spec.ts`
- `docs/architecture/machine-profile-service.md`
- `docs/ai-progress.md` (diese Datei, aktualisiert)

### Was wurde erreicht?

- Loader-Typen (`MACHINE_PROFILE_PATH_CONFIG_KEY`, `MachineProfileLoadOptions`, `MachineProfileErrorCode`)
- Projektspezifische Fehlerklassen und Fehlercodes (`MachineProfileError`, `MachineProfileConfigurationError`, `MachineProfileFileNotFoundError`, `MachineProfileReadError`, `MachineProfileParseError`)
- `MachineProfileService` mit Konfigurationspfad über `MACHINE_PROFILE_PATH`, expliziten `LoadOptions`, sicherer relativer Pfadauflösung, Directory-Traversal-Schutz, JSON-Lesen und Parsing, struktureller Type-Guard-Validierung, Cache und Lazy Loading
- Secret-sichere Fehlermeldungen (keine Datei- oder Profilinhalte)
- Architekturdokumentation

### Was wurde nicht migriert?

- Keine Modulregistrierung
- Kein MachineAdapter-Provider
- Kein OpcUaMachineAdapter
- Keine Änderungen an bestehender Runtime-Logik (OpcUaService, Handshake, Recovery, Orders, Simulator)
- Kein produktiver OPC-UA-Zugriff
- Keine neue Validator-Dependency
- Keine direkte Nutzung transitiver AJV-Pakete

### Architekturentscheidung

Die strukturellen Type Guards im Service prüfen alle Pflichtfelder, Enums, optionalen Felder und verschachtelten Strukturen aus `machine-profile.types.ts`. Eine vollständige JSON-Schema-Runtime-Validierung mit einer bewusst gewählten direkten Dependency bleibt ein separates späteres Arbeitspaket.

### Testergebnisse

| Bereich | Ergebnis |
|---------|----------|
| Isolierte Service-Tests | 52 Tests bestanden |
| Profiltests gesamt (MA-02 + MA-03) | 2 Suites, 99 Tests bestanden |
| Build | erfolgreich |
| E2E-Tests | 4 Suites und 9 Tests bestanden |
| Unit-Tests | 14 Suites und 213 Tests bestanden |

Zwei Unit-Test-Suites waren bereits vor MA-03 fehlerhaft und blieben unverändert:

- `downtime.service.spec.ts` – `TypeError: Type is not a function`
- `orders.service.spec.ts` – `carriersRepo.find is not a function`

14 Unit-Test-Suites bestanden, 2 bereits vorher fehlerhafte Suites blieben unverändert.
213 Unit-Tests bestanden, 17 bereits vorher fehlerhafte Tests blieben unverändert.
Nichts gepusht. Branch ist ahead of origin.
