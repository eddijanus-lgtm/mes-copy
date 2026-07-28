import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadDosModuleRows } from "./dosMesApi.js";
import "./dos-mes.css";

const MODULES = [
  {
    key: "machines",
    label: "Maschinenstatus",
    columns: ["NR", "ANLAGE", "STATUS", "STANDORT", "LETZTES SIGNAL"],
  },
  {
    key: "orders",
    label: "Fertigungsaufträge",
    columns: ["AUFTRAG", "OPERATION", "MENGE", "FORTSCHRITT", "STATUS"],
  },
  {
    key: "alarms",
    label: "Störungen und Alarme",
    columns: ["ZEIT", "QUELLE", "MELDUNG", "KLASSE", "STATUS"],
  },
  {
    key: "material",
    label: "Material und Werkstückträger",
    columns: ["IDENT", "TYP", "INHALT", "ORT", "STATUS"],
  },
  {
    key: "traces",
    label: "Rückverfolgung",
    columns: ["ZEIT", "DATENPUNKT", "KATEGORIE", "MASCHINE", "WERT"],
  },
  {
    key: "shifts",
    label: "Schichtverwaltung",
    columns: ["SCHICHT", "ZEITRAUM", "LEITUNG", "DATUM", "STATUS"],
  },
  {
    key: "system",
    label: "Benutzer und System",
    columns: ["KENNUNG", "NAME / DIENST", "ROLLE", "ANMELDUNG", "STATUS"],
  },
];

const HELP_ROWS = [
  ["↑ / ↓", "Auswahl bewegen"],
  ["1 – 7", "Modul direkt aufrufen"],
  ["ENTER", "Auswahl bestätigen"],
  ["ESC", "Zurück zum Hauptmenü"],
  ["F1", "Diese Hilfe anzeigen"],
  ["F4", "Suche öffnen"],
  ["F5", "Anzeige aktualisieren"],
  ["F10", "DOS-Modus beenden"],
];

function FunctionKey({ keyName, children, onActivate }) {
  return (
    <button className="dos-function" type="button" onClick={onActivate}>
      <b>{keyName}</b> {children}
    </button>
  );
}

function FunctionBar({ detail = false, onBack, onExit, onHelp, onRefresh, onSearch }) {
  return (
    <footer className="dos-function-bar" aria-label="Funktionstasten">
      <FunctionKey keyName="F1" onActivate={onHelp}>Hilfe</FunctionKey>
      {detail ? <FunctionKey keyName="ESC" onActivate={onBack}>Zurück</FunctionKey> : null}
      <FunctionKey keyName="F4" onActivate={onSearch}>Suche</FunctionKey>
      <FunctionKey keyName="F5" onActivate={onRefresh}>Aktualisieren</FunctionKey>
      <FunctionKey keyName="F10" onActivate={onExit}>Beenden</FunctionKey>
    </footer>
  );
}

