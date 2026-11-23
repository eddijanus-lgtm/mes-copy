<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## MES mit simulierter Maschine betreiben

### OPC-UA-Stationen in der MES-Oberfläche anbinden

In **Maschinen** eine Produktionsmaschine und darunter drei Stationen anlegen oder die vorhandenen Stationen bearbeiten. Für jede Station die **Stations-ID** `1`, `2` beziehungsweise `3` und ihren eigenen **OPC-UA-Endpunkt** eintragen. Beim lokalen Simulator sind das `opc.tcp://localhost:4840/UA/WaraMesTest`, `opc.tcp://localhost:4841/UA/WaraMesTest` und `opc.tcp://localhost:4842/UA/WaraMesTest`. **Gespeicherten OPC-UA-Endpunkt verwenden** aktivieren und speichern. Das MES übernimmt die Adresse ohne Neustart. Mit **Verbindung testen** prüft es den Server und liest die Stations-ID aus `stMES.Query.uiResourceId`. Der Test meldet einen Fehler, wenn der Server nicht erreichbar ist oder eine andere Stations-ID liefert. Für echte SPS dieselben Felder mit deren Endpunkten befüllen. Ist die gespeicherte Adresse nicht aktiviert, bleibt die bisherige `.env`-Konfiguration als Vorgabe erhalten.

### Station in der Auftragsroute überspringen

Unter **Aufträge** können beim Erstellen Station 1, 2 und 3 einzeln zum Überspringen ausgewählt werden. Mindestens eine Station bleibt in der Route; die übrigen Schritte werden fortlaufend nummeriert. Bei einem vorhandenen, noch nicht gestarteten Auftrag entfernt **Station überspringen** den gewählten Schritt. Sobald ein Carrier einen Schritt begonnen hat, lehnt das MES Änderungen an der Route ab. Für die Simulation mit angepasster Route die automatische Carrier-Abfrage mit `DEMO_ADMIN_USERNAME` und `DEMO_ADMIN_PASSWORD` verwenden: nur so liest der Simulator die erste Station aus der Auftragsroute. `DEMO_CARRIER_IDS` speist Carrier fest an Station 1 ein.

Der Simulator läuft als eigener OPC-UA-Server. Das MES verwendet seinen regulären OPC-UA-Client für Stationszustände, Auftragsparameter, Steuerbefehle und Fertigmeldungen. Die Linie besteht aus Deckelzuführung, Kugeldosierung und Endkontrolle.

1. In der lokalen `.env` `OPC_UA_DEMO_RESOURCE_IDS=1,2,3` setzen. Die drei Stationen haben eigene OPC-UA-Endpunkte auf Port 4840, 4841 und 4842. Das MES verwendet standardmäßig `OPC_UA_SERVER_ADDRESS=opc.tcp://localhost:4840/UA/WaraMesTest` als Basis und leitet die weiteren Ports daraus ab. Für echte Maschinen können `OPC_UA_STATION_1_ADDRESS`, `OPC_UA_STATION_2_ADDRESS` und `OPC_UA_STATION_3_ADDRESS` einzeln gesetzt werden. Für die automatische Carrier-Zuführung `DEMO_ADMIN_USERNAME` und `DEMO_ADMIN_PASSWORD` auf einen bestehenden lokalen MES-Admin setzen.
2. PostgreSQL starten und das MES mit `npm run start:dev` starten.
3. Mit `npm run seed:stmes-demo` die drei Stationen, den Testauftrag und die beiden Carrier anlegen. Der Seed setzt den Fortschritt dieses Testauftrags zurück.
4. In einem zweiten Terminal `npm run start:machine-simulator` ausführen. Die Carrier durchlaufen die drei Stationen. Im MES lassen sich die laufenden Schritte im Shopfloor und die Fertigmenge im Testauftrag verfolgen.

Für einen simulierten Wareneingang ohne REST-Abfrage kann der Simulator mit `DEMO_CARRIER_IDS=128,129` gestartet werden. Die Carrier werden an Station 1 eingespeist. Das MES löst ihre Aufträge und Routen über den regulären OPC-UA-Handshake auf. Der simulierte Schnittstellenvertrag ist im [stMES-Demo-Vertrag](docs/guides/07-stmes-demo-contract.md) dokumentiert.

## Tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
