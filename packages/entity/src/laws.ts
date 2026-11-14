/**
 * `Laws.check`: each transition against each invariant of its Entity, and
 * the arrows its writes make between the Entity's states, by enumeration over
 * finite fields and nothing cleverer. Pure: it reads declarations and returns
 * a report, which is data; `Laws.show` prints it.
 */
import { Data, Match, Option, type Schema } from 'effect'
import { Steps, finiteValues, steps, type Step } from './enumerate.js'
import { judgeAgainst, readsBefore, invariantsOf, type Invariant } from './invariant.js'
import { declaredOwner, Footprint } from './footprint.js'
import type { AnyEntity, EntityField } from './index.js'
import { kernelOperators } from './memoryTable.js'
import type { MemoryOperators } from './operators.js'
import { own } from './record.js'
import { inState, states, type AnyRefinement } from './refine.js'

type AnyField = EntityField<string, string, Schema.Constraint>
import { Write, writtenKeys, type AnyWrite } from './write.js'

/** A declared write, as `Mutation.write` returns one. */
export interface WriteEntry {
  readonly name: string
  readonly write: AnyWrite
}

/** A transition that is no declared write: what it touches is the author's word, or unknown. */
export interface FootprintEntry<E extends AnyEntity = AnyEntity> {
  readonly name: string
  readonly entity: E
  readonly footprint: Footprint
}

export type LawEntry = WriteEntry | FootprintEntry

/** Refuses, at the entry, a declared footprint over another Entity than the entry's. */
type Checked<X> = X extends {
  readonly entity: infer E extends AnyEntity
  readonly footprint: infer F
}
  ? F extends { readonly _tag: 'Declared'; readonly entity: infer Name }
    ? Name extends E['name']
      ? X
      : { readonly entity: E; readonly footprint: Footprint & { readonly entity: E['name'] } }
    : X
  : X

/** How one transition stands against one invariant. */
export type LawVerdict = Data.TaggedEnum<{
  /**
   * It cannot break it. `by`: it writes nothing the (state) invariant reads,
   * its author says so, every row it can start from was enumerated, or there
   * is no row to judge (a create and a transition, a delete).
   */
  Kept: {
    readonly by: 'disjointness' | 'declared' | 'enumeration' | 'create' | 'delete'
    readonly rows: number
  }
  /** These steps leave a row that breaks it. */
  Refused: { readonly steps: ReadonlyArray<Step> }
  /** Nothing here can say, and why. */
  Undecided: { readonly reason: string }
}>
export const LawVerdict = Data.taggedEnum<LawVerdict>()

/** One transition against one invariant of its Entity. */
export interface LawPair {
  readonly write: string
  readonly entity: string
  readonly invariant: string
  /** The members the invariant reads, before and after, by field key. */
  readonly reads: ReadonlyArray<string>
  readonly footprint: Footprint
  readonly verdict: LawVerdict
}

/** A write taking a row from one state of its Entity to another. */
export interface Arrow {
  readonly entity: string
  readonly write: string
  readonly from: string
  readonly to: string
}

/** What the check says of an arrow or a state. A report, never a fault. */
export type Finding = Data.TaggedEnum<{
  /** The arrow into the state its write declared it `becomes`. */
  Holds: Arrow
  /** A write with no such `becomes` makes the arrow. */
  Undeclared: Arrow
  /**
   * The write's `becomes` enumeration could not decide, kept where it commits
   * by its postcondition: every row it lands is in `to`, from whatever state.
   */
  Enforced: { readonly entity: string; readonly write: string; readonly to: string }
  /** Every row the arrow leaves breaks `invariant`, which refuses the write there. */
  Refused: Arrow & { readonly invariant: string }
  /** No write leaves a row in the state. */
  Unreached: { readonly entity: string; readonly state: string }
  /** No write starts from it. */
  Terminal: { readonly entity: string; readonly state: string }
}>
export const Finding = Data.taggedEnum<Finding>()

export interface LawReport {
  readonly pairs: ReadonlyArray<LawPair>
  readonly arrows: ReadonlyArray<Arrow>
  /** Each Entity's local states, by name. */
  readonly states: ReadonlyArray<{ readonly entity: string; readonly names: ReadonlyArray<string> }>
  readonly findings: ReadonlyArray<Finding>
}

const isWriteEntry = (entry: LawEntry): entry is WriteEntry => Object.hasOwn(entry, 'write')

const entityOf = (entry: LawEntry): AnyEntity =>
  isWriteEntry(entry) ? entry.write.input.entity : entry.entity

