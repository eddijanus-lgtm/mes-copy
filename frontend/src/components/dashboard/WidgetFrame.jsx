import { DotsSixVerticalIcon } from "@phosphor-icons/react/DotsSixVertical";
import { DotsThreeIcon } from "@phosphor-icons/react/DotsThree";
import { EyeIcon } from "@phosphor-icons/react/Eye";

export default function WidgetFrame({
  definition,
  isEditing,
  onHide,
  children,
  className = "",
}) {
  return (
    <section className={`dashboard-widget ${isEditing ? "is-editing" : ""} ${className}`}>
      <header className="dashboard-widget__header">
        <span
          className="dashboard-widget__drag"
          aria-hidden="true"
          title={isEditing ? "Widget verschieben" : undefined}
        >
          <DotsSixVerticalIcon size={21} weight="bold" />
        </span>
        <div className="dashboard-widget__heading">
          <h2>{definition.title}</h2>
          <p>{definition.description}</p>
        </div>
        <div className="dashboard-widget__actions">
          {isEditing ? (
            <button type="button" onClick={onHide} aria-label={`${definition.title} ausblenden`}>
              <EyeIcon size={20} />
            </button>
          ) : null}
          <span aria-hidden="true"><DotsThreeIcon size={22} weight="bold" /></span>
        </div>
      </header>
      <div className="dashboard-widget__body">{children}</div>
    </section>
  );
}
