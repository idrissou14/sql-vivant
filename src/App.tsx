import { useMemo, useState } from 'react'
import { SqlEditor } from './components/SqlEditor'
import { DatabaseView, type Highlight } from './components/DatabaseView'
import { createEngine } from './sql/engine'
import type { Effect, ExecResult } from './sql/types'
import './App.css'

/** Traduit les effets du moteur en consigne d'animation pour la vue. */
function toHighlight(effects: Effect[]): Highlight | undefined {
  const first = effects[0]
  if (!first) return undefined
  const base = { table: first.table, kind: first.kind, nonce: Date.now() }
  if (first.kind === 'select') {
    return { ...base, rowIds: first.rowIds, columns: first.columns }
  }
  if (first.kind === 'insert') {
    // Surligne toutes les lignes insérées (une requête peut insérer plusieurs lignes).
    const rowIds = effects.flatMap((e) => (e.kind === 'insert' ? [e.rowId] : []))
    return { ...base, rowIds, columns: [] }
  }
  return { ...base, rowIds: [], columns: [] }
}

/** Message en français résumant ce qui s'est passé. */
function describe(effect: Effect | undefined, result: ExecResult): string {
  if (effect?.kind === 'create') return `Table « ${effect.table} » créée.`
  if (effect?.kind === 'insert') {
    const n = result.effects.length
    return `${n} ligne${n > 1 ? 's' : ''} insérée${n > 1 ? 's' : ''} dans « ${effect.table} ».`
  }
  const n = result.resultRows?.length ?? 0
  return `${n} ligne${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''}.`
}

function App() {
  // Le moteur est l'unique source de vérité de la base.
  const engine = useMemo(() => createEngine(), [])
  const [database, setDatabase] = useState(() => engine.getDatabase())
  const [highlight, setHighlight] = useState<Highlight>()
  const [message, setMessage] = useState<{ text: string; ok: boolean }>()

  function handleRun(sql: string) {
    const result = engine.execute(sql)
    setDatabase({ ...engine.getDatabase() })

    if (!result.ok) {
      setHighlight(undefined)
      setMessage({ text: result.error ?? 'Erreur inconnue.', ok: false })
      return
    }

    // On consomme le premier effet pour piloter l'animation (un effet par requête en v1).
    const effect = result.effects[0]
    setHighlight(toHighlight(result.effects))
    setMessage({ text: describe(effect, result), ok: true })
  }

  return (
    <div className="app">
      <h1 className="app-title">SQL Vivant</h1>
      <div className="split">
        <SqlEditor onRun={handleRun} message={message} />
        <DatabaseView database={database} highlight={highlight} />
      </div>
    </div>
  )
}

export default App
