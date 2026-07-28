export default function EmptyState({ action, className = "", description, icon, title }) {
  return (
    <div className={`ds-empty-state ${className}`.trim()}>
      {icon ? <span className="ds-empty-state__icon" aria-hidden="true">{icon}</span> : null}
      <h3>{title}</h3>
      {description ? <p>{description}</p> : null}
      {action ? <div className="ds-empty-state__action">{action}</div> : null}
    </div>
  );
}
