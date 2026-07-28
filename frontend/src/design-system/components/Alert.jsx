export default function Alert({ children, icon, tone = "info" }) {
  return (
    <div className={`ds-alert ds-alert--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      <div>{children}</div>
    </div>
  );
}
