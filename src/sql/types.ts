// Contrat partagé entre le moteur SQL et l'UI.
// Règle d'or : le moteur ne touche JAMAIS au DOM. Il retourne des Effect[].
// L'UI consomme ces Effect[] et anime.

export type Verb = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP'

export type Cell = string | number | null

/** Une ligne possède un id stable (indépendant des colonnes) pour pouvoir l'animer. */
export interface Row {
  id: string
  cells: Record<string, Cell>
}

export interface Column {
  name: string
}

/** Clé étrangère : `column` (locale) référence `refTable(refColumn)`. */
export interface ForeignKey {
  column: string
  refTable: string
  refColumn: string
}

export interface Table {
  name: string
  columns: Column[]
  rows: Row[]
  foreignKeys?: ForeignKey[]
}

export interface Database {
  tables: Table[]
}

// --- Effets par verbe (chacun a SA couleur, gérée côté UI) ---
// SELECT → bleu, INSERT → vert, UPDATE → ambre, DELETE → rouge, CREATE → violet.
export type Effect =
  | { kind: 'select'; table: string; rowIds: string[]; columns: string[] }
  | { kind: 'insert'; table: string; rowId: string }
  | { kind: 'update'; table: string; rowId: string; columns: string[] }
  | { kind: 'delete'; table: string; rowIds: string[] }
  | { kind: 'create'; table: string }
  | { kind: 'drop'; table: string }

export type EffectKind = Effect['kind']

/** Résultat d'une exécution. `error` est toujours un message en français. */
export interface ExecResult {
  ok: boolean
  effects: Effect[]
  error?: string
  /** Lignes renvoyées par un SELECT, pour affichage éventuel. */
  resultRows?: Row[]
}

/**
 * Interface que tout moteur SQL doit respecter.
 * L'UI ne dépend QUE de cette interface, jamais de l'implémentation.
 */
export interface SqlEngine {
  /** État courant de la base (lecture seule pour l'UI). */
  getDatabase(): Database
  /** Exécute une requête, mute l'état interne, et retourne les effets à animer. */
  execute(sql: string): ExecResult
}
