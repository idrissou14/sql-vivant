import type { Database, EffectKind } from '../sql/types'

interface DatabaseViewProps {
  database: Database
}

/** Légende des couleurs par verbe — référence visuelle du langage d'effets. */
const LEGEND: { kind: EffectKind; label: string }[] = [
  { kind: 'select', label: 'SELECT' },
  { kind: 'insert', label: 'INSERT' },
  { kind: 'update', label: 'UPDATE' },
  { kind: 'delete', label: 'DELETE' },
  { kind: 'create', label: 'CREATE' },
]

export function DatabaseView({ database }: DatabaseViewProps) {
  return (
    <div className="db-view">
      <header className="pane-header">
        <h2>Base de données</h2>
        <ul className="legend">
          {LEGEND.map(({ kind, label }) => (
            <li key={kind} className={`legend-item effect-${kind}`}>
              <span className="legend-dot" />
              {label}
            </li>
          ))}
        </ul>
      </header>

      <div className="db-tables">
        {database.tables.length === 0 && (
          <p className="db-empty">Aucune table. Crée-en une avec CREATE TABLE.</p>
        )}

        {database.tables.map((table) => (
          <section key={table.name} className="db-table" data-table={table.name}>
            <h3 className="db-table-name">{table.name}</h3>
            <table>
              <thead>
                <tr>
                  {table.columns.map((col) => (
                    <th key={col.name}>{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.id} data-row-id={row.id}>
                    {table.columns.map((col) => (
                      <td key={col.name} data-col={col.name}>
                        {row.cells[col.name] ?? <span className="null">NULL</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  )
}
