export default function DataTable({
  ariaLabel,
  columns,
  empty,
  getRowKey = (row) => row.id,
  renderCell,
  rowClassName,
  rows,
}) {
  if (rows.length === 0) return empty || null;

  return (
    <div className="ds-data-table" role="region" aria-label={ariaLabel} tabIndex="0">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.align === "end" ? "ds-data-table__cell--end" : undefined}
              >
                {column.hiddenLabel ? <span className="sr-only">{column.label}</span> : column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)} className={rowClassName?.(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.align === "end" ? "ds-data-table__cell--end" : undefined}
                >
                  {renderCell(row, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
