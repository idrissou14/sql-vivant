import { useMemo, useState } from 'react'
import { SqlEditor } from './components/SqlEditor'
import { DatabaseView, type Highlight } from './components/DatabaseView'
import { createEngine } from './sql/engine'
import './App.css'

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

    // On consomme les effets : ici, l'effet SELECT pilote le surlignage bleu.
    const select = result.effects.find((e) => e.kind === 'select')
    if (select && select.kind === 'select') {
      setHighlight({
        table: select.table,
        rowIds: select.rowIds,
        kind: 'select',
        nonce: Date.now(),
      })
    } else {
      setHighlight(undefined)
    }

    const n = result.resultRows?.length ?? 0
    setMessage({
      text: `${n} ligne${n > 1 ? 's' : ''} sélectionnée${n > 1 ? 's' : ''}.`,
      ok: true,
    })
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
