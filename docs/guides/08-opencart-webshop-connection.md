# OpenCart-Webshop anbinden

Der Shop veröffentlicht nach dem erfolgreichen Checkout ein JSON-Payload per MQTT. Das MES abonniert dafür `WEBSHOP_MQTT_TOPIC` und legt daraus einen Produktionsauftrag mit der vorhandenen stMES-Route an.

## Vertrag

Das Payload muss diese vier Felder enthalten:

```json
{
  "bDeckelfarbe": 1,
  "uiKugelRot": 3,
  "uiKugelGruen": 5,
  "uiKugelBlau": 7
}
```

`bDeckelfarbe` verwendet `1` für Rot, `2` für Grün und `4` für Blau. Alle Kugelmengen müssen nicht-negative ganze Zahlen sein. Die Werte werden als Auftragsfelder sowie als `iPar1` bis `iPar4` an die Stationen übergeben.

## MES-Konfiguration

In `.env` den vom Shop-Team mitgeteilten MQTT-Broker eintragen:

```dotenv
MQTT_BROKER_URL=mqtt://<broker-host>:1883
MQTT_USERNAME=
MQTT_PASSWORD=
WEBSHOP_MQTT_TOPIC=i4.0/production/orders
```

Das MES verwendet für den Webshop-Kanal MQTT QoS 2. Der Topic-Name kann geändert werden, muss dann aber auf beiden Seiten gleich sein.

## Noch benötigte Angabe

Die Webshop-Dokumentation beschreibt das Topic und das JSON, nennt jedoch keinen MQTT-Broker-Host oder Zugangsdaten. Ohne diese Angabe kann das MES keine Verbindung zum Shop-Broker aufbauen. Der öffentliche OpenCart-Webshop selbst ist unabhängig davon per HTTP erreichbar.
