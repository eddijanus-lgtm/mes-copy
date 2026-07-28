import Button from "../components/Button.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const columns = [
  { key: "name", label: "Regel" },
  { key: "severity", label: "Schweregrad" },
  { key: "condition", label: "Bedingung" },
  { key: "actions", label: "Aktionen", hiddenLabel: true, align: "end" },
];

const rows = [
  { id: "1", name: "Temperaturgrenze", severity: "Kritisch", condition: "temperature >= 80" },
  { id: "2", name: "Druckabfall", severity: "Warnung", condition: "pressure < 4.2" },
];

export default {
  title: "Komponenten/Datentabelle",
  component: DataTable,
  parameters: { layout: "padded" },
};

export const MitAktionen = {
  render: () => (
    <div style={{ width: "min(880px, calc(100vw - 64px))" }}>
      <DataTable
        ariaLabel="Alert-Regeln"
        columns={columns}
        rows={rows}
        renderCell={(row, column) => {
          if (column.key === "severity") {
            return <StatusBadge tone={row.severity === "Kritisch" ? "danger" : "warning"}>{row.severity}</StatusBadge>;
          }
          if (column.key === "actions") return <Button size="sm" variant="ghost">Bearbeiten</Button>;
          return row[column.key];
        }}
      />
    </div>
  ),
};
