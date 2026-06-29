import type { Database, ExecResult, Row, SqlEngine, Cell } from './types'
import type { Expr, SelectStatement } from './ast'
import { parse } from './parser'
import { SqlError } from './errors'

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
          { id: 'r4', cells: { id: 4, nom: 'Mimi', age: 8 } },
        ],
      },
    ],
  }
}

export function createEngine(): SqlEngine {
  const db = seedDatabase()

  return {
    getDatabase: () => db,
    execute: (sql: string): ExecResult => {
      try {
        if (sql.trim() === '') throw new SqlError('Requête vide.')
        const stmt = parse(sql)
        // Seul SELECT existe dans l'AST pour l'instant.
        return executeSelect(stmt, db)
      } catch (e) {
        if (e instanceof SqlError) return { ok: false, effects: [], error: e.message }
        throw e
      }
    },
  }
}

function executeSelect(stmt: SelectStatement, db: Database): ExecResult {
  const table = db.tables.find((t) => t.name === stmt.table)
  if (!table) throw new SqlError(`La table « ${stmt.table} » n'existe pas.`)

  const columnNames = table.columns.map((c) => c.name)

  // Valide les colonnes demandées.
  const projection = stmt.columns === '*' ? columnNames : stmt.columns
  for (const col of projection) {
    if (!columnNames.includes(col)) {
      throw new SqlError(`La colonne « ${col} » n'existe pas dans « ${table.name} ».`)
    }
  }
  // Valide les colonnes utilisées dans WHERE / ORDER BY.
  if (stmt.where) assertColumnsExist(stmt.where, columnNames, table.name)
  if (stmt.orderBy && !columnNames.includes(stmt.orderBy.column)) {
    throw new SqlError(`La colonne « ${stmt.orderBy.column} » (ORDER BY) n'existe pas dans « ${table.name} ».`)
  }

  // Filtre.
  let matched: Row[] = stmt.where
    ? table.rows.filter((row) => evaluate(stmt.where!, row))
    : [...table.rows]

  // Tri.
  if (stmt.orderBy) {
    const { column, dir } = stmt.orderBy
    const sign = dir === 'desc' ? -1 : 1
    matched = [...matched].sort((a, b) => sign * compareCells(a.cells[column], b.cells[column]))
  }

  const resultRows: Row[] = matched.map((row) => ({
    id: row.id,
    cells: Object.fromEntries(projection.map((c) => [c, row.cells[c] ?? null])),
  }))

  return {
    ok: true,
    effects: [{ kind: 'select', table: table.name, rowIds: matched.map((r) => r.id) }],
    resultRows,
  }
}

// --- Évaluation des conditions WHERE ---

function evaluate(expr: Expr, row: Row): boolean {
  switch (expr.kind) {
    case 'or':
      return evaluate(expr.left, row) || evaluate(expr.right, row)
    case 'and':
      return evaluate(expr.left, row) && evaluate(expr.right, row)
    case 'not':
      return !evaluate(expr.expr, row)
    case 'isNull': {
      const isNull = row.cells[expr.column] == null
      return expr.negate ? !isNull : isNull
    }
    case 'like': {
      const cell = row.cells[expr.column]
      if (cell == null) return expr.negate // NULL ne "matche" jamais
      const matches = likeToRegex(expr.pattern).test(String(cell))
      return expr.negate ? !matches : matches
    }
    case 'compare': {
      const cell = row.cells[expr.column]
      return compare(cell, expr.op, expr.value)
    }
  }
}

function compare(cell: Cell, op: string, value: Cell): boolean {
  if (op === '=') return looseEqual(cell, value)
  if (op === '!=') return !looseEqual(cell, value)
  // Pour <, >, <=, >= : NULL n'est jamais comparable.
  if (cell == null || value == null) return false
  const c = compareCells(cell, value)
  switch (op) {
    case '<': return c < 0
    case '>': return c > 0
    case '<=': return c <= 0
    case '>=': return c >= 0
    default: return false
  }
}

function looseEqual(a: Cell, b: Cell): boolean {
  if (a == null || b == null) return a == null && b == null
  if (typeof a === 'number' && typeof b === 'number') return a === b
  return String(a) === String(b)
}

/** -1, 0 ou 1. Numérique si les deux sont des nombres, sinon comparaison de texte. */
function compareCells(a: Cell, b: Cell): number {
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0
  return String(a).localeCompare(String(b))
}

/** Convertit un motif LIKE (% = n'importe quoi, _ = un caractère) en RegExp. Insensible à la casse. */
function likeToRegex(pattern: string): RegExp {
  let re = '^'
  for (const ch of pattern) {
    if (ch === '%') re += '.*'
    else if (ch === '_') re += '.'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  re += '$'
  return new RegExp(re, 'i')
}

function assertColumnsExist(expr: Expr, columns: string[], tableName: string): void {
  switch (expr.kind) {
    case 'or':
    case 'and':
      assertColumnsExist(expr.left, columns, tableName)
      assertColumnsExist(expr.right, columns, tableName)
      return
    case 'not':
      assertColumnsExist(expr.expr, columns, tableName)
      return
    case 'isNull':
    case 'like':
    case 'compare':
      if (!columns.includes(expr.column)) {
        throw new SqlError(`La colonne « ${expr.column} » n'existe pas dans « ${tableName} ».`)
      }
  }
}
