# Machine Profile Service

## Zweck

Der MachineProfileService lädt ein neutrales Maschinenprofil aus einer JSON-Datei und stellt es als typisiertes `MachineProfile` bereit. Er ist eine vorbereitende Infrastrukturkomponente: er verbindet sich noch nicht mit OPC UA, registriert keinen MachineAdapter und verändert keine bestehende Maschinenlaufzeit.

## Verantwortlichkeiten

- Konfigurierten Profilpfad über ConfigService lesen
- Explizite `MachineProfileLoadOptions` akzeptieren
- Pfade normalisieren und validieren
- Relative Pfade gegen ein Basisverzeichnis auflösen
- Directory Traversal bei relativen Pfaden verhindern
- JSON-Dateien synchron lesen
- JSON parsen
- Strukturelle Mindestvalidierung durchführen
- Projektspezifische Fehler werfen
- Erfolgreich geladenes Profil cachen
- Lazy Loading über `getProfile()` ermöglichen

## Öffentliche API

### `loadConfiguredProfile(baseDirectory?: string): MachineProfile`

Liest den konfigurierten Profilpfad aus `MACHINE_PROFILE_PATH` über ConfigService. Fehlende oder ungültige Konfigurationswerte führen zu einem `MachineProfileConfigurationError`. Bei erfolgreicher Konfiguration wird `loadProfile()` mit dem gelesenen Pfad aufgerufen.

### `loadProfile(options: MachineProfileLoadOptions): MachineProfile`

Führt die vollständige Lade-Pipeline aus: Pfadvalidierung, Pfadauflösung, Dateizugriff, JSON-Parsing, Strukturvalidierung. Nur bei vollständigem Erfolg wird das Profil im internen Cache gespeichert und zurückgegeben.

Mögliche Fehlergruppen:
- `MachineProfileConfigurationError` – ungültiger Pfad oder Basisverzeichnis
- `MachineProfileFileNotFoundError` – Datei existiert nicht
- `MachineProfileReadError` – Datei nicht lesbar (z.B. Berechtigungen, Verzeichnis)
- `MachineProfileParseError` – ungültiges JSON oder unerwartete Struktur

### `getProfile(): MachineProfile`

Lazy Loading: Gibt ein zuvor erfolgreich geladenes Profil aus dem Cache zurück. Falls kein Profil geladen ist, wird `loadConfiguredProfile()` aufgerufen.

## Konfiguration

| Schlüssel | Quelle | Beschreibung |
|-----------|--------|-------------|
| `MACHINE_PROFILE_PATH` | ConfigService (`.env`) | Pfad zur Profil-JSON-Datei |

- Der Wert muss ein nicht leerer String sein.
- Whitespace wird entfernt.
- Relative Pfade werden gegen `baseDirectory` oder `process.cwd()` aufgelöst.
- Absolute Pfade sind zulässig.
- Secrets gehören nicht in den Pfad oder in das Profil.

## Pfadsicherheit

- Leere Pfade werden abgelehnt.
- Null-Bytes werden abgelehnt.
- Leere oder ungültige Basisverzeichnisse werden abgelehnt.
- Relative Pfade dürfen das Basisverzeichnis nicht über `..` verlassen.
- Absolute Pfade sind eine bewusste erlaubte Ausnahme.
- Der Service prüft Pfadsicherheit, ersetzt aber keine Betriebssystem-Dateirechte.

Hinweis für spätere Hardening-Arbeiten: Plattformübergreifende Sonderfälle von Windows-Pfaden über unterschiedliche Laufwerke können in einem separaten Arbeitspaket gezielt untersucht werden.

## Fehlervertrag

| Code | Fehlerklasse | Auslöser |
|------|-------------|---------|
| `PROFILE_PATH_MISSING` | `MachineProfileConfigurationError` | Fehlender, leerer oder Whitespace-Pfad |
| `PROFILE_PATH_INVALID` | `MachineProfileConfigurationError` | Ungültiger Pfad, Null-Byte, Traversal |
| `PROFILE_FILE_NOT_FOUND` | `MachineProfileFileNotFoundError` | Datei existiert nicht (ENOENT) |
| `PROFILE_FILE_UNREADABLE` | `MachineProfileReadError` | Kein Lesezugriff, Verzeichnis, sonstige FS-Fehler |
| `PROFILE_JSON_INVALID` | `MachineProfileParseError` | Syntaxfehler oder Strukturfehler |

- `originalCause` wird optional als `unknown` gespeichert.
- Dateiinhalte und Profilinhalte werden nicht in Fehlermeldungen aufgenommen.
- Der Dateipfad darf als technischer Kontext enthalten sein.
- Der Service selbst loggt keine Secrets und keine Profilinhalte.

## Strukturvalidierung

Der Service verwendet lokale Type Guards. Pflichtfelder, verschachtelte Strukturen, bekannte String-Unions, optionale Felder, Metadata, Scaling und Environment-Referenzen werden geprüft. Erst nach erfolgreicher Prüfung wird der Wert als `MachineProfile` bereitgestellt. Es werden keine ungeprüften Type Casts verwendet.

## JSON-Schema-Entscheidung

`config/machines/machine-profile.schema.json` existiert aus MA-02. MA-03 führt keine produktive JSON-Schema-Validator-Integration ein. Es wird keine transitive AJV-Version direkt importiert und keine neue Validator-Dependency installiert. Die strukturellen Type Guards sind für den begrenzten MA-03-Scope ausreichend. Eine vollständige Runtime-Schema-Validierung bleibt ein separates späteres Arbeitspaket.

## Cache-Verhalten

- Nur erfolgreich geladene Profile werden gecacht.
- `getProfile()` lädt bei leerem Cache über die konfigurierte Quelle.
- Wiederholte Aufrufe geben dieselbe Objektinstanz zurück.
- Ein späterer fehlgeschlagener Ladevorgang überschreibt ein zuvor erfolgreich geladenes Profil nicht.
- Ein fehlgeschlagener erster Ladevorgang erzeugt keinen Cache.

## Bewusste Grenzen von MA-03

- NestJS-Modulregistrierung
- MachineAdapter-Provider
- OpcUaMachineAdapter
- OPC-UA-Verbindung
- Namespace-Auflösung gegen einen Server
- Lesen oder Schreiben echter OPC-UA-Signale
- Handshake-Migration
- Recovery-Migration
- Orders-Migration
- Simulator-Migration
- Produktive vollständige JSON-Schema-Validierung

## Tests

- 52 isolierte MachineProfileService-Tests
- 47 bestehende MachineProfile-Vertragstests
- Zusammen 99 Profiltests

Getestete Schwerpunkte:
- ConfigService-Integration
- Pfadvalidierung und Directory-Traversal-Schutz
- Dateifehler (nicht gefunden, nicht lesbar)
- JSON-Fehler (keine Secret-Exposure)
- Strukturvalidierung (alle Pflichtfelder, Enums, optionale Felder, Metadata, Scaling, Env-Referenzen)
- Lazy Loading und Cache-Verhalten
- Fehlerklassen und Fehlercodes

## Nächste mögliche Architekturarbeit

- optionale vollständige Runtime-Schema-Validierung
- NestJS-Modul- und Provider-Registrierung
- Implementierung eines OpcUaMachineAdapter
- kontrollierte Migration bestehender OPC-UA-Laufzeitlogik
- gezieltes plattformübergreifendes Pfad-Hardening
