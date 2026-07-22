# 03 - Rate Limiting and Validation

_Status: verified - 2026-07-22_

- Global: 120 Requests pro Minute und Client-IP.
- Login: 5 Versuche pro Minute und Client-IP.
- Globale `ValidationPipe`: Whitelist, fremde Felder ablehnen, Transformation aktiv.
- DTOs werden in Controllern als Laufzeitklassen importiert.
- Bulk-Payloads werden elementweise validiert.
- UUID-, Integer-, Enum-, Datums- und Bereichsparameter werden geprüft.
- Helmet setzt Security Headers.
- CORS verwendet `CORS_ORIGINS` statt Wildcard mit Credentials.

Verifiziert wurden HTTP 429 beim Login-Limit, HTTP 400 für fremde Felder und HTTP 403 für unzulässige Rollen.
