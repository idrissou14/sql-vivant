import { useMemo, useState } from 'react'
import { SqlEditor } from './components/SqlEditor'
import { DatabaseView } from './components/DatabaseView'
import { createEngine } from './sql/engine'
import './App.css'

function App() {
  // Le moteur est l'unique source de vérité de la base.
  const engine = useMemo(() => createEngine(), [])
  const [database, setDatabase] = useState(() => engine.getDatabase())
  const [message, setMessage] = useState<{ text: string; ok: boolean }>()

  function handleRun(sql: string) {
    const result = engine.execute(sql)

    // TODO (slice verticale) : consommer result.effects et animer.
    // Pour le squelette, on rafraîchit la vue et on affiche le message.
    setDatabase({ ...engine.getDatabase() })
    setMessage({
      text: result.ok ? 'Requête exécutée.' : (result.error ?? 'Erreur inconnue.'),
      ok: result.ok,
    })
  }

  return (
    <div className="app">
      <h1 className="app-title">SQL Vivant</h1>
      <div className="split">
        <SqlEditor onRun={handleRun} message={message} />
        <DatabaseView database={database} />
      </div>
    </div>
  )
}

export default App
