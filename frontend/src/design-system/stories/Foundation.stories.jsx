const COLOR_TOKENS = [
  ["Akzent", "--ds-color-accent"],
  ["Canvas", "--ds-color-canvas"],
  ["Oberfläche", "--ds-color-surface"],
  ["Text", "--ds-color-text"],
  ["Text dezent", "--ds-color-text-muted"],
  ["Rahmen", "--ds-color-border"],
  ["Erfolg", "--ds-color-success"],
  ["Warnung", "--ds-color-warning"],
  ["Fehler", "--ds-color-danger"],
  ["Information", "--ds-color-info"],
];

function FoundationOverview() {
  return (
    <div style={{ display: "grid", width: "min(960px, calc(100vw - 64px))", gap: 32 }}>
      <section>
        <h1 style={{ margin: "0 0 8px", fontSize: "var(--ds-font-size-2xl)" }}>WARA MES Designsystem</h1>
        <p style={{ maxWidth: 680, margin: 0, color: "var(--ds-color-text-muted)", lineHeight: 1.6 }}>
          Zentrale Tokens bilden die verbindliche Grundlage für Desktop-, Tablet- und Touch-Oberflächen.
          Bestehende WARA-Variablen bleiben als Migrationsbrücke erhalten.
        </p>
      </section>

      <section>
        <h2>Farben</h2>
        <div className="ds-story-grid">
          {COLOR_TOKENS.map(([label, token]) => (
            <article className="ds-panel ds-panel--padded" key={token}>
              <div
                style={{
                  height: 72,
                  border: "1px solid var(--ds-color-border)",
                  borderRadius: "var(--ds-radius-md)",
                  background: `var(${token})`,
                }}
              />
              <strong style={{ display: "block", marginTop: 12 }}>{label}</strong>
              <code style={{ color: "var(--ds-color-text-muted)", fontSize: 11 }}>{token}</code>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2>Typografie</h2>
        <div className="ds-panel ds-panel--padded" style={{ display: "grid", gap: 16 }}>
          <span style={{ fontSize: "var(--ds-font-size-2xl)", fontWeight: 730 }}>Seitentitel · 28 px</span>
          <span style={{ fontSize: "var(--ds-font-size-xl)", fontWeight: 680 }}>Bereichstitel · 20 px</span>
          <span style={{ fontSize: "var(--ds-font-size-md)" }}>Inhalt und Formulare · 14 px</span>
          <span style={{ color: "var(--ds-color-text-muted)", fontSize: "var(--ds-font-size-sm)" }}>
            Hilfstext und Bedienelemente · 12 px
          </span>
        </div>
      </section>

      <section>
        <h2>Abstände und Form</h2>
        <div className="ds-panel ds-panel--padded" style={{ display: "flex", alignItems: "end", gap: 16 }}>
          {[1, 2, 3, 4, 6, 8].map((step) => (
            <div key={step} style={{ textAlign: "center" }}>
              <div
                style={{
                  width: `var(--ds-space-${step})`,
                  height: `var(--ds-space-${step})`,
                  borderRadius: "var(--ds-radius-sm)",
                  background: "var(--ds-color-accent)",
                }}
              />
              <small>{step}</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default {
  title: "Grundlagen/Design Tokens",
  component: FoundationOverview,
  parameters: {
    layout: "fullscreen",
  },
};

export const Übersicht = {};
