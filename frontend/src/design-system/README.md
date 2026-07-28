# Designsystem-API

Komponenten werden direkt importiert:

```jsx
import Button from "../design-system/components/Button.jsx";
import PageHeader from "../design-system/components/PageHeader.jsx";
```

Verfügbare Grundlagen:

- `Button`: primary, secondary, ghost, danger; sm, md, lg, touch
- `Panel`: Oberfläche mit optionalem Kopf, Beschreibung und Aktionen
- `PageHeader`: verbindlicher Seitenkopf
- `FormField`: Label, Hilfe, Fehler und ARIA-Verknüpfung
- `Modal`: Dialog mit Escape- und Backdrop-Schließen
- `Tabs`: zugängliche Tab-Navigation
- `Alert`: statusbezogene Hinweise
- `StatusBadge`: kompakter Maschinen- oder Prozessstatus
- `EmptyState`: leerer Zustand mit optionaler Aktion
- `StatCard`: standardisierte Kennzahl
- `Toolbar`: Anordnung von Seitenaktionen

Die visuelle Dokumentation und alle Varianten werden über Storybook gepflegt.
