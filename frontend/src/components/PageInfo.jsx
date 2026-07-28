import { useEffect, useRef, useState } from "react";

const pageHelp = {
  dashboard: {
    title: "Leitstand",
    actions: [
      ["Ansicht", "Wechselt zwischen gespeicherten Dashboard-Ansichten."],
      ["Dashboard bearbeiten", "Öffnet den Bearbeitungsmodus für Widgets."],
      ["Zurücksetzen", "Setzt noch nicht gespeicherte Änderungen zurück."],
      ["Abbrechen", "Verwirft Änderungen und beendet die Bearbeitung."],
      ["Speichern", "Speichert Anordnung, Größe und Sichtbarkeit der Widgets."],
      ["Widget suchen", "Filtert die verfügbaren Widgets."],
      ["Widget ein- oder ausblenden", "Zeigt ein Widget an oder blendet es aus."],
      ["Zeitraum", "Wählt den Zeitraum für Trenddaten."],
      ["Maschine / Intervall", "Filtert Trends nach Maschine und Zeitabstand."],
      ["Schichtbericht / Tagesbericht", "Öffnet den gewählten Bericht als PDF."],
    ],
  },
  machines: {
    title: "Maschinen",
    actions: [
      ["CSV Template herunterladen", "Lädt eine Vorlage für den Maschinenimport herunter."],
      ["CSV importieren", "Öffnet den Import einer Maschinenliste."],
      ["Manuellen Stammdatensatz anlegen", "Öffnet das Formular für einen manuell gepflegten Maschinendatensatz."],
      ["Maschine konfigurieren", "Öffnet den Assistenten für Maschinenprofile."],
      ["Maschinen durchsuchen", "Filtert Maschinen nach dem eingegebenen Text."],
      ["Edit", "Bearbeitet die gewählte Maschine."],
      ["Löschen", "Öffnet die Sicherheitsabfrage zum Löschen einer Maschine."],
      ["Datei auswählen", "Wählt eine CSV-Datei für den Import."],
      ["Speichern / Importieren", "Speichert die Eingaben oder startet den Import."],
      ["Abbrechen / Schließen", "Schließt das aktuelle Fenster ohne weitere Änderung."],
    ],
  },
  orders: {
    title: "Produktionsaufträge",
    actions: [
      ["Alle Produktionsläufe CSV", "Lädt die Produktionsdaten aller fertigen Aufträge herunter."],
      ["Neuer Auftrag", "Öffnet das Formular für einen Produktionsauftrag."],
      ["Statusreiter", "Filtert Aufträge nach ihrem Status."],
      ["Suche", "Sucht nach Auftrag oder Produkt."],
      ["Filter", "Öffnet zusätzliche Status- und Carrier-Filter."],
      ["Filter zurücksetzen", "Entfernt alle Auftragsfilter."],
      ["Pfeil an der Auftragszeile", "Öffnet oder schließt die Auftragsdetails."],
      ["Übersicht / Route & Carrier / Verlauf", "Wechselt den Bereich der Auftragsdetails."],
      ["UUID kopieren", "Kopiert die vollständige Auftrags-ID."],
      ["Produktionslauf CSV", "Lädt die Daten des gewählten Auftrags herunter."],
      ["Bearbeiten", "Öffnet den Auftrag zur Bearbeitung."],
      ["Weitere Aktionen", "Öffnet zusätzliche Auftragsaktionen."],
      ["Speichern", "Erstellt oder aktualisiert den Auftrag."],
      ["Auftrag löschen", "Löscht Auftrag und Route nach Bestätigung."],
      ["Abbrechen / X", "Schließt das aktuelle Fenster ohne weitere Änderung."],
    ],
  },
  shifts: {
    title: "Schichtmanagement",
    actions: [
      ["Schichten / Berichte", "Wechselt zwischen Schichtplanung und Berichten."],
      ["Schicht anlegen", "Erstellt eine Schicht mit den eingegebenen Daten."],
      ["Schließen", "Schließt die gewählte laufende Schicht."],
      ["Finalisieren", "Schützt den Bericht vor weiteren Änderungen."],
    ],
  },
  alarms: {
    title: "Alarme",
    actions: [
      ["CSV Export", "Exportiert die aktuell gefilterten Alarme."],
      ["Schweregrad", "Zeigt Alarme des gewählten Schweregrads."],
      ["Alle / Offen / Bestätigt", "Filtert nach dem Bearbeitungsstatus."],
      ["Alle auswählen", "Wählt alle sichtbaren Alarme aus oder ab."],
      ["Alarm auswählen", "Nimmt den Alarm in die Sammelaktion auf."],
      ["Bestätigen", "Markiert einen oder mehrere Alarme als bearbeitet."],
      ["Löschen", "Löscht die ausgewählten Alarme."],
    ],
  },
  notifications: {
    title: "Benachrichtigungen",
    actions: [
      ["Alert-Regeln / Verlauf / Kanäle", "Wechselt den angezeigten Bereich."],
      ["Neue Regel", "Öffnet das Formular für eine Alert-Regel."],
      ["Erstellen", "Speichert die neue Alert-Regel."],
      ["Start / Stopp", "Aktiviert oder deaktiviert eine Regel."],
      ["Löschen", "Öffnet die Sicherheitsabfrage für eine Regel."],
      ["Regel löschen", "Löscht die Alert-Regel dauerhaft."],
      ["Kanal erstellen", "Fügt den ausgewählten Benachrichtigungskanal hinzu."],
      ["Abbrechen", "Schließt das Formular ohne Änderung."],
    ],
  },
  traces: {
    title: "Prozessdaten",
    actions: [
      ["Key Data Point", "Filtert nach dem technischen Datenpunkt."],
      ["Min / Max Value", "Begrenzt die angezeigten Messwerte."],
      ["Filters zurücksetzen", "Entfernt die Wertefilter."],
      ["Kategoriefilter", "Zeigt nur Daten der gewählten Kategorie."],
    ],
  },
  carriers: {
    title: "Werkstückträger",
    actions: [
      ["Aktualisieren", "Lädt Carrier, Aufträge, Routen und Bestand neu."],
      ["Carrier-Nummer", "Legt die Nummer eines neuen Werkstückträgers fest."],
      ["Anlegen", "Erstellt einen neuen Werkstückträger."],
    ],
  },
  shopfloor: {
    title: "Shopfloor Gateway",
    actions: [
      ["Starten", "Sendet den Startbefehl an die Maschine."],
      ["Pause", "Pausiert den laufenden Maschinenprozess."],
      ["Reset", "Setzt den Maschinenzustand zurück."],
      ["Stop", "Stoppt den Maschinenprozess."],
      ["Technische Rohtelemetrie", "Öffnet oder schließt die technischen Live-Daten."],
    ],
  },
  users: {
    title: "Benutzerverwaltung",
    actions: [
      ["Rolle", "Bestimmt die Zugriffsrechte des neuen Benutzers."],
      ["Benutzer erstellen", "Legt ein neues Benutzerkonto an."],
    ],
  },
};

export default function PageInfo({ page }) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef(null);
  const help = pageHelp[page];

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!help) return null;

  return (
    <>
      <button
        type="button"
        className="page-info-button"
        aria-label={`Hilfe zu ${help.title} öffnen`}
        title="Seitenhilfe"
        onClick={() => setOpen(true)}
      >
        !
      </button>
      {open && (
        <div className="page-info-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="page-info-dialog" role="dialog" aria-modal="true" aria-labelledby={`page-info-${page}`}>
            <header>
              <div>
                <span>Seitenhilfe</span>
                <h2 id={`page-info-${page}`}>{help.title}</h2>
              </div>
              <button ref={closeButtonRef} type="button" aria-label="Seitenhilfe schließen" onClick={() => setOpen(false)}>×</button>
            </header>
            <div className="page-info-content">
              <p>Hier steht kurz erklärt, was die Bedienelemente auf dieser Seite machen.</p>
              <h3>Auf dieser Seite</h3>
              <dl>
                {help.actions.map(([label, description]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{description}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
