import type { Cell } from './types'

export interface SelectStatement {
  type: 'select'
  columns: '*' | string[]
  table: string
  where?: Expr
  orderBy?: { column: string; dir: 'asc' | 'desc' }
}

export interface CreateStatement {
  type: 'create'
  table: string
  columns: string[]
}

export type Statement = SelectStatement | CreateStatement

/** Expression booléenne d'une clause WHERE. */
export type Expr =
  | { kind: 'or'; left: Expr; right: Expr }
  | { kind: 'and'; left: Expr; right: Expr }
  | { kind: 'not'; expr: Expr }
  | { kind: 'compare'; column: string; op: CompareOp; value: Cell }
  | { kind: 'like'; column: string; pattern: string; negate: boolean }
  | { kind: 'isNull'; column: string; negate: boolean }

export type CompareOp = '=' | '!=' | '<' | '>' | '<=' | '>='
