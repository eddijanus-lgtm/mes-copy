export default function PageHeader({ actions, className = "", description, title, titleAccessory }) {
  return (
    <header className={`ds-page-header ${className}`.trim()}>
      <div className="ds-page-header__copy">
        <div className="mes-title-row">
          <h1>{title}</h1>
          {titleAccessory}
        </div>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ds-page-header__actions">{actions}</div> : null}
    </header>
  );
}
