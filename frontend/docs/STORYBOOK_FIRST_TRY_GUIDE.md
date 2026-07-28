# WARA MES Storybook – First-Try-Guide

Dieser Guide ist die wartbare Textquelle für den bebilderten PDF-Guide unter
[`output/pdf/wara-mes-storybook-first-try-guide.pdf`](../../output/pdf/wara-mes-storybook-first-try-guide.pdf).
Er erklärt den schnellsten Einstieg in das neue Design System und Storybook.

## 1. Wozu Storybook?

Storybook zeigt UI-Bausteine unabhängig von der laufenden MES-Anwendung. Dadurch
können Varianten, Zustände und Bedienung geprüft werden, ohne zuerst passende
Maschinen- oder Produktionsdaten erzeugen zu müssen.

Das hilft besonders bei einem Redesign:

- Komponenten werden nur einmal gestaltet und anschließend wiederverwendet.
- Farben, Abstände und Typografie folgen gemeinsamen Design Tokens.
- Wichtige Zustände wie „offline“, „leer“ oder „Fehler“ werden sichtbar dokumentiert.
- Änderungen lassen sich vor der Integration in eine echte Seite beurteilen.

## 2. Storybook starten

Im Ordner `frontend`:

```powershell
npm install
npm run storybook
```

Storybook ist danach standardmäßig unter
[`http://127.0.0.1:6006`](http://127.0.0.1:6006) erreichbar.

Für einen statischen Prüf-Build:

```powershell
npm run build-storybook
```

Der generierte Ordner `frontend/storybook-static` wird nicht in Git eingecheckt.

## 3. Orientierung

Die linke Navigation ist nach Komponenten und Anwendungsbereichen gegliedert:

- **Design System** enthält wiederverwendbare Grundlagen wie Button, Modal,
  Empty State, Page Header, Stat Card, Tabs und Design Tokens.
- **Dashboard** zeigt reale Dashboard-Widgets mit typischen Datenzuständen.
- **Docs** erklärt Zweck, Verwendung und Varianten einer Komponente.

Im oberen Bereich kann zwischen verschiedenen Storys gewechselt werden. Über
die Controls lassen sich freigegebene Eigenschaften direkt ausprobieren.

## 4. Varianten und Themes prüfen

Eine Story sollte nicht nur den Idealfall zeigen. Prüfe mindestens:

- Standardzustand
- Hover und Fokus
- deaktivierter Zustand
- heller und dunkler Hintergrund, sofern unterstützt
- lange deutsche Texte
- schmale und breite Darstellung
- Touch-Ziele auf Tablet-Größe

Die Darstellung einer Variante darf sich ändern, ihre fachliche Bedeutung aber
nicht. Orange steht beispielsweise für die primäre WARA-Aktion und darf nicht
gleichzeitig beliebig als Warnfarbe verwendet werden.

## 5. Dashboard-Zustände prüfen

Für Dashboard-Widgets sind fachlich korrekte Zustände besonders wichtig:

- Keine verbundene Station zeigt keine erfundenen Produktionsdaten.
- Ohne Telemetrie werden OEE-Werte als nicht verfügbar dargestellt.
- Offline-Maschinen werden nicht als „Online“ oder „verbunden“ gezählt.
- Der Empty State bietet die Aktion **Maschine anlegen** an.
- Statusfarben werden immer zusätzlich durch Text oder Symbol erklärt.

Auf dem Tablet muss ein langer Druck den Bearbeitungsmodus öffnen. Widgets
wiggeln dort leicht und lassen sich per Drag-and-drop sichtbar neu anordnen.

## 6. Eine erste Story schreiben

Eine Story liegt direkt bei der Komponente und endet auf `.stories.jsx`.

```jsx
import { Button } from './Button';

export default {
  title: 'Design System/Button',
  component: Button,
};

export const Primary = {
  args: {
    children: 'Maschine anlegen',
    variant: 'primary',
  },
};
```

Nutze `args` für Eigenschaften, die im Controls-Bereich veränderbar sein
sollen. Für fachliche Zustände sind sprechende Namen wie `NoStations`,
`Offline` oder `WithActiveAlarms` besser als `Example2`.

## 7. Struktur im Projekt

Die wichtigsten Pfade:

```text
frontend/
├── .storybook/                 Storybook-Konfiguration
├── src/design-system/          wiederverwendbare UI-Komponenten
├── src/features/               fachlich gegliederte Frontend-Module
├── src/components/dashboard/   Dashboard-Widgets und deren Storys
├── DESIGN_SYSTEM.md            Regeln und Konventionen
└── docs/                       wartbare Guides
```

Neue allgemeine UI-Bausteine gehören in `src/design-system`. Fachlogik bleibt
bei ihrem Feature. Eine Komponente sollte nicht allein deshalb ins Design System
wandern, weil sie auf mehreren Zeilen einer einzelnen Seite vorkommt.

## 8. Check vor einem Pull Request

Im Ordner `frontend`:

```powershell
npm test
npm run build
npm run build-storybook
```

Zusätzlich im Browser kontrollieren:

- keine Fehler in der Konsole
- Fokus ist per Tastatur sichtbar
- Buttons und andere Touch-Ziele sind groß genug
- leere und Offline-Zustände sind fachlich korrekt
- Layout funktioniert auf Desktop und Tablet

## 9. Arbeitsweise mit Git

Änderungen werden nach Thema getrennt:

1. Design-System- oder Storybook-Grundlage
2. fachliche Anpassung und zugehörige Tests
3. Dokumentation und Guide

Der Branch wird anschließend gepusht und als Draft Pull Request gegen `main`
geöffnet. So kann das Redesign früh begutachtet werden, ohne es voreilig in
`main` zu übernehmen.
