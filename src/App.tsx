import { useMemo, useState } from 'react'
import { SqlEditor } from './components/SqlEditor'
import { DatabaseView, type Highlight } from './components/DatabaseView'
import { createEngine } from './sql/engine'
import type { Effect, ExecResult } from './sql/types'
import './App.css'

/** Traduit un effet du moteur en consigne d'animation pour la vue. */
function toHighlight(effect: Effect): Highlight {
  const base = { table: effect.table, kind: effect.kind, nonce: Date.now() }
  if (effect.kind === 'select') {
    return { ...base, rowIds: effect.rowIds, columns: effect.columns }
  }
  return { ...base, rowIds: [], columns: [] }
}

/** Message en français résumant ce qui s'est passé. */
function describe(effect: Effect | undefined, result: ExecResult): string {
  if (effect?.kind === 'create') return `Table « ${effect.table} » créée.`
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
    setHighlight(effect ? toHighlight(effect) : undefined)
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
