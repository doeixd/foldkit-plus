import { Effect, Option } from 'effect'
import type { Machine } from '../machine.js'
import type { ProveOptions } from '../prove.js'
import * as Temporal from '../temporal.js'
import type * as Transition from '../transition.js'
import * as Verdict from '../verdict.js'
import type { Proof, SolverUnavailableError } from './solve.js'
import { proveTransition } from './transition.js'
import { witnessReport, type WitnessReport } from './witness.js'

export interface MachineProofEntry<Tag extends string = string> {
  readonly tag: Tag
  readonly status: 'proved' | 'refuted' | 'undecided'
  readonly pinned: boolean
  readonly pinBroken: boolean
  readonly allowedReason: Option.Option<string>
  readonly verdict: Proof
  /** The replayed counterexample of a refuted transition. */
  readonly witness: Option.Option<WitnessReport>
}

export interface MachineProofReport<Tag extends string = string> {
  readonly ok: boolean
  readonly entries: ReadonlyArray<MachineProofEntry<Tag>>
  /**
   * What no entry proves: each pair of transitions whose order matters, to be
   * shown by a walk (`Temporal.discharge`). They do not move `ok`; assert
   * `Temporal.undischarged(report.obligations, discharges)` is empty.
   */
  readonly obligations: ReadonlyArray<Temporal.WalkObligation<`${Tag}/${Tag}`, Tag>>
  /** Human-readable multi-line verification summary. */
  readonly format: () => string
}

const formatEntry = (entry: MachineProofEntry): string => {
  let pinLabel = ''
  if (entry.pinBroken) {
    pinLabel = ' [PIN BROKEN]'
  } else if (entry.pinned) {
    pinLabel = ' [pinned]'
  }
  if (entry.status === 'proved') {
    const evidence = Verdict.isTrue(entry.verdict)
      ? Option.getOrUndefined(entry.verdict.evidence)
      : undefined
    const solver = evidence?.solver
    const source = solver === undefined ? '' : ` [${solver.backend}, ${solver.encoding}]`
    return `PROVED (${evidence?.tier ?? 'proved'}) ${entry.tag}${pinLabel}${source}`
  }
  if (entry.status === 'undecided') {
    const reason = Verdict.isUnknown(entry.verdict) ? entry.verdict.reason : 'unknown'
    const allow = Option.match(entry.allowedReason, {
      onNone: () => 'disallowed',
      onSome: why => `allowed: ${why}`,
    })
    return `UNDECIDED (${allow}) ${entry.tag}${pinLabel}: ${reason}`
  }
  const lines = [`REFUTED ${entry.tag}${pinLabel}`]
  if (Option.isSome(entry.witness)) {
    const w = entry.witness.value
    lines.push(`  before:   ${JSON.stringify(w.before)}`)
    lines.push(`  input:    ${JSON.stringify(w.input)}`)
    lines.push(`  after:    ${JSON.stringify(w.after)}`)
    lines.push(`  violated: ${w.violated.join(' ; ')}`)
    lines.push(`  repro:    ${w.reproducer}`)
  }
  return lines.join('\n')
}

/**
 * Verify every transition in a `Machine` under strict/pinned CI discipline:
 *   - `strict` (default `true`): fails if any transition is `refuted`, or
 *     `undecided` without a non-empty reason in `allowUnknown`.
 *   - `pin`: transitions that must remain `proved` (degrading to `undecided`
 *     or `refuted` fails the report with `pinBroken: true`).
 */
export const machine = <State, Transitions extends Readonly<Record<string, unknown>>>(
  m: Machine<State, Transitions>,
  options?: ProveOptions & {
    readonly pin?: ReadonlyArray<keyof Transitions & string>
    readonly allowUnknown?: Readonly<Partial<Record<keyof Transitions & string, string>>>
    readonly strict?: boolean
  },
): Effect.Effect<MachineProofReport<keyof Transitions & string>, SolverUnavailableError> => {
  type Tag = keyof Transitions & string
  const tags = new Set(Object.keys(m.transitions))
  const pinnedSet = new Set<string>()
  if (options?.pin !== undefined) {
    for (const tag of options.pin) {
      if (!tags.has(tag)) {
        throw new Error(`[metakit] Prove.machine pin references unknown transition "${tag}"`)
      }
      pinnedSet.add(tag)
    }
  }
  const allowedMap = new Map<string, string>()
  if (options?.allowUnknown !== undefined) {
    for (const [tag, reason] of Object.entries(options.allowUnknown)) {
      if (reason === undefined) continue
      if (!tags.has(tag)) {
        throw new Error(
          `[metakit] Prove.machine allowUnknown references unknown transition "${tag}"`,
        )
      }
      if (pinnedSet.has(tag)) {
        throw new Error(
          `[metakit] Prove.machine transition "${tag}" cannot appear in both pin and allowUnknown`,
        )
      }
      if (reason.trim().length === 0) {
        throw new Error(
          `[metakit] Prove.machine allowUnknown for "${tag}" requires a non-empty reason`,
        )
      }
      allowedMap.set(tag, reason.trim())
    }
  }
  const strict = options?.strict ?? true

  return Effect.gen(function* () {
    const entries: Array<MachineProofEntry<Tag>> = []
    let ok = true
    for (const [rawTag, rawTr] of Object.entries(m.transitions)) {
      const tag = rawTag as Tag
      const tr = rawTr as Transition.Transition<State, unknown, unknown>
      const { verdict, replay } = yield* proveTransition(m.stateSchema, tr, options)
      const pinned = pinnedSet.has(tag)
      const allowedReason = Option.fromUndefinedOr(allowedMap.get(tag))
      const status: MachineProofEntry<Tag>['status'] = Verdict.match(verdict, {
        True: () => 'proved',
        False: () => 'refuted',
        Unknown: () => 'undecided',
      })
      const pinBroken = pinned && status !== 'proved'
      const witness = Option.map(replay, replayed => witnessReport(tag, m.stateSchema, replayed))

      if (
        pinBroken ||
        status === 'refuted' ||
        (strict && status === 'undecided' && Option.isNone(allowedReason))
      ) {
        ok = false
      }

      entries.push({ tag, status, pinned, pinBroken, allowedReason, verdict, witness })
    }
    const obligations = Temporal.obligations(m)
    return {
      ok,
      entries,
      obligations,
      format: () =>
        [
          ...entries.map(formatEntry),
          ...obligations.map(owed => `OBLIGATION (walk) ${owed.name}: ${owed.detail}`),
        ].join('\n'),
    }
  })
}
