import { useMemo, useState } from "react";
import { EyeIcon } from "@phosphor-icons/react/Eye";
import { EyeSlashIcon } from "@phosphor-icons/react/EyeSlash";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon } from "@phosphor-icons/react/X";
import { DotsSixVerticalIcon } from "@phosphor-icons/react/DotsSixVertical";
import { WIDGET_DEFINITIONS } from "../../dashboard/dashboardConfig.js";

export default function WidgetCatalog({ visibleWidgetIds, onToggle, onClose }) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("de");
    return WIDGET_DEFINITIONS.reduce((result, widget) => {
      if (normalizedQuery && !`${widget.title} ${widget.description}`.toLocaleLowerCase("de").includes(normalizedQuery)) {
        return result;
      }
      (result[widget.category] ||= []).push(widget);
      return result;
    }, {});
  }, [query]);

  return (
    <aside className="widget-catalog" aria-label="Widget-Katalog">
      <div className="widget-catalog__title">
        <h2>Widgets</h2>
        <button type="button" onClick={onClose} aria-label="Bearbeitung abbrechen">
          <XIcon size={21} />
        </button>
      </div>
      <label className="widget-catalog__search">
        <MagnifyingGlassIcon size={18} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Widgets suchen..."
          aria-label="Widgets suchen"
        />
      </label>
      <div className="widget-catalog__groups">
        {Object.entries(groups).map(([category, widgets]) => (
          <section key={category}>
            <h3>{category}</h3>
            <div className="widget-catalog__list">
              {widgets.map((widget) => {
                const visible = visibleWidgetIds.has(widget.id);
                return (
                  <button
                    type="button"
                    key={widget.id}
                    className={!visible ? "is-hidden" : ""}
                    onClick={() => onToggle(widget.id)}
                    aria-pressed={visible}
                  >
                    {visible ? <EyeIcon size={19} /> : <EyeSlashIcon size={19} />}
                    <span>{widget.title}</span>
                    <DotsSixVerticalIcon size={18} weight="bold" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {Object.keys(groups).length === 0 ? (
          <p className="widget-catalog__empty">Keine passenden Widgets.</p>
        ) : null}
      </div>
    </aside>
  );
}
