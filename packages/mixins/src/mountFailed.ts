/**
 * What the resolver keeps going past, reported through `foldkit-surface`'s
 * channel: a Mount composed beside others that failed, which ends alone so the
 * rest go on. Not the `Diagnostics` namespace, whose definition conflicts are
 * thrown.
 */
import { Cause, Option } from 'effect'
import type { Diagnostic } from 'foldkit-surface'

/** A composed Mount that failed and ended alone; the slot's other Mounts go on. */
export interface MountFailed extends Diagnostic {
  readonly _tag: 'MountFailed'
  readonly mount: string
  /** The slot the Mount was composed on, when the resolver was given one. */
  readonly slot: Option.Option<string>
  readonly cause: Cause.Cause<unknown>
}

/** Every diagnostic `foldkit-mixins` reports. */
export type MixinsDiagnostic = MountFailed

export const mountFailed = (
  mount: string,
  slot: Option.Option<string>,
  cause: Cause.Cause<unknown>,
): MountFailed => ({
  _tag: 'MountFailed',
  source: 'foldkit-mixins',
  level: 'error',
  message: `the Mount ${mount}${Option.match(slot, { onNone: () => '', onSome: name => ` on slot ${name}` })} failed and ended; the slot's other Mounts go on\n${Cause.pretty(cause)}`,
  mount,
  slot,
  cause,
})
