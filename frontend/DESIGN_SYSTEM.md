# WARA MES Designsystem

Storybook ist der verbindliche Katalog für wiederverwendbare UI-Komponenten und schwer erreichbare Zustände.

## Befehle

```text
npm run storybook
npm run build-storybook
npm run build
```

## Struktur

```text
src/design-system/
├── components/   Wiederverwendbare UI-Komponenten
├── stories/      Grundlagen, Komponenten und Seitenmuster
└── styles/
    ├── tokens.css       Farben, Typografie, Abstände, Form und Bewegung
    ├── foundation.css   Reset und globale Baseline
    └── components.css   Ausschließlich Designsystem-Komponenten
```

Feature-spezifische Komponenten bleiben in ihrem Feature, zum Beispiel `components/dashboard`. Globale Komponenten dürfen keine API- oder Featurelogik enthalten.

## Verbindliche Regeln

1. Neue Farben, Abstände, Radien oder Schatten werden zuerst als `--ds-*` Token definiert.
2. Neue allgemeine Bedienelemente werden im Designsystem erstellt und erhalten mindestens eine Story.
3. Desktop-, Tablet-, Lade-, Leer-, Fehler- und deaktivierte Zustände werden dokumentiert, wenn sie für die Komponente relevant sind.
4. Seiten importieren Komponenten direkt aus `design-system/components`. Es gibt bewusst keine Barrel-Datei.
5. Feature-CSS darf Tokens verwenden, aber keine neuen globalen Farbwerte definieren.
6. Bestehende `--wara-*` Variablen sind nur Kompatibilitäts-Aliase und werden bei jeder Feature-Migration schrittweise entfernt.
7. Vor dem Abschluss müssen `npm run build`, `npm run build-storybook` und die relevanten Interaktionen im Browser geprüft werden.

## Migrationsstrategie

Das MES bleibt während der Umstellung lauffähig. Bestehende Klassen wie `mes-panel` und `mes-primary-button` werden zunächst über dieselben Tokens versorgt. Komponenten werden anschließend seitenweise auf die dokumentierten Designsystem-Bausteine umgestellt. Sobald kein Feature mehr von einer Legacy-Regel abhängt, wird diese Regel entfernt.
