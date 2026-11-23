# WARA MES auf dem Schulserver

GitHub Actions prüft Pull Requests gegen `main` und baut aus jedem erfolgreichen Push auf `main` ein Release-Archiv mit der Commit-SHA im Namen. Für den ersten Rollout wird genau dieses Archiv über den von der Schule freigegebenen Zugang übertragen und vor Ort aktiviert. So braucht der Schulserver keine eingehende Verbindung von GitHub Actions.

## Testpipeline

| Job | Prüfung |
| --- | --- |
| Backend-Tests und Build | `npm ci`, Jest-Unit- und Integrationssuiten, Jest-HTTP-E2E-Suiten und NestJS-Build |
| Frontend-Build | `npm ci` und Vite-Produktionsbuild in `frontend/` |
| Release- und Startprüfung | Entpackt das gebaute Archiv, installiert nur Produktionsabhängigkeiten, initialisiert eine kurzlebige PostgreSQL-16-Datenbank und startet das Release mit deaktivierter Schema-Synchronisierung erneut. Prüft Datenbank-Health, Frontend inklusive JavaScript-Datei, Admin-Login und authentifizierten API-Zugriff. Nur auf `main` wird das geprüfte Paket veröffentlicht. |

Backend und Frontend laufen parallel auf Linux mit Node.js 24. Die Startprüfung nutzt ausschließlich CI-Testwerte. Auf dem Schulserver werden zusätzlich die Bestandsdatenbank, der Browser-Login über HTTPS und die eingerichteten MQTT-, OPC-UA- und WebSocket-Verbindungen geprüft. Als Pflichtprüfung für Pull Requests gegen `main` eignet sich `Release- und Startprüfung`, da sie beide Build-Jobs voraussetzt. [GitHub-Dokumentation zu Pflichtprüfungen](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

## Erster Rollout

**Arbeitsannahme** ist ein Linux-Schulserver mit Node.js 24, freigegebenem SSH/SFTP-Zugang und einem von der Schul-IT verwalteten HTTPS-Reverse-Proxy. Das Beispiel verwendet systemd, einen dedizierten Dienstbenutzer und das Release-Verzeichnis `/srv/mes`. Schul-IT bestätigt Zugang, Pfade, Berechtigungen, internen Hostnamen, Datenbank und erreichbare Shopfloor-Dienste.

1. **Datenbank vorbereiten.** Eine separate PostgreSQL-Datenbank (mit TimescaleDB, falls die Zeitreihenfunktionen benötigt werden) bereitstellen. Bei einer Bestandsdatenbank vor Änderungen ein Backup und den Wiederherstellungsweg prüfen. `TYPEORM_SYNCHRONIZE=false` für den laufenden Dienst setzen. Dieses Repository enthält keine versionierten TypeORM-Schemamigrationen. Für eine leere Datenbank zuerst die Schemaanlage in einer neuen, isolierten Datenbank mit derselben App-Version erproben. Dort kann `TYPEORM_SYNCHRONIZE=true` einmalig für die Initialisierung verwendet werden. Anschließend die Synchronisierung wieder abschalten. Die optionale Phase-3-Migration erst nach Anlage der Tabellen und separat nach [Deploy-Anleitung](deploy.md) ausführen. Sie richtet unter anderem eine Retention Policy ein.
2. **Dienst einrichten.** Den Dienst `mes.service` mit `WorkingDirectory=/srv/mes/current` und `ExecStart=/usr/bin/node dist/main.js` konfigurieren. Den Node-Pfad an die Installation anpassen. Zunächst eine Instanz betreiben, da die Anwendung Polling und geplante Aufgaben im Prozess startet. `NODE_ENV=production`, `PORT`, `CORS_ORIGINS`, `DB_*` und `JWT_SECRET` in einer zugriffsgeschützten systemd-`EnvironmentFile` außerhalb der Release-Verzeichnisse hinterlegen. Optionale Integrationen gemäß [.env.example](../.env.example) konfigurieren. Das erste Administratorkonto nach der [Onboarding-Anleitung](onboarding.md) einmalig anlegen.
3. **Release bereitstellen.** Das Artefakt `mes-<commit-sha>` aus dem erfolgreichen Workflow herunterladen, das darin enthaltene `.tar.gz` über den Schulzugang übertragen und in `/srv/mes/releases/<commit-sha>` entpacken. Dort `npm ci --omit=dev` ausführen. Dafür braucht der Zielhost Zugriff auf eine freigegebene npm-Registry oder einen internen Mirror. Bei gesperrtem Registry-Zugang muss CI die Produktionsabhängigkeiten in einer Umgebung passend zu Betriebssystem und Architektur des Schulservers vorinstallieren und mitliefern.
4. **Release aktivieren.** Den bisherigen Zielpfad mit `readlink /srv/mes/current` festhalten. Den Symlink `/srv/mes/current` auf das vorbereitete Release umstellen und `sudo systemctl restart mes` ausführen. Am HTTPS-Reverse-Proxy die Anwendung einschließlich `/api/` und WebSocket-Upgrades für `/api/shopfloor/ws` an den Dienst weiterleiten.
5. **Smoke-Test aus dem Schulnetz.** Die Startseite öffnen, `curl --fail --silent --show-error https://<mes-host>/api/health` ausführen und im Browser mit einem vorgesehenen Testkonto anmelden. Eine Auftragsliste laden und bei konfigurierten Shopfloor-Integrationen Telemetrie und WebSocket-Verbindung prüfen. Bei Fehlern `journalctl -u mes -n 100` kontrollieren und den Rollback auslösen.

## Rollback und spätere Automatisierung

Bei einem fehlgeschlagenen Smoke-Test den Symlink auf das zuletzt geprüfte Release zurücksetzen, `mes.service` neu starten und denselben Smoke-Test wiederholen. Beim Erstdeploy ohne Vorgängerversion den Dienst stoppen und den Fehler anhand der Logs beheben. Wenn sich das Schema geändert hat, ist ein App-Rollback nur mit kompatiblem Schema möglich. Die Datenbankwiederherstellung separat mit der Schul-IT abstimmen.

Sobald die Schul-IT einen Ausführungsweg ins Schulnetz freigibt, kann ein manuell ausgelöster Deployment-Job für die GitHub-Umgebung `schulserver` die Schritte 3 bis 5 ausführen. Der Job darf nur ein erfolgreich gebautes Artefakt von `main` übernehmen und sollte Deployments serialisieren. Ein Runner im Schulnetz wird ausschließlich für vertrauenswürdige Deployment-Jobs eingesetzt. Zugangsdaten bleiben bei der Schul-IT oder in der geschützten Deployment-Umgebung. [GitHub-Dokumentation zu Deployment-Umgebungen](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)
