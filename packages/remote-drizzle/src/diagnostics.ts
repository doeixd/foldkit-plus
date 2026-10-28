/**
 * What a Drizzle-backed Remote server answers past without telling the caller
 * why: a statement the driver failed, answered with a fixed message, since the
 * driver's error carries the SQL and its parameters; and an Entity's rules no
 * CHECK can hold, which only the server's declared writes do. Each is reported
 * through `Diagnostics.report`.
 */
import type { Diagnostic } from 'foldkit-remote'

const source = 'foldkit-remote-drizzle'

/** The driver failed a statement; the caller was answered `failed` and nothing of why. */
export interface StatementFailed extends Diagnostic {
  readonly _tag: 'StatementFailed'
  /** What the caller was told: `Database write failed`. */
  readonly failed: string
  /** The driver's error, which may carry the SQL and its parameters. */
  readonly error: unknown
}

/**
 * Rules of the bound Entity no CHECK can hold (`checkConstraints(...).serverOnly`),
 * reported on the binding's first write: the server's declared writes hold them,
 * and a write past the server (raw SQL, another service) is not refused.
 */
export interface ServerOnlyRules extends Diagnostic {
  readonly _tag: 'ServerOnlyRules'
  readonly entity: string
  readonly table: string
  /** One sentence per rule, naming its field or invariant. */
  readonly rules: ReadonlyArray<string>
}

/** Every diagnostic `foldkit-remote-drizzle` reports. */
export type RemoteDrizzleDiagnostic = StatementFailed | ServerOnlyRules

export const statementFailed = (failed: string, error: unknown): StatementFailed => ({
  _tag: 'StatementFailed',
  source,
  level: 'error',
  message: `${failed}, and the caller was told nothing more: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
  failed,
  error,
})

export const serverOnlyRules = (
  entity: string,
  table: string,
  rules: ReadonlyArray<string>,
): ServerOnlyRules => ({
  _tag: 'ServerOnlyRules',
  source,
  level: 'warning',
  message: `${entity}'s table "${table}" holds no CHECK for ${rules.length === 1 ? 'this rule' : 'these rules'}, so only the server's declared writes do, and a write past the server is not refused: ${rules.join('; ')}`,
  entity,
  table,
  rules,
})
