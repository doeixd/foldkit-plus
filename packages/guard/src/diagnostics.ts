/**
 * What a guarded server meets and answers past: a computed value an operator
 * refused, answered with a fixed message, and writes `GuardServer.validate`
 * finds unpinned. Each is reported through `Diagnostics.report`.
 */
import type { Diagnostic } from 'foldkit-remote'

const source = 'foldkit-guard'

/**
 * An operator refused to work out a value a guarded write computes (text
 * holding NUL, an implementation that throws). The write was refused with a
 * fixed message, since the operator's own may say anything.
 */
export interface ComputeRefused extends Diagnostic {
  readonly _tag: 'ComputeRefused'
  readonly entity: string
  /** The operator's own refusal. */
  readonly error: Error
}

/**
 * Writes through a `GuardServer.writer` given no revision, where a change can
 * come between the check and the write, which is then not seen.
 */
export interface UnpinnedWrites extends Diagnostic {
  readonly _tag: 'UnpinnedWrites'
  readonly mutations: ReadonlyArray<string>
}

/** Every diagnostic `foldkit-guard` reports. */
export type GuardDiagnostic = ComputeRefused | UnpinnedWrites

export const computeRefused = (entity: string, error: Error): ComputeRefused => ({
  _tag: 'ComputeRefused',
  source,
  level: 'error',
  message: `${entity}'s write was refused: a value it computes could not be worked out (${error.message})`,
  entity,
  error,
})

export const unpinnedWrites = (mutations: ReadonlyArray<string>): UnpinnedWrites => ({
  _tag: 'UnpinnedWrites',
  source,
  level: 'warning',
  message: `GuardServer.validate: ${mutations.join(', ')} ${mutations.length === 1 ? 'writes' : 'write'} through a GuardServer.writer with no revision, so a change between its check and its write is not seen; pass { revision }`,
  mutations,
})
