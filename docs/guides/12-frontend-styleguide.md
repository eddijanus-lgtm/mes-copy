# WARA MES Frontend-Styleguide

Stand: 26. Juli 2026

Dieser Styleguide ist die verbindliche Gestaltungsgrundlage für das WARA-MES-Frontend. Er beschreibt nicht nur Farben, sondern auch Informationshierarchie, Komponenten, Zustände und responsive Regeln. Ziel ist ein ruhiger industrieller Leitstand: schnell erfassbar, eindeutig und ohne dekorative Überladung.

Der Styleguide ist eine Projektkonvention und keine ISO-Zertifizierung. Er unterstützt jedoch die Grundgedanken gebrauchstauglicher Dialoggestaltung: Aufgabenangemessenheit, Selbstbeschreibungsfähigkeit, Steuerbarkeit, Erwartungskonformität und Fehlertoleranz.

## 1. Quellen im Code

| Datei | Verantwortung |
| --- | --- |
| `frontend/src/app.css` | Globale Tokens, Standardseiten, Formulare, Tabellen, Tabs, Login und Systemstatus |
| `frontend/src/tailwind.css` | Tailwind-Farben, Utilities und Seitenleiste |
| `frontend/src/pages/dashboard.css` | Ausschließlich Dashboard, Widgets und Produktionsfluss |
| `frontend/src/components/Sidebar.jsx` | Navigation und aktiver Seitenzustand |

Neue globale Regeln gehören in `app.css`. Seitenspezifische Regeln dürfen nur dann eine eigene CSS-Datei erhalten, wenn sie nicht als wiederverwendbare Komponente formulierbar sind.

## 2. Gestaltungsprinzipien

1. **Eine Hauptaufgabe pro Ansicht:** Überschrift, kurze Beschreibung und höchstens eine primäre Aktion im ersten Blickbereich.
2. **Daten vor Dekoration:** Linien, Flächen und Icons müssen eine fachliche Bedeutung haben.
3. **Weißraum statt zusätzlicher Karten:** Inhalte werden gruppiert, aber nicht mehrfach eingerahmt.
4. **Status ist immer redundant:** Farbe wird mit Text, Symbol oder Form kombiniert.
5. **Technische Wahrheit:** Fehlende Live-Daten werden als fehlend, wartend oder unbekannt angezeigt. Es werden keine Werte erfunden.
6. **Gleiche Funktion, gleiche Darstellung:** Primäraktionen, Tabellen, Filter und Status sehen auf allen Seiten gleich aus.

## 3. Farbpalette

### Basis

| Token | Wert | Verwendung |
| --- | --- | --- |
| `--wara-bg` | `#f4f5f6` | Anwendungs- und Seitenhintergrund |
| `--wara-surface` | `#ffffff` | Karten, Tabellen und Eingabeflächen |
| `--wara-surface-subtle` | `#f8f9fa` | Dezente Unterteilung und Hover |
| `--wara-text` | `#15191e` | Primärer Text |
| `--wara-text-muted` | `#68717d` | Beschreibungen und Metadaten |
| `--wara-border` | `#dfe3e7` | Standardrahmen und Trennlinien |
| `--wara-border-strong` | `#cbd1d8` | Eingabefelder und stärkere Abgrenzung |

### Marke und Status

| Token | Wert | Bedeutung |
| --- | --- | --- |
| `--wara-accent` | `#ff5a00` | Primäraktion und aktive Navigation |
| `--wara-accent-dark` | `#d94d00` | Hover der Primäraktion |
| `--wara-success` | `#07952c` | Online, erfolgreich, freigegeben |
| `--wara-warning` | `#c47a00` | Wartung, wartet, eingeschränkt |
| `--wara-error` | `#bd2d21` | Fehler, Stop, destruktive Aktion |
| `--wara-info` | `#1d70c9` | Neutrale technische Information |

Orange ist kein allgemeiner Schmuck. Es markiert die primäre Aktion, den aktiven Navigationspunkt oder einen klaren Fokuszustand. Fachliche Zustände behalten ihre semantische Statusfarbe.

## 4. Typografie

- Schriftfamilie: `Inter`, danach `Segoe UI`, `Roboto`, `Helvetica`, `Arial`.
- Seitentitel: `1.55–2rem`, Gewicht `730`, kompakte negative Laufweite.
- Abschnittstitel: Gewicht `650–680`.
- Standardtext: `0.75–0.875rem`.
- Metadaten und Tabellenköpfe: `0.62–0.72rem`.
- Technische IDs und Rohdaten: Monospace.
- Großbuchstaben werden nur für kurze Tabellenköpfe, Statussignale und technische Metadaten verwendet.
- Fließtext erhält mindestens `1.5` Zeilenhöhe.

