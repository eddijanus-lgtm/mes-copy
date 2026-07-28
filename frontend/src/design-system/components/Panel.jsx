export default function Panel({
  actions,
  children,
  className = "",
  description,
  padded = false,
  title,
  ...props
}) {
  const classes = ["ds-panel", padded ? "ds-panel--padded" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={classes} {...props}>
      {title ? (
        <header className="ds-panel__header">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      {padded ? children : <div className="ds-panel__body">{children}</div>}
    </section>
  );
}