function MainMenu({ onOpen, selected }) {
  return (
    <div className="dos-screen-content dos-main-menu">
      <ol aria-label="MES-Hauptmenü">
        {MODULES.map((module, index) => (
          <li
            className={index === selected ? "is-selected" : ""}
            key={module.key}
            aria-current={index === selected ? "true" : undefined}
          >
            <button type="button" onClick={() => onOpen(index)}>
              <span>{index + 1}</span>
              <span>{module.label}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="dos-prompt">
        Auswahl: <span>{selected + 1}</span><i aria-hidden="true" />
      </div>
    </div>
  );
}

function ModuleTable({ error, loading, module, onSelectRow, rows, selectedRow }) {
  const pageSize = 10;
  const pageIndex = Math.floor(selectedRow / pageSize);
  const pageStart = pageIndex * pageSize;
  const pageRows = rows.slice(pageStart, pageStart + pageSize);

  return (
    <div className="dos-screen-content dos-module-screen">
      <div className="dos-module-heading">
        <span>MODUL {String(MODULES.indexOf(module) + 1).padStart(2, "0")}</span>
        <strong>{module.label.toUpperCase()}</strong>
        <span>SEITE {String(pageIndex + 1).padStart(2, "0")}</span>
      </div>
      <div className="dos-table-wrap">
        {loading ? <p className="dos-table-state">DATEN WERDEN GELADEN ...</p> : null}
        {!loading && error ? <p className="dos-table-state is-error">{error.toUpperCase()}</p> : null}
        {!loading && !error && rows.length === 0
          ? <p className="dos-table-state">KEINE DATENSÄTZE VORHANDEN</p>
          : null}
        {!loading && !error && rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                {module.columns.map((column) => <th key={column}>{column}</th>)}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, rowIndex) => {
                const absoluteIndex = pageStart + rowIndex;
                return (
                <tr
                  className={absoluteIndex === selectedRow ? "is-selected" : ""}
                  key={`${absoluteIndex}-${row.join("-")}`}
                  onClick={() => onSelectRow(absoluteIndex)}
                >
                  {row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}
                </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
      <div className="dos-record-count">
        DATENSATZ {String(rows.length === 0 ? 0 : selectedRow + 1).padStart(3, "0")} VON {String(rows.length).padStart(3, "0")}
      </div>
    </div>
  );
}

function DosDialog({ title, children }) {
  return (
    <div className="dos-dialog-backdrop">
      <section className="dos-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

export default function DosMes() {
  const navigate = useNavigate();
  const [booting, setBooting] = useState(true);
  const [selected, setSelected] = useState(0);
  const [activeModule, setActiveModule] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("SYSTEM BEREIT");
  const rootRef = useRef(null);
  const loadRequestRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 850);
    rootRef.current?.focus();
    return () => window.clearTimeout(timer);
  }, []);

  const loadModule = useCallback(async (module) => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setLoading(true);
    setLoadError(null);
    setFilter("");
    setSelectedRow(0);
    setMessage(`${module.label.toUpperCase()} WIRD GELADEN ...`);

    try {
      const nextRows = await loadDosModuleRows(module.key);
      if (loadRequestRef.current !== requestId) return;
      setRows(nextRows);
      setMessage(`${String(nextRows.length).padStart(3, "0")} DATENSÄTZE GELADEN`);
    } catch (error) {
      if (loadRequestRef.current !== requestId) return;
      setRows([]);
      setLoadError(error.message || "API nicht erreichbar");
      setMessage("FEHLER BEIM LADEN – F5 WIEDERHOLEN");
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  }, []);

  const openModule = useCallback((index) => {
    const module = MODULES[index];
    setSelected(index);
    setActiveModule(module);
    void loadModule(module);
  }, [loadModule]);

  const closeModule = useCallback(() => {
    loadRequestRef.current += 1;
    setActiveModule(null);
    setRows([]);
    setFilter("");
    setLoadError(null);
    setLoading(false);
    setMessage("HAUPTMENÜ");
  }, []);

  const showHelp = useCallback(() => setDialog("help"), []);
  const showSearch = useCallback(() => setDialog("search"), []);
  const refresh = useCallback(() => {
    if (activeModule) {
      void loadModule(activeModule);
      return;
    }
    setMessage("BITTE ZUERST EIN MODUL AUSWÄHLEN");
  }, [activeModule, loadModule]);
  const exitDos = useCallback(() => navigate("/"), [navigate]);
  const visibleRows = useMemo(() => {
    const normalizedFilter = filter.trim().toLocaleLowerCase("de-DE");
    if (!normalizedFilter) return rows;
    return rows.filter((row) => row.join(" ").toLocaleLowerCase("de-DE").includes(normalizedFilter));
  }, [filter, rows]);

  const applySearch = useCallback(() => {
    const nextFilter = search.trim();
    setFilter(nextFilter);
    setSelectedRow(0);
    setMessage(nextFilter
      ? `FILTER "${nextFilter.toUpperCase()}" – TREFFER WERDEN ANGEZEIGT`
      : "FILTER AUFGEHOBEN");
    setDialog(null);
    setSearch("");
  }, [search]);

  const handleKeyDown = useCallback((event) => {
    const { key } = event;

    if (booting) {
      event.preventDefault();
      setBooting(false);
      return;
    }

    if (dialog === "help") {
      if (key === "Escape" || key === "F1" || key === "Enter") {
        event.preventDefault();
        setDialog(null);
      }
      return;
    }

    if (dialog === "search") {
      const isSearchInput = event.target.tagName === "INPUT";
      if (key === "Escape") {
        event.preventDefault();
        setDialog(null);
        setSearch("");
      } else if (key === "Enter") {
        event.preventDefault();
        applySearch();
      } else if (isSearchInput) {
        return;
      } else if (key === "Backspace") {
        event.preventDefault();
        setSearch((value) => value.slice(0, -1));
      } else if (key.length === 1 && /^[\p{L}\p{N}\-_. ]$/u.test(key)) {
        event.preventDefault();
        setSearch((value) => `${value}${key}`.slice(0, 28));
      }
      return;
    }

    if (key === "F1") {
      event.preventDefault();
      showHelp();
      return;
    }
    if (key === "F4") {
      event.preventDefault();
      showSearch();
      return;
    }
    if (key === "F5") {
      event.preventDefault();
      refresh();
      return;
    }
    if (key === "F10") {
      event.preventDefault();
      exitDos();
      return;
    }

    if (activeModule) {
      if (key === "Escape") {
        event.preventDefault();
        closeModule();
      } else if (key === "ArrowDown") {
        event.preventDefault();
        if (visibleRows.length > 0) setSelectedRow((row) => (row + 1) % visibleRows.length);
      } else if (key === "ArrowUp") {
        event.preventDefault();
        if (visibleRows.length > 0) {
          setSelectedRow((row) => (row - 1 + visibleRows.length) % visibleRows.length);
        }
      }
      return;
    }

    if (/^[1-7]$/.test(key)) {
      event.preventDefault();
      openModule(Number(key) - 1);
    } else if (key === "ArrowDown") {
      event.preventDefault();
      setSelected((index) => (index + 1) % MODULES.length);
    } else if (key === "ArrowUp") {
      event.preventDefault();
      setSelected((index) => (index - 1 + MODULES.length) % MODULES.length);
    } else if (key === "Enter") {
      event.preventDefault();
      openModule(selected);
    }
  }, [
    activeModule,
    applySearch,
    booting,
    closeModule,
    dialog,
    exitDos,
    openModule,
    refresh,
    search,
    selected,
    showHelp,
    showSearch,
    visibleRows.length,
  ]);

  return (
    <main
      className="dos-mes"
      onKeyDown={handleKeyDown}
      onPointerDown={booting ? () => setBooting(false) : undefined}
      ref={rootRef}
      tabIndex={-1}
      aria-label="WARA MES DOS-Modus"
    >
      {booting ? (
        <div className="dos-boot" aria-live="polite">
          <p>WARA INDUSTRIES SYSTEM BIOS 3.10</p>
          <p>640K SYSTEMSPEICHER OK</p>
          <p>MES-DATENBANK WIRD INITIALISIERT ... OK</p>
          <p>BEDIENTERMINAL 01 WIRD GESTARTET ...<i aria-hidden="true" /></p>
          <small>BELIEBIGE TASTE DRÜCKEN</small>
        </div>
      ) : (
        <div className="dos-terminal">
          <fieldset className="dos-frame">
            <legend>WARA MES 6.22</legend>
            {activeModule
              ? (
                <ModuleTable
                  error={loadError}
                  loading={loading}
                  module={activeModule}
                  onSelectRow={setSelectedRow}
                  rows={visibleRows}
                  selectedRow={selectedRow}
                />
              )
              : <MainMenu onOpen={openModule} selected={selected} />}
          </fieldset>
          <div className="dos-status-line">
            <span>{message}</span>
            <span>TERMINAL 01</span>
          </div>
          <FunctionBar
            detail={Boolean(activeModule)}
            onBack={closeModule}
            onExit={exitDos}
            onHelp={showHelp}
            onRefresh={refresh}
            onSearch={showSearch}
          />
        </div>
      )}

      {dialog === "help" ? (
        <DosDialog title="HILFE – TASTATURBELEGUNG">
          <dl className="dos-help-list">
            {HELP_ROWS.map(([key, description]) => (
              <div key={key}><dt>{key}</dt><dd>{description}</dd></div>
            ))}
          </dl>
          <button className="dos-dialog-hint" type="button" onClick={() => setDialog(null)}>
            ENTER ODER ESC = SCHLIESSEN
          </button>
        </DosDialog>
      ) : null}

      {dialog === "search" ? (
        <DosDialog title="SUCHE">
          <label className="dos-search-label">
            SUCHBEGRIFF:
            <span>
              <input
                autoFocus
                maxLength={28}
                onChange={(event) => setSearch(event.target.value)}
                value={search}
              />
              <i aria-hidden="true" />
            </span>
          </label>
          <div className="dos-dialog-actions">
            <button type="button" onClick={applySearch}>
              SUCHEN
            </button>
            <button type="button" onClick={() => {
              setDialog(null);
              setSearch("");
            }}>
              ABBRUCH
            </button>
          </div>
        </DosDialog>
      ) : null}
    </main>
  );
}
