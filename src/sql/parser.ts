import { SqlError } from './errors'
import { tokenize, type Token } from './tokenizer'
import type { CompareOp, CreateStatement, Expr, SelectStatement, Statement } from './ast'
import type { Cell } from './types'

const COMPARE_OPS = new Set(['=', '!=', '<>', '<', '>', '<=', '>='])

/** Analyse une requête SQL en un AST. Lève une SqlError (message FR) si invalide. */
export function parse(sql: string): Statement {
  const parser = new Parser(tokenize(sql))
  const stmt = parser.parseStatement()
  parser.expectEnd()
  return stmt
}

class Parser {
  private i = 0
  private readonly tokens: Token[]

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token {
    return this.tokens[this.i]
  }
  private next(): Token {
    return this.tokens[this.i++]
  }
  private isKeyword(kw: string): boolean {
    const t = this.peek()
    return t.type === 'keyword' && t.value === kw
  }

  parseStatement(): Statement {
    const t = this.peek()
    if (t.type === 'keyword' && t.value === 'SELECT') return this.parseSelect()
    if (t.type === 'keyword' && t.value === 'CREATE') return this.parseCreate()

    const unsupported = ['INSERT', 'UPDATE', 'DELETE', 'DROP']
    if (t.type === 'keyword' && unsupported.includes(t.value)) {
      throw new SqlError(
        `La commande ${t.value} n'est pas encore disponible. SELECT et CREATE sont implémentés pour l'instant.`,
      )
    }
    throw new SqlError('Requête invalide : elle doit commencer par SELECT ou CREATE.')
  }

  private parseCreate(): CreateStatement {
    this.next() // CREATE
    if (!this.isKeyword('TABLE')) throw new SqlError('Attendu CREATE TABLE <nom> (...).')
    this.next() // TABLE
    const table = this.expectIdentifier('un nom de table')

    if (this.peek().type !== 'lparen') {
      throw new SqlError('Attendu « ( » pour la liste des colonnes après le nom de la table.')
    }
    this.next() // (

    const columns: string[] = []
    if (this.peek().type === 'rparen') {
      throw new SqlError('Une table doit avoir au moins une colonne.')
    }
    columns.push(this.parseColumnDef())
    while (this.peek().type === 'comma') {
      this.next()
      columns.push(this.parseColumnDef())
    }

    if (this.peek().type !== 'rparen') throw new SqlError('Parenthèse fermante « ) » manquante.')
    this.next() // )

    const seen = new Set<string>()
    for (const c of columns) {
      if (seen.has(c)) throw new SqlError(`Colonne « ${c} » définie deux fois.`)
      seen.add(c)
    }

    return { type: 'create', table, columns }
  }

  /** Nom de colonne, avec un type SQL optionnel (ex. INT, TEXT, VARCHAR(255)) ignoré pour l'instant. */
  private parseColumnDef(): string {
    const name = this.expectIdentifier('un nom de colonne')
    // Ignore d'éventuels tokens de type jusqu'à la virgule ou la parenthèse fermante.
    let depth = 0
    while (true) {
      const t = this.peek()
      if (t.type === 'eof') break
      if (depth === 0 && (t.type === 'comma' || t.type === 'rparen')) break
      if (t.type === 'lparen') depth++
      else if (t.type === 'rparen') depth--
      this.next()
    }
    return name
  }

  expectEnd(): void {
    if (this.peek().type === 'semicolon') this.next()
    const t = this.peek()
    if (t.type !== 'eof') {
      throw new SqlError(
        `Texte inattendu après la requête : « ${t.value} ». Une seule requête à la fois.`,
      )
    }
  }

