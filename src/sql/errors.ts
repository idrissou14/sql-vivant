/** Erreur de requête, toujours avec un message en français destiné à l'utilisateur. */
export class SqlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SqlError'
  }
}
