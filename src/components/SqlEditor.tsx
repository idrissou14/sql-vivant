import { useState } from 'react'

interface SqlEditorProps {
  /** Appelé quand l'utilisateur exécute (Ctrl/⌘+Entrée ou le bouton). */
  onRun: (sql: string) => void
  /** Message courant (erreur en rouge, info sinon). */
  message?: { text: string; ok: boolean }
}

const PLACEHOLDER = `-- Écris ta requête SQL ici
-- Ctrl+Entrée pour exécuter
SELECT * FROM chats;`

export function SqlEditor({ onRun, message }: SqlEditorProps) {
  const [sql, setSql] = useState('')

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      onRun(sql)
    }
  }

  return (
    <div className="editor">
      <header className="pane-header">
        <h2>Éditeur SQL</h2>
        <span className="hint">Ctrl+Entrée pour exécuter</span>
      </header>

      <textarea
        className="editor-area"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        autoFocus
      />

      <footer className="editor-footer">
        {message && (
          <p className={message.ok ? 'msg msg-ok' : 'msg msg-error'}>
            {message.text}
          </p>
        )}
        <button type="button" className="run-btn" onClick={() => onRun(sql)}>
          Exécuter ▶
        </button>
      </footer>
    </div>
  )
}
