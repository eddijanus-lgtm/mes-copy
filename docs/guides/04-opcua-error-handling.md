# 04 - OPC UA and MQTT Error Handling

_Status: verified - 2026-07-22_

## OPC UA

- Echte Verbindung mit `connect()` und `createSession()`.
- `connected` wird erst nach erfolgreicher Session gesetzt.
- Messwerte werden sekündlich gelesen und als Telemetrie publiziert.
- Bei Ausfall wird die Session geschlossen und nach der im Maschinenprofil definierten Backoff-Strategie neu verbunden.
- Reads ohne Verbindung liefern HTTP 503; Read-Fehler HTTP 502.
- Erlaubt sind ausschließlich die exakten Nodes des aktiven Maschinenprofils.
- Session und Client werden beim Shutdown sauber geschlossen.

## MQTT

- Keine Manipulation globaler `uncaughtException`- oder `unhandledRejection`-Handler mehr.
- Fehler, Offline, Reconnect und Close werden lokal behandelt und geloggt.
- Subscribe- und Publish-Fehler werden weitergegeben.
- Publizieren ohne Broker liefert HTTP 503.
- Erlaubte Topic-Präfixe kommen aus `MQTT_ALLOWED_TOPIC_PREFIXES`.
- Client wird beim Shutdown beendet.

## Ausfalltest

Der OPC-UA-Testserver wurde gestoppt. Das Backend blieb online und meldete `opcua:false`. Nach Neustart wechselte es automatisch wieder auf `opcua:true`.
