import type { Database, EffectKind } from '../sql/types'

/** Cellules à surligner suite à un effet. `nonce` force le rejeu de l'animation. */
export interface Highlight {
  table: string
  rowIds: string[]
  columns: string[]
  kind: EffectKind
  nonce: number
}

interface DatabaseViewProps {
  database: Database
  highlight?: Highlight
}

/** Légende des couleurs par verbe — référence visuelle du langage d'effets. */
const LEGEND: { kind: EffectKind; label: string }[] = [
  { kind: 'select', label: 'SELECT' },
  { kind: 'insert', label: 'INSERT' },
  { kind: 'update', label: 'UPDATE' },
  { kind: 'delete', label: 'DELETE' },
  { kind: 'create', label: 'CREATE' },
]

export function DatabaseView({ database, highlight }: DatabaseViewProps) {
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

        {database.tables.map((table) => {
          // Effet CREATE : la table entière apparaît en violet (re-montée via le nonce).
          const created = highlight?.kind === 'create' && highlight.table === table.name
          return (
          <section
            key={created ? `${table.name}-c${highlight!.nonce}` : table.name}
            className={created ? 'db-table effect-create table-appear' : 'db-table'}
            data-table={table.name}
          >
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
                {table.rows.map((row) => {
                  const rowLit =
                    highlight &&
                    highlight.table === table.name &&
                    highlight.rowIds.includes(row.id)
                  return (
                    <tr
                      // Re-monte la ligne surlignée à chaque exécution pour rejouer l'animation.
                      key={rowLit ? `${row.id}-h${highlight!.nonce}` : row.id}
                      data-row-id={row.id}
                    >
                      {table.columns.map((col) => {
                        // Seules les colonnes projetées par le SELECT sont surlignées.
                        const cellLit = rowLit && highlight!.columns.includes(col.name)
                        return (
                          <td
                            key={col.name}
                            data-col={col.name}
                            className={cellLit ? `cell-highlight effect-${highlight!.kind}` : undefined}
                          >
                            {row.cells[col.name] ?? <span className="null">NULL</span>}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
          )
        })}
      </div>
    </div>
  )
}