const footprintOf = (entry: LawEntry): Footprint => {
  if (isWriteEntry(entry)) return Write.footprint(entry.write)
  const owner = declaredOwner.get(entry.footprint)
  if (owner !== undefined && owner !== entry.entity.identity)
    throw new Error(
      `[foldkit-entity] Laws.check: ${entry.name} is over ${entry.entity.name}, but its footprint names ${owner.name}'s fields`,
    )
  return entry.footprint
}

/** Every member an invariant reads, before and after. */
const readOf = (held: Invariant): ReadonlyArray<string> => [
  ...new Set([...held.before, ...held.after]),
]

const disjoint = (writes: ReadonlyArray<string>, reads: ReadonlyArray<string>): boolean =>
  !writes.some(key => reads.includes(key))

/** One declared write against one invariant. */
const judgeWrite = (write: AnyWrite, held: Invariant, operators: MemoryOperators): LawVerdict => {
  if (write._tag === 'Delete') return LawVerdict.Kept({ by: 'delete', rows: 0 })
  const transition = readsBefore(held)
  if (write._tag === 'Insert' && transition) return LawVerdict.Kept({ by: 'create', rows: 0 })
  const reads = readOf(held)
  // Disjointness decides a state invariant only: a transition invariant can be broken by a write leaving it alone.
  if (write._tag === 'Update' && !transition && disjoint(writtenKeys(write), reads))
    return LawVerdict.Kept({ by: 'disjointness', rows: 0 })
  return Steps.$match(steps(write, reads, { operators }), {
    Undecided: ({ reason }) => LawVerdict.Undecided({ reason }),
    Steps: ({ steps: each }) => {
      const refused: Array<Step> = []
      // An insert's step has an empty row before, which a state invariant does not read.
      for (const step of each) {
        const undecided = Match.valueTags(judgeAgainst([held], step, operators), {
          Valid: () => Option.none<string>(),
          Invalid: () => {
            refused.push(step)
            return Option.none<string>()
          },
          Undecided: ({ fields, operators: unrun }) =>
            Option.some(
              unrun.length > 0
                ? `it calls ${unrun.join(', ')}, which the operator table does not run`
                : `the write may leave ${fields.join(', ')} unwritten`,
            ),
        })
        if (Option.isSome(undecided)) return LawVerdict.Undecided({ reason: undecided.value })
      }
      return refused.length > 0
        ? LawVerdict.Refused({ steps: refused })
        : LawVerdict.Kept({ by: 'enumeration', rows: each.length })
    },
  })
}

/** One transition known by its footprint alone against one invariant. */
const judgeFootprint = (footprint: Footprint, held: Invariant): LawVerdict =>
  Footprint.$match(footprint, {
    Unknown: () => LawVerdict.Undecided({ reason: 'what it writes is unknown, so every member' }),
    Derived: () => LawVerdict.Undecided({ reason: 'a derived footprint needs its write' }),
    Declared: ({ writes, by }) => {
      if (readsBefore(held))
        return LawVerdict.Undecided({
          reason: `a transition invariant is not kept by disjointness, and ${by}'s word is all there is`,
        })
      const touched = writes.filter(key => readOf(held).includes(key))
      return touched.length === 0
        ? LawVerdict.Kept({ by: 'declared', rows: 0 })
        : LawVerdict.Undecided({ reason: `${by} says it writes ${touched.join(', ')}` })
    },
  })

interface Arrows {
  readonly arrows: ReadonlyArray<Arrow>
  readonly findings: ReadonlyArray<Finding>
  readonly reached: ReadonlySet<string>
  readonly left: ReadonlySet<string>
  /** The states a write may move a row into or out of that enumeration could not decide. */
  readonly undecided: ReadonlySet<string>
}

