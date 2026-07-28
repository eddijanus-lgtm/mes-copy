# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Prototype-specific design decisions

- Optimize the dashboard for iPad landscape and touch use.
- Prefer four very large dashboard tiles with minimal at-a-glance content.
- Match the existing WARA MES design tokens and information architecture rather than the brighter red visual concept literally.
- Keep this prototype separate from the production React dashboard.
- Call the tablet start view "Dashboard", not "Leitstand".
- Keep tile headers clean without separate "Details" or "Öffnen" badges; the complete tile is the touch target.
