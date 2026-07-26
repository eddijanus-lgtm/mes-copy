# Design-QA: Produktionsaufträge

## Vergleichsgrundlage

- Sollbild: `C:\Users\scharon\.codex\generated_images\019f9e63-f6c0-7cc0-b20b-943aa38832aa\call_3SbLhJGOYInYaGHaPKHMGjZs.png`
- Istbild: `C:\Users\scharon\.codex\visualizations\2026\07\26\019f9e63-f6c0-7cc0-b20b-943aa38832aa\orders-implementation-open.png`
- Direktvergleich: `C:\Users\scharon\.codex\visualizations\2026\07\26\019f9e63-f6c0-7cc0-b20b-943aa38832aa\orders-design-qa-side-by-side.png`
- Desktop-Viewport: 1440 × 1024 Pixel
- Mobil-Viewport: 390 × 844 Pixel
- Geprüfter Zustand: Auftragsliste mit ausgewählter Tabellenzeile und geöffneter rechter Detailansicht

## Vollständiger Vergleich

- Seitenaufbau, Navigation, Kopfbereich und orange Primäraktion entsprechen der freigegebenen Designsprache.
- Die Aufträge werden als kompakte Tabelle mit Status, Menge, Fortschritt und Carrier dargestellt.
- Die ausgewählte Zeile ist orange hinterlegt und links markiert.
- Die rechte Seitenansicht übernimmt Kopf, Status, Fortschritt, Aktionen, Tabs, Stammdaten, Route, Carrier und Notizen.
- Die visuelle Hierarchie, Abstände, Linien, Typografie und reduzierte Farbverwendung liegen eng am Sollbild.
- Auf kleinen Viewports wird die Seitenansicht als vollflächiger Drawer dargestellt; die Tabelle bleibt darunter erhalten.

## Bewusste Abweichungen

- Die Prüfung verwendet echte lokale Daten. Aktuell sind alle 15 Aufträge abgeschlossen; deshalb zeigt das Istbild keinen laufenden Auftrag.
- `Erstellt von` wird nicht angezeigt, weil die aktuelle API kein entsprechendes Feld liefert.
- Ein zusätzlicher Button `Auftrag schließen` wurde nicht übernommen. Gemäß abgestimmtem Verhalten schließen das Chevron oder das X die Seitenansicht, ohne eine doppelte Aktion anzubieten.

## Interaktionsprüfung

- Chevron öffnet die Seitenansicht und setzt `aria-expanded`.
- Dasselbe Chevron schließt die Seitenansicht wieder.
- X schließt die mobile und die Desktop-Seitenansicht.
- Die Tabs `Übersicht`, `Route & Carrier` und `Verlauf` wechseln den Inhalt.
- Desktop- und Mobilansicht wurden mit echten API-Daten geprüft.
- Produktionsbuild erfolgreich; lediglich der bestehende Hinweis auf ein JavaScript-Bundle über 500 kB bleibt bestehen.

## Prüfhistorie

1. Desktop ohne Auswahl geprüft.
2. `ORDER-015` über das Chevron geöffnet und die Detailansicht geprüft.
3. `Route & Carrier` geöffnet und technische Routendaten verifiziert.
4. Detailansicht über dasselbe Chevron geschlossen.
5. Mobile Ansicht geöffnet und über X geschlossen.
6. Soll- und Istbild gemeinsam visuell verglichen.

final result: passed