/** The arrows one write makes between `local`, its Entity's local states. */
const arrowsOf = (
  name: string,
  write: AnyWrite,
  local: ReadonlyArray<AnyRefinement>,
  invariants: ReadonlyArray<Invariant>,
  operators: MemoryOperators,
): Arrows => {
  const entity = write.input.entity.name
  const none: Arrows = {
    arrows: [],
    findings: [],
    reached: new Set<string>(),
    left: new Set<string>(),
    undecided: new Set<string>(),
  }
  if (write._tag === 'Delete') return none
  const written = writtenKeys(write)
  const moved = local.filter(state => state.reads.some(key => written.includes(key)))
  // A state over a field that is not finite (`InStock`, over a number) is never enumerated,
  // so it costs the others nothing: a write moving a row into or out of it is undecided there.
  const fields = write.input.entity.fields as Readonly<Record<string, AnyField>>
  const finite = (state: AnyRefinement) =>
    state.reads.every(key =>
      Option.isSome(
        Option.flatMap(Option.fromUndefinedOr(own(fields, key)), field =>
          finiteValues(field.schema as unknown as Schema.Top),
        ),
      ),
    )
  const enumerable = local.filter(finite)
  const unenumerable = new Set(moved.filter(state => !finite(state)).map(state => state.name))
  if (!moved.some(finite)) return { ...none, undecided: unenumerable }
  const members = [...new Set(enumerable.flatMap(state => state.reads))]
  return Steps.$match(steps(write, members, { operators }), {
    Undecided: () => ({ ...none, undecided: new Set(moved.map(state => state.name)) }),
    Steps: ({ steps: each }) => {
      const reached = new Set<string>()
      const left = new Set<string>()
      // Per arrow: whether every row it leaves is refused, and by which invariant first.
      const groups = new Map<
        string,
        { from: string; to: string; refusedBy: Option.Option<string> }
      >()
      const inOf = (row: Step['after']) =>
        enumerable.filter(state => Option.getOrElse(inState(state, row, operators), () => false))
      for (const step of each) {
        const after = inOf(step.after)
        if (write._tag === 'Insert') {
          after.forEach(state => reached.add(state.name))
          continue
        }
        const before = inOf(step.before)
        const judged = judgeAgainst(invariants, step, operators)
        const refusedBy = Match.valueTags(judged, {
          Invalid: ({ failures }) => Option.some(failures[0]!.id),
          Valid: () => Option.none<string>(),
          Undecided: () => Option.none<string>(),
        })
        for (const from of before) {
          for (const to of after) {
            if (from === to || before.includes(to)) continue
            const key = JSON.stringify([from.name, to.name])
            const group = groups.get(key)
            groups.set(key, {
              from: from.name,
              to: to.name,
              refusedBy:
                group === undefined ? refusedBy : Option.flatMap(group.refusedBy, () => refusedBy),
            })
            left.add(from.name)
            if (Option.isNone(refusedBy)) reached.add(to.name)
          }
        }
      }
      const arrows: Array<Arrow> = []
      const findings: Array<Finding> = []
      for (const { from, to, refusedBy } of groups.values()) {
        const arrow = { entity, write: name, from, to }
        arrows.push(arrow)
        findings.push(
          Option.match(refusedBy, {
            onSome: invariant => Finding.Refused({ ...arrow, invariant }),
            onNone: () =>
              Option.exists(write.becomes, state => state.name === to)
                ? Finding.Holds(arrow)
                : Finding.Undeclared(arrow),
          }),
        )
      }
      return { arrows, findings, reached, left, undecided: unenumerable }
    },
  })
}

/**
 * Checks each transition against each invariant of its Entity, and the arrows
 * its writes make between the Entity's declared states. An entry is a
 * declared write (`{ name, write }`, as `Mutation.write` returns), or a
 * transition known by its footprint (`{ name, entity, footprint }`). Pure, and
 * never a fault: what it finds is a report.
 */