Seitentitel dürfen nicht mit Auslassungspunkten gekürzt werden. Lange technische Werte dürfen umbrechen oder in einem gezielt horizontal scrollbaren Bereich stehen.

## 5. Seitenaufbau

Jede geschützte Standardseite verwendet die Klasse `mes-page`.

```jsx
<div className="mes-page">
  <header>
    <h1>Seitentitel</h1>
    <p>Kurze Beschreibung der Aufgabe dieser Seite.</p>
  </header>

  {/* Toolbar, Status, Tabelle oder Arbeitsbereich */}
</div>
```

- Desktop-Innenabstand: `20–34px`, abhängig von der Viewportbreite.
- Mobile-Innenabstand: `18px 14px`.
- Maximale Inhaltsbreiten werden nur bei Formularen oder Lesetexten gesetzt, nicht auf gesamten Leitstandsseiten.
- Die Sidebar ist Desktop `14.25rem` breit und mobil `4.5rem`.

## 6. Flächen, Rahmen und Schatten

- Standardradius: `8px`.
- Bedienelemente: `6px`.
- Kleine Status- oder Codeflächen: `4–5px`.
- Standardrahmen: `1px solid var(--wara-border)`.
- Schatten bleiben sehr flach: `var(--wara-shadow)`.
- Keine Glows, starken Verläufe oder mehrfach verschachtelten Karten.

### Wiederverwendbare Arbeitsflächen

| Klasse | Verwendung |
| --- | --- |
| `mes-page-header` | Seitentitel, Beschreibung und optionale Hauptaktion |
| `mes-metric-strip` | Kompakte zusammenhängende Kennzahlenleiste |
| `mes-panel` | Größere fachliche Arbeitsfläche oder Tabellenrahmen |
| `mes-panel__header` | Titel und Beschreibung innerhalb eines Panels |
| `mes-panel__body` | Inhalt eines Panels |
| `mes-filter-panel` | Suche, Filter und Ansichtssteuerung |
| `mes-context-note` | Kurzer fachlicher Prozesshinweis |
| `mes-form-grid` | Zweispaltiges Formular mit echten Labels |

Kennzahlen werden bevorzugt als zusammenhängende Leiste dargestellt. Einzelne, frei schwebende Statistik-Karten sind nur zulässig, wenn sie tatsächlich unabhängig voneinander bedient werden.

## 7. Buttons

### Primär

```jsx
<button className="mes-primary-button">Speichern</button>
```

Orange, für die wichtigste bestätigende Aktion einer Ansicht oder eines Dialogs.

### Sekundär

```jsx
<button className="mes-secondary-button">Abbrechen</button>
```

Weiße Fläche mit neutralem Rahmen. Für Aktualisieren, Zurück und ergänzende Aktionen.

### Destruktiv

```jsx
<button className="mes-danger-button">Löschen</button>
```

Rot und nur für endgültige oder gefährliche Aktionen. Eine irreversible Aktion benötigt einen Bestätigungsdialog.

Buttons enthalten konkrete Verben. Texte wie „OK“, „Los“ oder ein alleinstehendes „+“ sind zu vermeiden.

## 8. Formulare

- Eingaben sind mindestens `40px` hoch.
- Labels stehen oberhalb des Feldes.
- Fokus: orange Kontur plus sichtbarer Fokus-Ring.
- Fehler stehen in Textform direkt am Formular und verwenden zusätzlich Rot.
- Platzhalter ersetzen kein Label.
- Zusammengehörige Felder werden in einem gemeinsamen Panel gruppiert.
- Checkboxen und Radiobuttons behalten ihre native Erkennbarkeit.

## 9. Tabs und Filter

Tabs verwenden den gemeinsamen Container:

```jsx
<div className="mes-tabs">
  <button className="is-active">Aktiv</button>
  <button>Verlauf</button>
</div>
```

Der aktive Tab ist weiß auf einer neutralen Segmentfläche. Tabs sind keine primären orangefarbenen Buttons. Filter dürfen Orange verwenden, wenn genau ein aktiver Zustand hervorgehoben wird.

## 10. Tabellen

- Tabellen bleiben Tabellen und werden auf Desktop nicht in Kartenlisten umgebaut.
- Tabellenkopf: neutralgraue Fläche, kleine Großbuchstaben.
- Zeilen: ruhige Trennlinie, dezenter Hover.
- Auf schmalen Viewports scrollt der Tabellenbereich horizontal; die gesamte Seite darf nicht horizontal überlaufen.
- IDs werden verkürzt oder in Monospace gesetzt.
- Aktionen stehen in der letzten Spalte.
- Leere Tabellen zeigen einen beschreibenden Leerzustand statt einer leeren Fläche.

## 11. Status und Echtzeitdaten

