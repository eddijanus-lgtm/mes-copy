# 00 - Environment Configuration

_Erstellt: 2026-07-22_
_Status: verified_

## Ziel

Geheimnisse und lokale Einstellungen dürfen nicht in Git gespeichert werden. Das Projekt verwendet deshalb zwei Dateien:

- `.env`: lokale Werte und Geheimnisse; wird von Git ignoriert.
- `.env.example`: dokumentierte Vorlage ohne echte Geheimnisse; wird versioniert.

## Enthaltene Variablen

| Variable | Zweck |
|---|---|
| `NODE_ENV` | Laufzeitumgebung |
| `PORT` | HTTP-Port des NestJS-Backends |
| `DB_*` | PostgreSQL-Verbindung |
| `JWT_SECRET` | Signatur und Prüfung der JWTs |
| `MQTT_BROKER_URL` | Adresse des MQTT-Brokers |
| `OPC_UA_SERVER_ADDRESS` | Adresse des OPC-UA-Servers |

## Sicherheitsregeln

- Niemals echte Passwörter oder JWT-Secrets in `.env.example` eintragen.
- Für `JWT_SECRET` mindestens 32 zufällige Zeichen verwenden.
- Produktionswerte getrennt von lokalen Entwicklungswerten verwalten.
- Das Backend verwendet keinen bekannten JWT-Standardwert mehr und startet ohne `JWT_SECRET` nicht.

## Verifikation

- [x] `.env` wird durch `.gitignore` ausgeschlossen.
- [x] `.env` ist nicht in Git erfasst.
- [x] `.env.example` enthält alle derzeit verwendeten Variablen.
- [x] Backend-Build erfolgreich.
- [x] Backend-Neustart, Health-Check und JWT-Login erfolgreich.
