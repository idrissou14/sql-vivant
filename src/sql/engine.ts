import type { Database, ExecResult, SqlEngine } from './types'

/**
 * Moteur PLACEHOLDER pour le squelette UI.
 * Il respecte l'interface SqlEngine mais n'exécute pas encore de SQL :
 * il sert uniquement à fournir une base d'exemple et à valider le câblage
 * UI ⇄ moteur. Le vrai parseur/exécuteur le remplacera à la prochaine étape.
 */

function seedDatabase(): Database {
  return {
    tables: [
      {
        name: 'chats',
        columns: [{ name: 'id' }, { name: 'nom' }, { name: 'age' }],
        rows: [
          { id: 'r1', cells: { id: 1, nom: 'Minou', age: 3 } },
          { id: 'r2', cells: { id: 2, nom: 'Felix', age: 5 } },
          { id: 'r3', cells: { id: 3, nom: 'Pacha', age: 2 } },
        ],
      },
    ],
  }
}

export function createEngine(): SqlEngine {
  const db = seedDatabase()

  return {
    getDatabase: () => db,
    execute: (_sql: string): ExecResult => ({
      ok: false,
      effects: [],
      error: 'Le moteur SQL sera branché à la prochaine étape. (Squelette UI uniquement.)',
    }),
  }
}
