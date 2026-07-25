# Neutraler MachineAdapter-Vertrag

## Ausgangsproblem

Im bisherigen System sind mehrere Aufgaben noch eng miteinander verbunden:

- **Maschinenverbindung** – wie die Verbindung zu einer Maschine aufgebaut wird,
- **konkrete Maschinensignale** – welche Signale die Maschine bereitstellt,
- **Maschinen-Handshake** – wie Anfragen an die Maschine gesendet und beantwortet werden,
- **Telemetrie** – welche Messwerte die Maschine liefert,
- **MES-Fachlogik** – Aufträge, Routing und fachliche Entscheidungen.

Wenn eine neue Maschine angebunden werden soll, müssten bisher viele dieser Bereiche
angepasst werden. Das erschwert die Erweiterbarkeit, besonders wenn verschiedene
Maschinentypen oder Kommunikationsprotokolle dazukommen.

Der bestehende Simulator und der aktuelle Handshake funktionieren für die aktuelle
Demo einwandfrei. Das Ziel ist es, das System so vorzubereiten, dass weitere Maschinen
einfacher integriert werden können, ohne die bestehende Funktionalität zu verändern.

## Zielarchitektur

Die geplante Struktur sieht eine klare Schichtung vor:

```
MES-Fachlogik
→ MachineAdapter
→ konkreter Maschinenadapter
→ Transport-Client
→ Simulator oder reale Maschine
```

- **MES-Fachlogik** – kümmert sich um Aufträge, Routing, Carrier und fachliche Entscheidungen.
- **MachineAdapter** – neutrale Schnittstelle zwischen MES und Maschine.
- **konkreter Maschinenadapter** – übersetzt neutrale Vorgänge in die Signale und Befehle
  einer bestimmten Maschine.
- **Transport-Client** – übernimmt die technische Kommunikation (zum Beispiel OPC UA,
  Modbus, MQTT).
- **Simulator oder reale Maschine** – die Gegenstelle der Kommunikation.

Derzeit wurde nur der neutrale Vertrag (das `MachineAdapter`-Interface) eingeführt.
Konkrete Adapter, Transport-Client und die Anbindung des Simulators oder einer realen
Maschine sind noch nicht umgesetzt.

## Verantwortung des MachineAdapter

Der Adaptervertrag beschreibt fachliche Maschinenfunktionen, ohne auf das verwendete
Protokoll einzugehen:

- **Maschinen-ID** – welche Maschine gemeint ist,
- **Betriebsart** – ob die Maschine beobachtet, validiert oder gesteuert wird,
- **Verbindungszustand** – ob die Maschine erreichbar ist,
- **verfügbare Stationen** – welche Stationen die Maschine hat,
- **Maschinen-Snapshot** – aktueller Zustand aller Stationen,
- **Arbeitsanfragen** – MES teilt der Maschine mit, was bearbeitet werden soll,
- **Antworten auf Arbeitsanfragen** – Maschine meldet zurück, ob die Anfrage angenommen
  oder abgelehnt wurde,
- **Prozessabschlüsse** – Maschine meldet, dass ein Vorgang beendet ist,
- **Verbindungsänderungen** – Maschine meldet, wenn sich der Verbindungszustand ändert.

Die MES-Fachlogik muss nicht wissen, wie diese Informationen technisch übertragen
werden. Sie arbeitet immer gegen das neutrale Interface.

## Was nicht zum neutralen Vertrag gehört

Folgende Aufgaben sind **nicht** Teil des `MachineAdapter`-Vertrags:

- Datenbankzugriffe,
- Auftragserstellung,
- Routingentscheidungen,
- Carrier-Verwaltung,
- Dashboarddarstellung,
- Alarm- und Issue-Lifecycle,
- konkrete Maschinenadressen,
- Namespace-Indizes,
- konkrete Signalnamen,
- konkrete Transportbibliotheken.

Der Adapter ist ein reiner Informationsübermittler. Er übermittelt neutrale Ereignisse,
trifft aber keine fachlichen MES-Entscheidungen.

## Warum Maschinen- und Stations-IDs Strings sind

In realen Produktionsanlagen werden Maschinen und Stationen nicht immer mit
fortlaufenden Nummern bezeichnet. Stattdessen kommen oft sprechende Bezeichnungen
zum Einsatz:

- `S01`
- `Q01`
- `ASSEMBLY_LEFT`
- `LINE-A-STATION-3`

Deshalb sind die folgenden IDs als Strings modelliert:

- `MachineId`
- `StationId`
- `CarrierId`

Dadurch wird keine feste Anzahl oder Reihenfolge von Stationen vorausgesetzt.

## Neutrale Zustände und Parameter

- **Betriebsarten:** `observe` (nur beobachten), `validate` (prüfen, aber nicht steuern),
  `control` (aktiv steuern)
- **Verbindungszustände:** `disconnected`, `connecting`, `connected`, `degraded`
- **Stationszustände:** `unknown`, `idle`, `requesting`, `processing`, `paused`,
  `stopped`, `faulted`
- **Parameterwerte:** dürfen nur `string`, `number`, `boolean` oder `null` sein.
  Dadurch werden beliebige untypisierte Objektstrukturen vermieden und die
  Daten sind immer klar definiert.

## Ereignismodell

Der Adapter kennt drei Arten von Ereignissen:

- **Verbindungsänderung** – wenn sich der Verbindungszustand zur Maschine ändert,
- **Arbeitsanfrage** – wenn die Maschine oder ein Sensor eine neue Aufgabe anfordert,
- **Prozessabschluss** – wenn die Maschine einen Vorgang abgeschlossen hat.

Für jedes Ereignis können Handler (Funktionen) registriert werden. Jede Registrierung
gibt eine Abmeldefunktion zurück. Damit kann der Handler sauber entfernt werden,
wenn er nicht mehr benötigt wird. Dieses Verhalten wurde im isolierten Vertragstest
mit einem Fake-Adapter überprüft.

## Simulator und reale Anlage

Sowohl der Simulator als auch eine reale Maschine sollen später denselben neutralen
Vertrag erfüllen. Beide können unterschiedliche Profile und Adapterkonfigurationen
besitzen. Die MES-Fachlogik erhält dadurch stets dieselben neutralen Ereignisse,
unabhängig davon, ob ein Simulator oder eine echte Anlage angeschlossen ist.

Der bestehende Simulator wird in diesem Arbeitspaket nicht verändert.

## Umfang von MA-01

In diesem Arbeitspaket (MA-01) wurde ausschließlich Folgendes erstellt:

- neutrale Maschinentypen (`machine.types.ts`),
- `MachineAdapter`-Interface (`machine-adapter.interface.ts`),
- Dependency-Injection-Token (`machine-adapter.token.ts`),
- isolierter Vertragstest (`machine-adapter.contract.spec.ts`).

Noch nicht umgesetzt:

- Maschinenprofile,
- `MachineProfileService`,
- konkreter Maschinenadapter,
- Transporttrennung,
- Migration des Handshakes,
- Migration der Recovery,
- Migration von Aufträgen oder Routing,
- Änderung des Simulators,
- Registrierung eines produktiven Providers.

## Nächster Schritt

Ein möglicher Folgeauftrag ist:

> Maschinenprofilformat und `MachineProfileService` einführen

Dort würde definiert, wie die Konfiguration einer Maschine (ihre Stationen, Signale
und Parameter) in Profilen beschrieben wird.