Ein Status besteht aus mindestens zwei Merkmalen:

- farbiger Punkt plus Text,
- Statusfläche plus Text,
- Symbol plus zugänglicher Name.

Zulässige Begriffe sind beispielsweise `Online`, `Offline`, `Wartung`, `Störung`, `Wartet` und `Unbekannt`. Technische Rohwerte dürfen ergänzend angezeigt werden, ersetzen aber nicht die verständliche Bezeichnung.

Live-Daten müssen ihren Zustand ehrlich abbilden:

- keine Stations-ID: `Transport / wartet`,
- keine Verbindung: `Offline` oder `Getrennt`,
- noch keine Daten: `Warte auf Daten`,
- API-Fehler: sichtbare Fehlermeldung.

Toast-Meldungen werden dedupliziert und auf höchstens drei sichtbare Einträge begrenzt. Der Systemstatus ist mobil im geschlossenen Zustand auf seine drei Statuspunkte reduziert, damit er keine Arbeitsinhalte verdeckt.

## 12. Dashboard und Produktionsfluss

- Widgets dürfen verschoben und skaliert werden; ihre Inhalte bleiben an das gemeinsame Designsystem gebunden.
- Der Produktionsfluss zeigt Maschinen oben und die Carrier-Position auf einer separaten Linie darunter.
- Pro Station gibt es genau einen Positionspunkt.
- Carrier werden nur an der von der API gemeldeten `current_resource_id` platziert.
- Auf Mobilgeräten entfallen die Maschinenbilder. Carrier stehen direkt in der zugehörigen Stationskarte.
- Animationen werden nur eingesetzt, wenn sie einen realen Zustandswechsel verständlicher machen.

## 13. Responsive Verhalten

### Bis 900px

- Login wechselt auf eine einspaltige Ansicht.
- Große Tabellen bleiben in einem horizontal scrollbaren Container.
- Mehrspaltige Arbeitsbereiche reduzieren ihre Spaltenzahl.

### Bis 720px

- Sidebar wird zur Icon-Navigation.
- Seitenabstand wird reduziert.
- Drei- und vierspaltige Kennzahlenraster werden einspaltig.
- Tabs dürfen horizontal scrollen.
- Primäre Inhalte dürfen nicht unter dem Systemstatus verschwinden.

Prüfgrößen für jede neue Seite:

- Desktop: mindestens `1440 × 900`,
- Mobile: `390 × 844`,
- zusätzlich der tatsächlich verwendete Messe- oder Anlagenbildschirm.

## 14. Barrierefreiheit und Bedienbarkeit

- Interaktive Elemente sind per Tastatur erreichbar.
- Fokus darf nicht entfernt werden.
- Icon-Buttons benötigen `aria-label`.
- Dialoge verwenden `role="dialog"` und `aria-modal="true"`.
- Dekorative Bilder erhalten `alt=""`.
- Informationsbilder erhalten einen sinnvollen Alternativtext.
- Farbe darf nie das einzige Statusmerkmal sein.
- Bewegungen respektieren `prefers-reduced-motion`.
- Ziel ist gut lesbarer Kontrast; eine formale Kontrast- und Tastaturprüfung bleibt Teil der Abnahme.

## 15. Code-Regeln

- Keine neuen Inline-Styles für feste Farben, Abstände oder Radien.
- Datenabhängige Positionen, Diagrammwerte und CSS-Custom-Properties dürfen inline gesetzt werden.
- Keine neuen willkürlichen Blau-, Grün- oder Violetttöne für Standardaktionen.
- Direkte Icon-Imports statt großer Barrel-Imports.
- Wiederholte UI-Muster werden als Komponente oder gemeinsame CSS-Klasse umgesetzt.
- Seitenlogik, API-Verträge und Gestaltung bleiben getrennt.
- Ein Redesign darf keine fachlichen Workflows oder Sicherheitsregeln verändern.

## 16. Abnahmecheckliste

- [ ] Seitentitel und Beschreibung sind vollständig lesbar.
- [ ] Es gibt höchstens eine visuell dominante Primäraktion.
- [ ] Formulare besitzen Labels, Fokus und Fehlerzustände.
- [ ] Tabellen sind auf Mobilgeräten erreichbar und verursachen keinen Seitenüberlauf.
- [ ] Status wird nicht ausschließlich durch Farbe vermittelt.
- [ ] Leere, Lade- und Fehlerzustände sind vorhanden.
- [ ] Desktop und Mobile wurden im Browser geprüft.
- [ ] Es gibt keine Framework-Overlays oder relevanten Konsolenfehler.
- [ ] Der Produktionsfluss zeigt keine erfundenen Daten.
- [ ] Änderungen bestehen den Produktions-Build.
