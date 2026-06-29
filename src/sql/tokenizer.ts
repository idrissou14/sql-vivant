import { SqlError } from './errors'

export type TokenType =
  | 'keyword'
  | 'identifier'
  | 'number'
  | 'string'
  | 'operator'
  | 'star'
  | 'comma'
  | 'lparen'
  | 'rparen'
  | 'semicolon'
  | 'eof'

export interface Token {
  type: TokenType
  value: string
  pos: number
}

const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'LIKE', 'ORDER', 'BY',
  'ASC', 'DESC', 'IS', 'NULL',
  // Réservés pour les prochains verbes (rejetés proprement par le parseur) :
  'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'DROP', 'TABLE',
])

const isDigit = (c: string) => c >= '0' && c <= '9'
const isIdentStart = (c: string) => /[A-Za-z_]/.test(c)
const isIdentChar = (c: string) => /[A-Za-z0-9_]/.test(c)

/** Découpe une requête SQL en tokens. Ignore espaces et commentaires `-- ...`. */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = input.length

  while (i < n) {
    const c = input[i]

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }

    // Commentaire jusqu'à la fin de la ligne.
    if (c === '-' && input[i + 1] === '-') {
      while (i < n && input[i] !== '\n') i++
      continue
    }

    const start = i

    // Chaîne entre apostrophes, avec '' comme apostrophe échappée.
    if (c === "'") {
      i++
      let str = ''
      while (i < n) {
        if (input[i] === "'") {
          if (input[i + 1] === "'") {
            str += "'"
            i += 2
            continue
          }
          break
        }
        str += input[i]
        i++
      }
      if (i >= n) throw new SqlError('Chaîne non terminée : il manque une apostrophe fermante.')
      i++ // apostrophe fermante
      tokens.push({ type: 'string', value: str, pos: start })
      continue
    }

    if (isDigit(c)) {
      let num = ''
      while (i < n && (isDigit(input[i]) || input[i] === '.')) {
        num += input[i]
        i++
      }
      tokens.push({ type: 'number', value: num, pos: start })
      continue
    }

    if (isIdentStart(c)) {
      let id = ''
      while (i < n && isIdentChar(input[i])) {
        id += input[i]
        i++
      }
      const up = id.toUpperCase()
      tokens.push({
        type: KEYWORDS.has(up) ? 'keyword' : 'identifier',
        value: KEYWORDS.has(up) ? up : id,
        pos: start,
      })
      continue
    }

    switch (c) {
      case '*': tokens.push({ type: 'star', value: '*', pos: start }); i++; continue
      case ',': tokens.push({ type: 'comma', value: ',', pos: start }); i++; continue
      case '(': tokens.push({ type: 'lparen', value: '(', pos: start }); i++; continue
      case ')': tokens.push({ type: 'rparen', value: ')', pos: start }); i++; continue
      case ';': tokens.push({ type: 'semicolon', value: ';', pos: start }); i++; continue
      case '=': tokens.push({ type: 'operator', value: '=', pos: start }); i++; continue
      case '-': tokens.push({ type: 'operator', value: '-', pos: start }); i++; continue
    }

    if (c === '<') {
      if (input[i + 1] === '=') { tokens.push({ type: 'operator', value: '<=', pos: start }); i += 2; continue }
      if (input[i + 1] === '>') { tokens.push({ type: 'operator', value: '<>', pos: start }); i += 2; continue }
      tokens.push({ type: 'operator', value: '<', pos: start }); i++; continue
    }
    if (c === '>') {
      if (input[i + 1] === '=') { tokens.push({ type: 'operator', value: '>=', pos: start }); i += 2; continue }
      tokens.push({ type: 'operator', value: '>', pos: start }); i++; continue
    }
    if (c === '!') {
      if (input[i + 1] === '=') { tokens.push({ type: 'operator', value: '!=', pos: start }); i += 2; continue }
      throw new SqlError(`Caractère inattendu « ! » (utilise « != » pour « différent de »).`)
    }

    throw new SqlError(`Caractère inattendu « ${c} ».`)
  }

  tokens.push({ type: 'eof', value: '', pos: n })
  return tokens
}
