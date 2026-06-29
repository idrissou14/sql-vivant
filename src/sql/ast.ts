import type { Cell } from './types'

export interface SelectStatement {
  type: 'select'
  columns: '*' | string[]
  table: string
  where?: Expr
  orderBy?: { column: string; dir: 'asc' | 'desc' }
}

// Pour l'instant seul SELECT est analysé. Les autres verbes viendront ici.
export type Statement = SelectStatement

/** Expression booléenne d'une clause WHERE. */
export type Expr =
  | { kind: 'or'; left: Expr; right: Expr }
  | { kind: 'and'; left: Expr; right: Expr }
  | { kind: 'not'; expr: Expr }
  | { kind: 'compare'; column: string; op: CompareOp; value: Cell }
  | { kind: 'like'; column: string; pattern: string; negate: boolean }
  | { kind: 'isNull'; column: string; negate: boolean }

export type CompareOp = '=' | '!=' | '<' | '>' | '<=' | '>='
