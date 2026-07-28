# Design QA

## Evidence

- Source visual truth: `C:\Users\scharon\AppData\Local\Temp\codex-clipboard-c6589e67-41a6-429b-97ec-c2d527aa5866.png`
- Browser-rendered implementation: `C:\Users\scharon\Documents\Default Project\wara-mes\mocks\ipad-dashboard-html-mock\implementation-ipad-final.png`
- Edit-mode implementation: `C:\Users\scharon\Documents\Default Project\wara-mes\mocks\ipad-dashboard-html-mock\implementation-edit-mode-final.png`
- Combined comparison: `C:\Users\scharon\Documents\Default Project\wara-mes\mocks\ipad-dashboard-html-mock\design-comparison-final.png`
- Source pixels: 1448 × 1086
- Implementation pixels: 1366 × 1024
- CSS viewport: 1366 × 1024
- Device scale factor: 1
- State: iPad landscape, light theme, default four-widget dashboard
- Normalization: both images were aspect-fit into equal 1366 × 1024 comparison panels.

## Full-view comparison

The implementation preserves the selected concept's four large tiles, 2 × 2 hierarchy, compact top bar, bottom navigation, station flow, OEE ring, alarm emphasis, and paired performance metrics. It intentionally adapts the source to the existing WARA MES tokens: orange accent instead of concept red, smaller 8–12 px radii, subtle borders, compact Segoe UI/Inter typography, and the existing dashboard labels.

## Focused comparison

- Typography: the implementation uses the product's existing Inter/Segoe UI stack, compact heading weights, and smaller dashboard chrome. Values remain readable at arm's length.
- Spacing and layout: the 2 × 2 grid, four large touch surfaces, top actions, and 96 px bottom navigation fit the full 1366 × 1024 viewport without scrolling.
- Colors and tokens: `#ff5a00` WARA accent, `#07952c` success, `#bd2d21` alarm, `#f4f5f6` canvas, and existing border/shadow values match the current product.
- Image and icon quality: no raster placeholders are used. UI icons come from the same Phosphor family used by the production dashboard.
- Copy and content: Produktionsfluss, OEE Live-Score, Aktive Alarme, Leistung, Frühschicht, and navigation labels match the current dashboard information architecture.

## Interaction verification

- Short tap opens widget details.
- Bearbeiten/Speichern toggles the edit state.
- Widget catalog removes and adds widgets while enforcing the four-widget iPad limit.
- Betriebsstatus successfully replaced Produktionsfluss in browser verification.
- Pointer drag changed the widget order from `production, oee, alarms, performance` to `oee, alarms, production, performance`.
- Drag behavior uses a lifted preview following the pointer, a visible placeholder, animated FLIP movement for neighboring slots, and a 200 ms snap-to-slot transition.
- Long-press activation is implemented at 560 ms. The browser automation surface cannot hold a pointer down without completing a drag, so dwell timing remains a physical-touch follow-up check.
- Alarm acknowledgement updates the visible count.
- Browser console warnings/errors checked: none.
- Build and Sites packaging tests pass.

## Comparison history

1. Initial implementation had a 1 px vertical overflow.
   - Fix: constrained the landscape shell to `height: 100vh` with hidden overflow.
   - Post-fix evidence: document and viewport both measure 1366 × 1024.
2. Initial reorder behavior changed grid order abruptly.
   - Fix: added a lifted drag preview, placeholder state, FLIP transitions for displaced widgets, and animated landing.
   - Post-fix evidence: browser drag changed the DOM order and produced no console errors.

## Findings

No actionable P0, P1, or P2 visual issues remain. The only residual test gap is physical verification of the 560 ms long-press threshold on an actual iPad.

## Follow-up polish

- P3: tune the long-press threshold between 500 and 650 ms after trying it on the target iPad.
- P3: persist widget order and visibility to the user's dashboard profile when this prototype is promoted into production code.

final result: passed
