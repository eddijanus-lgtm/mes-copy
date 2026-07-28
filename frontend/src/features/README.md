# Feature-Grenzen

Fachlogik wird nach MES-Funktionsbereich organisiert. Die bestehenden Seiten bleiben während der laufenden Migration in `src/pages`; neue fachliche Module werden unterhalb dieses Ordners angelegt:

```text
features/
├── dashboard/
├── machines/
├── orders/
├── routing/
├── monitoring/
└── administration/
```

Ein Feature darf enthalten:

- fachliche Komponenten,
- Hooks und Datenadapter,
- zustandsbezogene Stories,
- feature-spezifisches CSS,
- Tests.

Ein Feature darf keine neuen globalen UI-Primitiven anlegen. Solche Bausteine gehören nach `src/design-system/components`.

## Abhängigkeitsrichtung

```text
pages → features → design-system
  ↓         ↓            ↓
routes    API/hooks    keine Fachlogik
```

Das Designsystem importiert niemals aus `features`, `pages`, `api` oder `providers`.