const check = <const W extends ReadonlyArray<LawEntry>>(options: {
  readonly writes: W & { readonly [K in keyof W]: Checked<W[K]> }
  readonly operators?: MemoryOperators | undefined
}): LawReport => {
  const operators = options.operators ?? kernelOperators
  const entries = options.writes as ReadonlyArray<LawEntry>
  const pairs: Array<LawPair> = []
  const entities: Array<AnyEntity> = []
  for (const entry of entries) {
    const entity = entityOf(entry)
    if (!entities.some(known => known.identity === entity.identity)) entities.push(entity)
    const footprint = footprintOf(entry)
    // A write's own postcondition is judged as an invariant of that write alone.
    const ensured = isWriteEntry(entry) ? Option.toArray(entry.write.ensures) : []
    for (const held of [...invariantsOf(entity), ...ensured]) {
      pairs.push({
        write: entry.name,
        entity: entity.name,
        invariant: held.id,
        reads: readOf(held),
        footprint,
        verdict: isWriteEntry(entry)
          ? judgeWrite(entry.write, held, operators)
          : judgeFootprint(entry.footprint, held),
      })
    }
  }
  const arrows: Array<Arrow> = []
  const findings: Array<Finding> = []
  const stateList: Array<{ readonly entity: string; readonly names: ReadonlyArray<string> }> = []
  for (const entity of entities) {
    const local = states(entity).filter(state => state.local)
    if (local.length === 0) continue
    stateList.push({ entity: entity.name, names: local.map(state => state.name) })
    const invariants = invariantsOf(entity)
    const reached = new Set<string>()
    const left = new Set<string>()
    const undecided = new Set<string>()
    for (const entry of entries) {
      if (entityOf(entry).identity !== entity.identity) continue
      // A transition without a write makes no arrows, but may move a row anywhere it writes.
      if (!isWriteEntry(entry)) {
        const footprint = footprintOf(entry)
        const writes = Footprint.$match(footprint, {
          Unknown: () => undefined,
          Derived: ({ writes }) => writes,
          Declared: ({ writes }) => writes,
        })
        local
          .filter(state => writes === undefined || state.reads.some(key => writes.includes(key)))
          .forEach(state => undecided.add(state.name))
        continue
      }
      const made = arrowsOf(entry.name, entry.write, local, invariants, operators)
      arrows.push(...made.arrows)
      findings.push(...made.findings)
      const { becomes, ensures } = entry.write
      if (Option.isSome(ensures) && Option.isSome(becomes)) {
        const to = becomes.value.name
        findings.push(Finding.Enforced({ entity: entity.name, write: entry.name, to }))
        reached.add(to)
      }
      made.reached.forEach(state => reached.add(state))
      made.left.forEach(state => left.add(state))
      made.undecided.forEach(state => undecided.add(state))
    }
    for (const state of local) {
      if (undecided.has(state.name)) continue
      if (!reached.has(state.name))
        findings.push(Finding.Unreached({ entity: entity.name, state: state.name }))
      if (!left.has(state.name))
        findings.push(Finding.Terminal({ entity: entity.name, state: state.name }))
    }
  }
  return { pairs, arrows, states: stateList, findings }
}

const pad = (rows: ReadonlyArray<ReadonlyArray<string>>): ReadonlyArray<string> => {
  const widths = rows.reduce<Array<number>>(
    (most, row) => row.map((cell, at) => Math.max(most[at] ?? 0, cell.length)),
    [],
  )
  return rows.map(row =>
    row
      .map((cell, at) => (at === row.length - 1 ? cell : cell.padEnd(widths[at]! + 3)))
      .join('')
      .trimEnd(),
  )
}

const shownVerdict = (verdict: LawVerdict): string =>
  LawVerdict.$match(verdict, {
    Kept: ({ by, rows }) =>
      ({
        disjointness: 'kept: writes no member it reads',
        declared: 'kept: declared to write no member it reads',
        enumeration: `kept: ${rows} row${rows === 1 ? '' : 's'} enumerated`,
        create: 'kept: a create has no row before',
        delete: 'kept: a delete leaves no row',
      })[by],
    Refused: ({ steps: each }) =>
      `refused: from ${JSON.stringify(each[0]!.before)} it leaves ${JSON.stringify(each[0]!.after)}`,
    Undecided: ({ reason }) => `undecided: ${reason}`,
  })

const shownFinding = (finding: Finding): readonly [string, string, string] =>
  Finding.$match(finding, {
    Holds: ({ from, to, write }) => [`${from} -> ${to}`, write, 'holds'] as const,
    Undeclared: ({ from, to, write }) => [`${from} -> ${to}`, write, 'undeclared'] as const,
    Enforced: ({ to, write }) => [`* -> ${to}`, write, 'enforced'] as const,
    Refused: ({ from, to, write, invariant }) =>
      [`${from} -> ${to}`, write, `refused by ${invariant}`] as const,
    Unreached: ({ state }) => [state, '', 'unreached'] as const,
    Terminal: ({ state }) => [state, '', 'terminal'] as const,
  })

/** The entity a finding is of. */
const findingEntity = (finding: Finding): string => finding.entity

/** The report as text: each Entity's states and arrows, then each pair. */
const show = (report: LawReport): string => {
  const sections = report.states.map(({ entity }) => {
    const lines = pad(
      report.findings.filter(finding => findingEntity(finding) === entity).map(shownFinding),
    )
    return [entity, ...lines.map(line => `  ${line}`)].join('\n')
  })
  const pairs = pad(
    report.pairs.map(pair => [pair.write, `x ${pair.invariant}`, shownVerdict(pair.verdict)]),
  )
  return [...sections, pairs.join('\n')].filter(part => part.length > 0).join('\n\n')
}

export const Laws = {
  check,
  show,
}
