import Panel from "./Panel.jsx";

export default function StatCard({ icon, label, tone = "neutral", value = "" }) {
  return (
    <Panel className={`ds-stat-card ds-stat-card--${tone}`} padded>
      <p className="ds-stat-card__label">{label}</p>
      {value !== "" ? (
        <div className="ds-stat-card__value">
          <strong>{value}</strong>
          {icon ? <span className="ds-stat-card__icon">{icon}</span> : null}
        </div>
      ) : null}
    </Panel>
  );
}
