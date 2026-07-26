# 01 - JWT Authentication and RBAC

_Status: Phase 1 complete and verified - 2026-07-22_

## Architektur

- `POST /api/v1/auth/login` ist öffentlich und auf 5 Versuche pro Minute begrenzt.
- Alle anderen Fach-APIs benötigen einen signierten JWT.
- JWTs enthalten `sub`, `username`, `role`, `iat` und `exp` und laufen nach einer Stunde ab.
- Rollen werden als `admin`, `operator` oder `viewer` validiert.
- Das Frontend speichert den Access Token lokal, prüft Ablauf und Claims und meldet bei 401 automatisch ab.
- Die öffentliche Seed-Route wurde entfernt. Der erste Admin wird lokal mit `npm run create-admin` angelegt.

## Rollenmatrix

| Bereich | Viewer | Operator | Admin |
|---|---|---|---|
| Maschinen, Orders, Alarme, Traces und Telemetrie lesen | ja | ja | ja |
| Produktionsdaten erstellen und bearbeiten | nein | ja | ja |
| Datensätze löschen | nein | nein | ja |
| OPC-UA-Nodes lesen | nein | ja | ja |
| MQTT publizieren | nein | nein | ja |
| Benutzer mit Rollen anlegen | nein | nein | ja |

Backend-Regeln sind maßgeblich. Ausgeblendete Frontend-Aktionen verbessern nur die Bedienung.

## Frontend

- `/login`: öffentliche Anmeldung.
- `/users`: Admin-only Benutzeranlage.
- Maschinenaktionen werden abhängig von der Rolle angezeigt.
- Direkte Navigation nach `/users` wird für Nicht-Admins abgefangen.
- Logout ist in der Sidebar verfügbar.

## Sicheren ersten Admin anlegen

```bash
ADMIN_USERNAME=my-admin ADMIN_PASSWORD='a-long-random-password' npm run create-admin
```

Das Passwort muss mindestens zwölf Zeichen lang sein. Der Befehl funktioniert nur lokal gegen die konfigurierte Datenbank und überschreibt keine vorhandenen Benutzer.

## Verifikation

- [x] Ohne JWT: HTTP 401
- [x] Viewer-Mutationen: HTTP 403
- [x] Operator darf erstellen/bearbeiten, aber nicht löschen
- [x] Admin darf Benutzer anlegen und löschen
- [x] Frontend-Login und automatischer Bearer-Token
- [x] Abgelaufene/ungültige Sitzung wird entfernt
- [x] Seed-Endpoint entfernt
