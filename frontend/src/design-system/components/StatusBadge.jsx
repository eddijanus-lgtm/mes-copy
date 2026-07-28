export default function StatusBadge({ children, tone = "neutral" }) {
  return <span className={`ds-status-badge ds-status-badge--${tone}`}>{children}</span>;
}