  private parseSelect(): SelectStatement {
    this.next() // SELECT

    let columns: '*' | string[]
    if (this.peek().type === 'star') {
      this.next()
      columns = '*'
    } else {
      columns = [this.expectIdentifier('un nom de colonne')]
      while (this.peek().type === 'comma') {
        this.next()
        columns.push(this.expectIdentifier('un nom de colonne'))
      }
    }

    if (!this.isKeyword('FROM')) {
      throw new SqlError('Il manque FROM <table> dans le SELECT.')
    }
    this.next() // FROM
    const table = this.expectIdentifier('un nom de table')

    let where: Expr | undefined
    if (this.isKeyword('WHERE')) {
      this.next()
      where = this.parseExpr()
    }

    let orderBy: SelectStatement['orderBy']
    if (this.isKeyword('ORDER')) {
      this.next()
      if (!this.isKeyword('BY')) throw new SqlError('ORDER doit être suivi de BY.')
      this.next()
      const column = this.expectIdentifier('un nom de colonne après ORDER BY')
      let dir: 'asc' | 'desc' = 'asc'
      if (this.isKeyword('ASC') || this.isKeyword('DESC')) {
        dir = this.next().value === 'DESC' ? 'desc' : 'asc'
      }
      orderBy = { column, dir }
    }

    return { type: 'select', columns, table, where, orderBy }
  }

  // --- Clause WHERE (précédence : OR < AND < NOT < prédicat) ---

  private parseExpr(): Expr {
    return this.parseOr()
  }

  private parseOr(): Expr {
    let left = this.parseAnd()
    while (this.isKeyword('OR')) {
      this.next()
      left = { kind: 'or', left, right: this.parseAnd() }
    }
    return left
  }

  private parseAnd(): Expr {
    let left = this.parseNot()
    while (this.isKeyword('AND')) {
      this.next()
      left = { kind: 'and', left, right: this.parseNot() }
    }
    return left
  }

  private parseNot(): Expr {
    if (this.isKeyword('NOT')) {
      this.next()
      return { kind: 'not', expr: this.parseNot() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Expr {
    if (this.peek().type === 'lparen') {
      this.next()
      const e = this.parseExpr()
      if (this.peek().type !== 'rparen') throw new SqlError('Parenthèse fermante « ) » manquante.')
      this.next()
      return e
    }
    return this.parsePredicate()
  }

  private parsePredicate(): Expr {
    const column = this.expectIdentifier('un nom de colonne dans la condition')

    if (this.isKeyword('IS')) {
      this.next()
      let negate = false
      if (this.isKeyword('NOT')) {
        this.next()
        negate = true
      }
      if (!this.isKeyword('NULL')) throw new SqlError('Après IS, attendu NULL (ou NOT NULL).')
      this.next()
      return { kind: 'isNull', column, negate }
    }

    if (this.isKeyword('LIKE')) {
      this.next()
      return { kind: 'like', column, pattern: this.expectString('un motif après LIKE'), negate: false }
    }

    if (this.isKeyword('NOT')) {
      this.next()
      if (!this.isKeyword('LIKE')) throw new SqlError('Après NOT, attendu LIKE.')
      this.next()
      return { kind: 'like', column, pattern: this.expectString('un motif après NOT LIKE'), negate: true }
    }

    const t = this.peek()
    if (t.type === 'operator' && COMPARE_OPS.has(t.value)) {
      this.next()
      const op = (t.value === '<>' ? '!=' : t.value) as CompareOp
      return { kind: 'compare', column, op, value: this.parseValue() }
    }

    throw new SqlError(`Condition invalide près de « ${column} ».`)
  }

  private parseValue(): Cell {
    const t = this.peek()
    if (t.type === 'operator' && t.value === '-') {
      this.next()
      const num = this.peek()
      if (num.type !== 'number') throw new SqlError('Nombre attendu après le signe « - ».')
      this.next()
      return -Number(num.value)
    }
    if (t.type === 'number') {
      this.next()
      return Number(t.value)
    }
    if (t.type === 'string') {
      this.next()
      return t.value
    }
    if (this.isKeyword('NULL')) {
      this.next()
      return null
    }
    throw new SqlError('Valeur attendue (nombre, texte entre apostrophes ou NULL).')
  }

  private expectIdentifier(what: string): string {
    const t = this.peek()
    if (t.type !== 'identifier') throw new SqlError(`Attendu ${what}.`)
    this.next()
    return t.value
  }

  private expectString(what: string): string {
    const t = this.peek()
    if (t.type !== 'string') throw new SqlError(`Attendu ${what} (entre apostrophes).`)
    this.next()
    return t.value
  }
}
