import { SqlError } from './errors'
import { tokenize, type Token } from './tokenizer'
import type {
  CompareOp,
  CreateStatement,
  Expr,
  InsertStatement,
  SelectStatement,
  Statement,
} from './ast'
import type { Cell, ForeignKey } from './types'

const COMPARE_OPS = new Set(['=', '!=', '<>', '<', '>', '<=', '>='])

/** Vrai si le token est un mot (identifiant ou mot-clé) égal à `word`, insensible à la casse. */
function wordEquals(t: Token, word: string): boolean {
  return (t.type === 'identifier' || t.type === 'keyword') && t.value.toUpperCase() === word
}

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
    if (t.type === 'keyword' && t.value === 'INSERT') return this.parseInsert()

    const unsupported = ['UPDATE', 'DELETE', 'DROP']
    if (t.type === 'keyword' && unsupported.includes(t.value)) {
      throw new SqlError(
        `La commande ${t.value} n'est pas encore disponible. SELECT, CREATE et INSERT sont implémentés pour l'instant.`,
      )
    }
    throw new SqlError('Requête invalide : elle doit commencer par SELECT, CREATE ou INSERT.')
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
    const foreignKeys: ForeignKey[] = []
    if (this.peek().type === 'rparen') {
      throw new SqlError('Une table doit avoir au moins une colonne.')
    }
    this.parseTableItem(columns, foreignKeys)
    while (this.peek().type === 'comma') {
      this.next()
      this.parseTableItem(columns, foreignKeys)
    }

    if (this.peek().type !== 'rparen') throw new SqlError('Parenthèse fermante « ) » manquante.')
    this.next() // )

    const seen = new Set<string>()
    for (const c of columns) {
      if (seen.has(c)) throw new SqlError(`Colonne « ${c} » définie deux fois.`)
      seen.add(c)
    }

    return { type: 'create', table, columns, foreignKeys }
  }

  /** Un item de la liste : soit une contrainte de table, soit une définition de colonne. */
  private parseTableItem(columns: string[], fks: ForeignKey[]): void {
    const first = this.peek()
    const isConstraint = ['CONSTRAINT', 'FOREIGN', 'PRIMARY', 'UNIQUE', 'CHECK'].some((kw) =>
      wordEquals(first, kw),
    )
    if (isConstraint) this.parseTableConstraint(fks)
    else columns.push(this.parseColumnDef(fks))
  }

  /** Nom de colonne, avec un type SQL optionnel (ex. INT, TEXT) et une éventuelle FK inline. */
  private parseColumnDef(fks: ForeignKey[]): string {
    const name = this.expectIdentifier('un nom de colonne')
    // Ignore les tokens de type/contraintes inline jusqu'à la virgule ou « ) »,
    // mais capture une éventuelle clause REFERENCES (FK inline).
    let depth = 0
    while (true) {
      const t = this.peek()
      if (t.type === 'eof') break
      if (depth === 0 && (t.type === 'comma' || t.type === 'rparen')) break
      if (depth === 0 && wordEquals(t, 'REFERENCES')) {
        this.next() // REFERENCES
        const ref = this.parseReferenceTarget()
        fks.push({ column: name, refTable: ref.table, refColumn: ref.column })
        continue
      }
      if (t.type === 'lparen') depth++
      else if (t.type === 'rparen') depth--
      this.next()
    }
    return name
  }

  /** Contrainte de table. Seule FOREIGN KEY est exploitée ; PRIMARY/UNIQUE/CHECK sont ignorées. */
  private parseTableConstraint(fks: ForeignKey[]): void {
    // « CONSTRAINT [nom] » optionnel.
    if (wordEquals(this.peek(), 'CONSTRAINT')) {
      this.next()
      const t = this.peek()
      const isKind = ['FOREIGN', 'PRIMARY', 'UNIQUE', 'CHECK'].some((kw) => wordEquals(t, kw))
      if (!isKind) this.next() // saute le nom de la contrainte
    }

    const kind = this.peek()
    if (wordEquals(kind, 'FOREIGN')) {
      this.next() // FOREIGN
      if (!wordEquals(this.peek(), 'KEY')) throw new SqlError('Attendu FOREIGN KEY.')
      this.next() // KEY
      const localCols = this.parseColumnList()
      if (!wordEquals(this.peek(), 'REFERENCES')) {
        throw new SqlError('Attendu REFERENCES <table>(<colonne>) après FOREIGN KEY (...).')
      }
      this.next() // REFERENCES
      const refTable = this.expectIdentifier('le nom de la table référencée')
      const refCols = this.parseColumnList()
      if (localCols.length !== refCols.length) {
        throw new SqlError(
          'La clé étrangère doit référencer autant de colonnes qu\'elle en déclare.',
        )
      }
      localCols.forEach((column, k) => {
        fks.push({ column, refTable, refColumn: refCols[k] })
      })
    } else if (
      wordEquals(kind, 'PRIMARY') ||
      wordEquals(kind, 'UNIQUE') ||
      wordEquals(kind, 'CHECK')
    ) {
      this.skipItem() // pas encore exploité, on l'ignore proprement
    } else {
      throw new SqlError(`Contrainte de table « ${kind.value} » non reconnue.`)
    }
  }

  /** Référence « table(colonne) » après REFERENCES (FK inline). */
  private parseReferenceTarget(): { table: string; column: string } {
    const table = this.expectIdentifier('le nom de la table référencée après REFERENCES')
    const cols = this.parseColumnList()
    if (cols.length !== 1) {
      throw new SqlError('Une clé étrangère inline doit référencer une seule colonne.')
    }
    return { table, column: cols[0] }
  }

  /** Liste de colonnes entre parenthèses : « ( a, b, ... ) ». */
  private parseColumnList(): string[] {
    if (this.peek().type !== 'lparen') {
      throw new SqlError('Attendu « ( » suivi d\'une liste de colonnes.')
    }
    this.next() // (
    const cols = [this.expectIdentifier('un nom de colonne')]
    while (this.peek().type === 'comma') {
      this.next()
      cols.push(this.expectIdentifier('un nom de colonne'))
    }
    if (this.peek().type !== 'rparen') throw new SqlError('Parenthèse fermante « ) » manquante.')
    this.next() // )
    return cols
  }

  /** Saute l'item courant jusqu'à la virgule ou « ) » de même niveau (contraintes ignorées). */
  private skipItem(): void {
    let depth = 0
    while (true) {
      const t = this.peek()
      if (t.type === 'eof') break
      if (depth === 0 && (t.type === 'comma' || t.type === 'rparen')) break
      if (t.type === 'lparen') depth++
      else if (t.type === 'rparen') depth--
      this.next()
    }
  }

  private parseInsert(): InsertStatement {
    this.next() // INSERT
    if (!this.isKeyword('INTO')) throw new SqlError('Attendu INSERT INTO <table> VALUES (...).')
    this.next() // INTO
    const table = this.expectIdentifier('un nom de table')

    let columns: string[] | undefined
    if (this.peek().type === 'lparen') columns = this.parseColumnList()

    if (!this.isKeyword('VALUES')) {
      throw new SqlError('Attendu VALUES (...) après le nom de la table.')
    }
    this.next() // VALUES

    const rows: Cell[][] = [this.parseValueTuple()]
    while (this.peek().type === 'comma') {
      this.next()
      rows.push(this.parseValueTuple())
    }

    return { type: 'insert', table, columns, rows }
  }

  /** Liste de valeurs entre parenthèses : « ( 1, 'x', NULL ) ». */
  private parseValueTuple(): Cell[] {
    if (this.peek().type !== 'lparen') {
      throw new SqlError('Attendu « ( » pour une liste de valeurs.')
    }
    this.next() // (
    const vals = [this.parseValue()]
    while (this.peek().type === 'comma') {
      this.next()
      vals.push(this.parseValue())
    }
    if (this.peek().type !== 'rparen') throw new SqlError('Parenthèse fermante « ) » manquante.')
    this.next() // )
    return vals
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
