/**
 * `Laws.check`: each transition against each invariant of its Entity, and
 * the arrows its writes make between the Entity's states: by enumeration over
 * finite fields where the members it reads are few, and by metakit's checker
 * over the write's transition (`pairCheck.ts`) where they are not. Pure: it
 * reads declarations and returns a report, which is data; `Laws.show` prints
 * it. Its own entry, `foldkit-entity/laws`: a page never carries the checker.
 */
import { Data, Match, Option, type Schema } from 'effect'
import { Evidence } from 'foldkit-metadata'
import type { Verdict } from 'metakit'
import { Steps, finiteValues, steps, type Step } from './enumerate.js'
import { Decision, decide, meetable, type Witness } from './pairCheck.js'
import { judgeAgainst, readsBefore, invariantsOf, type Invariant } from './invariant.js'
import { declaredOwner, Footprint } from './footprint.js'
import { dependenciesOf } from './expr.js'
import { lawId, transitionId } from './lawIds.js'
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

/**
 * What a pair left undecided asks of a later pass, as the declarations hold
 * it: break `rule` with a row before that keeps every `assumed` invariant and
 * an input within its Schema, meeting the `write`'s `when` (its `from` folded
 * in), with the row after the `write`'s sets, increments and assignments make.
 * `cases` are the values of the finite members this pass could not decide
 * (each a step: the row before, the input, and the row after over them); none
 * where it enumerated nothing.
 */
export interface Obligation {
  readonly write: AnyWrite
  readonly rule: Invariant
  /** The Entity's state invariants, held by the row before (none for a create). */
  readonly assumed: ReadonlyArray<Invariant>
  readonly cases: ReadonlyArray<Step>
}

/** How one transition stands against one invariant. */
export type LawVerdict = Data.TaggedEnum<{
  /**
   * It cannot break it. `by`: it writes nothing the (state) invariant reads,
   * its author says so, every row it can start from was enumerated, there is
   * no row to judge (a create and a transition, a delete), or metakit's
   * checker proved it for every row and input the declarations allow, and
   * `by` names the tier that did (its `Verdict.ProofTier`; the checker gives
   * `concrete`, `interval` or `zone`). `over`: the members a proof holds over.
   */
  Kept: {
    readonly by:
      | 'disjointness'
      | 'declared'
      | 'enumeration'
      | 'create'
      | 'delete'
      | Verdict.ProofTier
    readonly rows: number
    readonly over: ReadonlyArray<string>
  }
  /**
   * A row it can start from, and an input, that it leaves breaking it: the
   * enumerated `steps` that do (empty where the witness was found among the
   * numbers), and the smallest `witness` the check made, checked by the
   * reference judge. `hint` says when the witness starts from a state no
   * declared write reaches.
   */
  Refused: {
    readonly steps: ReadonlyArray<Step>
    readonly witness: Witness
    readonly hint: Option.Option<string>
  }
  /** Nothing here can say, why, and, for a declared write, what a later pass would have to prove. */
  Undecided: { readonly reason: string; readonly obligation: Option.Option<Obligation> }
}>
export const LawVerdict = Data.taggedEnum<LawVerdict>()

const kept = (
  by: Extract<LawVerdict, { readonly _tag: 'Kept' }>['by'],
  rows = 0,
  over: ReadonlyArray<string> = [],
): LawVerdict => LawVerdict.Kept({ by, rows, over })

/** The witness one enumerated step makes. */
const witnessOf = (write: AnyWrite, held: Invariant, step: Step): Witness => ({
  before: Match.valueTags(write, {
    Insert: () => Option.none(),
    Update: () => Option.some(step.before),
    Delete: () => Option.some(step.before),
  }),
  input: step.input,
  after: step.after,
  invariant: held.id,
  message: held.message,
  path: held.path,
})

export type { Witness } from './pairCheck.js'

/** One transition against one invariant of its Entity. */
export interface LawPair {
  readonly write: string
  readonly entity: string
  readonly invariant: string
  /** The members the invariant reads, before and after, by field key. */
  readonly reads: ReadonlyArray<string>
  /**
   * True for a transition invariant, which reads the row before: a write that
   * leaves every member it reads alone can still break it, so the graph reads
   * it as reading the whole row.
   */
  readonly readsBefore: boolean
  readonly footprint: Footprint
  readonly verdict: LawVerdict
  /** True for a write's own `ensures`: a law of that write alone, held where it commits. */
  readonly postcondition: boolean
  /**
   * A record for a pair the check kept by reading the declarations:
   * `Bounded` for one metakit's checker proved, `Enumerated` for the rest;
   * none for an author's word (`declared`), a refusal, or an undecided pair.
   */
  readonly evidence: Option.Option<Evidence>
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
  /** Every row the arrow leaves breaks `invariant`, which refuses the write there; `witness` is one. */
  Refused: Arrow & { readonly invariant: string; readonly witness: Witness }
  /** No row the Entity's state invariants allow, and no input, meets the write's `from` and `when`. */
  Unmeetable: { readonly entity: string; readonly write: string }
  /** No write leaves a row in the state. */
  Unreached: { readonly entity: string; readonly state: string }
  /** No write starts from it. */
  Terminal: { readonly entity: string; readonly state: string }
}>
export const Finding = Data.taggedEnum<Finding>()

/** What a report stands on, counted. */
export interface LawTotals {
  readonly entities: number
  /** The Entities' local states. */
  readonly states: number
  /** The transitions checked: one per entry. */
  readonly writes: number
  /** The Entities' invariants (a write's own postcondition is a pair, not a rule). */
  readonly rules: number
  readonly pairs: number
  readonly kept: number
  readonly refused: number
  readonly undecided: number
}

export interface LawReport {
  readonly pairs: ReadonlyArray<LawPair>
  readonly arrows: ReadonlyArray<Arrow>
  /** Each Entity's local states, by name. */
  readonly states: ReadonlyArray<{ readonly entity: string; readonly names: ReadonlyArray<string> }>
  readonly findings: ReadonlyArray<Finding>
  readonly totals: LawTotals
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
const reads = new WeakMap<Invariant, ReadonlyArray<string>>()

/**
 * Every member an invariant reads, before and after, and the relation of its
 * own row each path or exists leaves by: a write relinking it changes what the
 * rule reads, though it writes no field the rule names (`held.before` and
 * `held.after` hold its own row's fields alone).
 */
const readOf = (held: Invariant): ReadonlyArray<string> => {
  const known = reads.get(held)
  if (known !== undefined) return known
  const links = dependenciesOf(held.predicate).reaches.flatMap(reach =>
    Match.valueTags(reach, {
      Path: ({ via }) => [via[0].key],
      Exists: ({ via }) => via.slice(0, 1).map(relation => relation.key),
      // A path from the viewer starts at the viewer's row, not this one.
      ViewerPath: () => [],
    }),
  )
  const read = [...new Set([...held.before, ...held.after, ...links])]
  reads.set(held, read)
  return read
}

const disjoint = (writes: ReadonlyArray<string>, reads: ReadonlyArray<string>): boolean =>
  !writes.some(key => reads.includes(key))

const issuer = Evidence.issuer('foldkit-entity/laws')

const transition = transitionId
const law = lawId

/** The record for a pair the check decided it keeps, unless only its author says so. */
const evidenceOf = (name: string, held: Invariant, verdict: LawVerdict): Option.Option<Evidence> =>
  LawVerdict.$match(verdict, {
    Kept: ({ by }) => {
      if (by === 'declared') return Option.none()
      const pair = { transition: transition({ name }), law: law(held) }
      return Option.some(
        issuer.issue(
          by === 'concrete' || by === 'interval' || by === 'zone' || by === 'z3'
            ? Evidence.Bounded(pair)
            : Evidence.Enumerated(pair),
        ),
      )
    },
    Refused: () => Option.none(),
    Undecided: () => Option.none(),
  })

/** The members a rule reads that enumeration cannot list: what a proof by the checker holds over. */
const unenumerated = (write: AnyWrite, held: Invariant): ReadonlyArray<string> => {
  const fields = write.input.entity.fields as Readonly<Record<string, AnyField>>
  return [...new Set([...held.before, ...held.after])].filter(key =>
    Option.match(Option.fromUndefinedOr(own(fields, key)), {
      onNone: () => true,
      onSome: field => Option.isNone(finiteValues(field.schema as unknown as Schema.Top)),
    }),
  )
}

/** One declared write against one invariant. */
const judgeWrite = (
  write: AnyWrite,
  held: Invariant,
  invariants: ReadonlyArray<Invariant>,
  operators: MemoryOperators,
): LawVerdict => {
  if (write._tag === 'Delete') return kept('delete')
  const transition = readsBefore(held)
  if (write._tag === 'Insert' && transition) return kept('create')
  const reads = readOf(held)
  // Disjointness decides a state invariant only: a transition invariant can be broken by a write leaving it alone.
  if (write._tag === 'Update' && !transition && disjoint(writtenKeys(write), reads))
    return kept('disjointness')
  const obligation = (cases: ReadonlyArray<Step>) =>
    Option.some({
      write,
      rule: held,
      assumed: Match.valueTags(write, {
        Insert: () => [],
        Update: () => invariants.filter(each => !readsBefore(each)),
        Delete: () => invariants.filter(each => !readsBefore(each)),
      }),
      cases,
    })
  return Steps.$match(steps(write, reads, { operators }), {
    // Past what enumeration reaches: the members it cannot list, left to metakit's checker.
    Undecided: () =>
      Decision.$match(decide(write, held, invariants, operators), {
        Kept: ({ tier }) => kept(tier, 0, unenumerated(write, held)),
        Refused: ({ witness }) => LawVerdict.Refused({ steps: [], witness, hint: Option.none() }),
        Undecided: ({ reason }) => LawVerdict.Undecided({ reason, obligation: obligation([]) }),
      }),
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
        if (Option.isSome(undecided))
          return LawVerdict.Undecided({ reason: undecided.value, obligation: obligation([step]) })
      }
      return refused.length > 0
        ? LawVerdict.Refused({
            steps: refused,
            witness: witnessOf(write, held, refused[0]!),
            hint: Option.none(),
          })
        : kept('enumeration', each.length)
    },
  })
}

/** Undecided with no write a later pass could read. */
const undecided = (reason: string): LawVerdict =>
  LawVerdict.Undecided({ reason, obligation: Option.none() })

/** One transition known by its footprint alone against one invariant. */
const judgeFootprint = (footprint: Footprint, held: Invariant): LawVerdict =>
  Footprint.$match(footprint, {
    Unknown: () => undecided('what it writes is unknown, so every member'),
    Derived: () => undecided('a derived footprint needs its write'),
    Declared: ({ writes, by }) => {
      if (readsBefore(held))
        return undecided(
          `a transition invariant is not kept by disjointness, and ${by}'s word is all there is`,
        )
      const touched = writes.filter(key => readOf(held).includes(key))
      return touched.length === 0
        ? kept('declared')
        : undecided(`${by} says it writes ${touched.join(', ')}`)
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
      // Per arrow: whether every row it leaves is refused, by which invariant first, and the first such row.
      const groups = new Map<
        string,
        {
          from: string
          to: string
          refusedBy: Option.Option<{ readonly invariant: string; readonly witness: Witness }>
        }
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
          Invalid: ({ failures }) =>
            Option.some({
              invariant: failures[0]!.id,
              witness: witnessOf(write, failures[0]!, step),
            }),
          Valid: () => Option.none(),
          Undecided: () => Option.none(),
        })
        for (const from of before) {
          for (const to of after) {
            if (from === to || before.includes(to)) continue
            const key = JSON.stringify([from.name, to.name])
            const group = groups.get(key)
            groups.set(key, {
              from: from.name,
              to: to.name,
              // Refused while every row is, and shown by the first.
              refusedBy:
                group === undefined
                  ? refusedBy
                  : Option.flatMap(group.refusedBy, first => Option.map(refusedBy, () => first)),
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
            onSome: ({ invariant, witness }) => Finding.Refused({ ...arrow, invariant, witness }),
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
 * what it finds is a report, never a fault; it throws only for two entries of
 * one name, which its report could not tell apart.
 */
const check = <const W extends ReadonlyArray<LawEntry>>(options: {
  readonly writes: W & { readonly [K in keyof W]: Checked<W[K]> }
  readonly operators?: MemoryOperators | undefined
}): LawReport => {
  const operators = options.operators ?? kernelOperators
  const entries = options.writes as ReadonlyArray<LawEntry>
  const pairs: Array<LawPair> = []
  // Each pair's Entity, by the pair's place, for the hints read once the states are known.
  const pairEntities: Array<AnyEntity> = []
  const entities: Array<AnyEntity> = []
  const unmeetable: Array<Finding> = []
  const names = new Set<string>()
  for (const entry of entries) {
    // Pairs, arrows and evidence name a transition by its name alone.
    if (names.has(entry.name))
      throw new Error(`[foldkit-entity] Laws.check: two transitions are named ${entry.name}`)
    names.add(entry.name)
    const entity = entityOf(entry)
    if (!entities.some(known => known.identity === entity.identity)) entities.push(entity)
    const footprint = footprintOf(entry)
    const invariants = invariantsOf(entity)
    if (isWriteEntry(entry) && !meetable(entry.write, invariants))
      unmeetable.push(Finding.Unmeetable({ entity: entity.name, write: entry.name }))
    // A write's own postcondition is judged as an invariant of that write alone.
    const ensured = isWriteEntry(entry) ? Option.toArray(entry.write.ensures) : []
    for (const held of [...invariants, ...ensured]) {
      const verdict = isWriteEntry(entry)
        ? judgeWrite(entry.write, held, invariants, operators)
        : judgeFootprint(entry.footprint, held)
      pairEntities.push(entity)
      pairs.push({
        write: entry.name,
        entity: entity.name,
        invariant: held.id,
        reads: readOf(held),
        readsBefore: readsBefore(held),
        footprint,
        verdict,
        postcondition: ensured.includes(held),
        evidence: evidenceOf(entry.name, held, verdict),
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
  findings.push(...unmeetable)
  const hinted = pairs.map((pair, at) => hintedPair(pair, pairEntities[at]!, findings, operators))
  const count = (tag: LawVerdict['_tag']) => hinted.filter(pair => pair.verdict._tag === tag).length
  return {
    pairs: hinted,
    arrows,
    states: stateList,
    findings,
    totals: {
      entities: entities.length,
      states: stateList.reduce((sum, { names: each }) => sum + each.length, 0),
      writes: entries.length,
      rules: entities.reduce((sum, entity) => sum + invariantsOf(entity).length, 0),
      pairs: hinted.length,
      kept: count('Kept'),
      refused: count('Refused'),
      undecided: count('Undecided'),
    },
  }
}

/**
 * A refused pair whose witness starts in states no declared write reaches,
 * marked so: the rule may still hold of every row the writes make, and an
 * invariant ruling those states out would settle the pair.
 */
const hintedPair = (
  pair: LawPair,
  entity: AnyEntity,
  findings: ReadonlyArray<Finding>,
  operators: MemoryOperators,
): LawPair => {
  if (pair.verdict._tag !== 'Refused') return pair
  const verdict = pair.verdict
  return Option.match(verdict.witness.before, {
    onNone: () => pair,
    onSome: before => {
      const unreached = new Set(
        findings
          .filter(Finding.$is('Unreached'))
          .filter(finding => finding.entity === entity.name)
          .map(finding => finding.state),
      )
      const starts = states(entity)
        .filter(state => state.local)
        .filter(state => Option.getOrElse(inState(state, before, operators), () => false))
        .map(state => state.name)
      if (starts.length === 0 || !starts.every(name => unreached.has(name))) return pair
      return {
        ...pair,
        verdict: LawVerdict.Refused({
          ...verdict,
          hint: Option.some(
            `it starts ${starts.join(' and ')}, which no declared write reaches: an invariant ruling that out would settle this pair`,
          ),
        }),
      }
    },
  })
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

const plural = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`

const shownVerdict = (verdict: LawVerdict): string =>
  LawVerdict.$match(verdict, {
    Kept: ({ by, rows, over }) =>
      ({
        disjointness: 'kept: writes no member it reads',
        declared: 'kept: declared to write no member it reads',
        enumeration: `kept: ${plural(rows, 'row')} enumerated`,
        create: 'kept: a create has no row before',
        delete: 'kept: a delete leaves no row',
        concrete: `kept: decided by evaluation, over ${over.join(' and ')}`,
        interval: `kept: proved from the intervals on ${over.join(' and ')}, for every row and input within them`,
        zone: `kept: proved from the bounds and differences of ${over.join(' and ')}, for every row and input within them`,
        z3: `kept: proved by the solver over ${over.join(' and ')}`,
      })[by],
    Refused: ({ witness }) => `refused: ${witness.message}`,
    Undecided: ({ reason }) => `undecided: ${reason}`,
  })

/** A row's members as `key: value`, each value as JSON. */
const members = (row: Readonly<Record<string, unknown>>): string =>
  Object.entries(row)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ')

/** A witness, and a hint, as lines to print under the pair or arrow they belong to. */
const shownWitness = (witness: Witness, hint: Option.Option<string>): ReadonlyArray<string> =>
  pad([
    ['before', Option.match(witness.before, { onNone: () => '(none: a create)', onSome: members })],
    ['input', members(witness.input)],
    ['after', members(witness.after)],
    ...Option.toArray(Option.map(hint, text => ['hint', text])),
  ]).map(line => `    ${line}`)

const shownFinding = (finding: Finding): readonly [string, string, string] =>
  Finding.$match(finding, {
    Holds: ({ from, to, write }) => [`${from} -> ${to}`, write, 'holds'] as const,
    Undeclared: ({ from, to, write }) => [`${from} -> ${to}`, write, 'undeclared'] as const,
    Enforced: ({ to, write }) => [`* -> ${to}`, write, 'enforced'] as const,
    Refused: ({ from, to, write, invariant }) =>
      [`${from} -> ${to}`, write, `refused by ${invariant}`] as const,
    Unmeetable: ({ write }) => ['', write, 'no row meets its from and when'] as const,
    Unreached: ({ state }) => [state, '', 'unreached'] as const,
    Terminal: ({ state }) => [state, '', 'terminal'] as const,
  })

/** Lines, each followed by the block that belongs under it. */
const withBlocks = (
  lines: ReadonlyArray<string>,
  blocks: ReadonlyArray<ReadonlyArray<string>>,
): ReadonlyArray<string> => lines.flatMap((line, at) => [line, ...(blocks[at] ?? [])])

/** The report as text: each Entity's states and arrows, then each pair, then what it stands on. */
const show = (report: LawReport): string => {
  const sectioned = [
    ...new Set([
      ...report.states.map(({ entity }) => entity),
      ...report.findings.map(finding => finding.entity),
    ]),
  ]
  const sections = sectioned.map(entity => {
    const own = report.findings.filter(finding => finding.entity === entity)
    const lines = withBlocks(
      pad(own.map(shownFinding)),
      own.map(finding =>
        Finding.$is('Refused')(finding) ? shownWitness(finding.witness, Option.none()) : [],
      ),
    )
    return [entity, ...lines.map(line => `  ${line}`)].join('\n')
  })
  const pairs = withBlocks(
    pad(report.pairs.map(pair => [pair.write, `x ${pair.invariant}`, shownVerdict(pair.verdict)])),
    report.pairs.map(pair =>
      LawVerdict.$match(pair.verdict, {
        Refused: ({ witness, hint }) => shownWitness(witness, hint),
        Kept: () => [],
        Undecided: () => [],
      }),
    ),
  )
  const { totals } = report
  const footing = `${plural(totals.entities, 'entity', 'entities')}, ${plural(totals.states, 'state')}, ${plural(totals.writes, 'write')}, ${plural(totals.rules, 'rule')}: ${plural(totals.pairs, 'pair')}, ${totals.kept} kept, ${totals.refused} refused, ${totals.undecided} undecided`
  return [...sections, pairs.join('\n'), footing].filter(part => part.length > 0).join('\n\n')
}

/** A node of the law half of `foldkit-surface`'s graph, as plain data. */
export type LawNode = Data.TaggedEnum<{
  /** A member of an Entity (`['Product', 'reserved']`), or its whole row (`['Product']`), which a transition invariant reads. */
  Path: { readonly space: 'entity'; readonly path: ReadonlyArray<string> }
  /** A transition over one Entity's rows: a delete, which writes no member, is still of its Entity. */
  Transition: { readonly id: string; readonly kind: 'write'; readonly entity: string }
  Law: { readonly id: string }
  State: { readonly entity: string; readonly name: string }
}>
export const LawNode = Data.taggedEnum<LawNode>()

/** An edge of the law half of the graph, naming its nodes by id or path, each path an Entity member. */
export type LawEdge = Data.TaggedEnum<{
  Reads: { readonly law: string; readonly space: 'entity'; readonly path: ReadonlyArray<string> }
  Writes: {
    readonly transition: string
    readonly space: 'entity'
    readonly path: ReadonlyArray<string>
  }
  From: { readonly transition: string; readonly entity: string; readonly state: string }
  To: { readonly transition: string; readonly entity: string; readonly state: string }
  Keeps: { readonly transition: string; readonly law: string; readonly evidence: Evidence }
}>
export const LawEdge = Data.taggedEnum<LawEdge>()

export interface LawFacts {
  readonly nodes: ReadonlyArray<LawNode>
  readonly edges: ReadonlyArray<LawEdge>
}

/**
 * The report as graph facts: a Law per invariant, a Transition per write in
 * a pair or an arrow (one judged against nothing and moving no state has no
 * law to keep), a State per local state, what each law reads and each transition writes,
 * each arrow's `from` and `to`, and a `keeps` edge per transition and law whose every
 * pair carries an `Enumerated` record.
 * A write's own `ensures` is no law of its Entity and is left out. An
 * `Unknown` footprint writes every member, so it has a `writes` edge to each
 * member a law of its Entity reads: every edge a rule of the graph can ask of.
 */
const facts = (report: LawReport): LawFacts => {
  const nodes = new Map<string, LawNode>()
  const edges = new Map<string, LawEdge>()
  const node = (made: LawNode) => nodes.set(JSON.stringify(made), made)
  const edge = (key: unknown, made: LawEdge) => edges.set(JSON.stringify(key), made)
  // Per (transition, law), the last record, or none once any pair for it has none.
  const keeps = new Map<
    string,
    {
      readonly transition: string
      readonly law: string
      readonly evidence: Option.Option<Evidence>
    }
  >()
  const path = (entity: string, member: string) => {
    const at = [entity, member]
    node(LawNode.Path({ space: 'entity', path: at }))
    return at
  }
  const write = (name: string, entity: string) => {
    const id = transition({ name })
    node(LawNode.Transition({ id, kind: 'write', entity }))
    return id
  }
  for (const { entity, names } of report.states)
    for (const name of names) node(LawNode.State({ entity, name }))
  for (const pair of report.pairs) {
    const by = write(pair.write, pair.entity)
    const writes = Footprint.$match(pair.footprint, {
      Derived: ({ writes }) => writes,
      Declared: ({ writes }) => writes,
      Unknown: () => pair.reads,
    })
    for (const member of writes)
      edge(
        ['writes', by, pair.entity, member],
        LawEdge.Writes({ transition: by, space: 'entity', path: path(pair.entity, member) }),
      )
    if (pair.postcondition) continue
    const id = law({ id: pair.invariant, entity: pair.entity })
    node(LawNode.Law({ id }))
    for (const member of pair.reads)
      edge(
        ['reads', id, pair.entity, member],
        LawEdge.Reads({ law: id, space: 'entity', path: path(pair.entity, member) }),
      )
    if (pair.readsBefore) {
      node(LawNode.Path({ space: 'entity', path: [pair.entity] }))
      edge(
        ['reads', id, pair.entity],
        LawEdge.Reads({ law: id, space: 'entity', path: [pair.entity] }),
      )
    }
    const key = JSON.stringify(['keeps', by, id])
    const known = keeps.get(key)
    keeps.set(key, {
      transition: by,
      law: id,
      evidence:
        known === undefined ? pair.evidence : Option.flatMap(known.evidence, () => pair.evidence),
    })
  }
  for (const { transition: by, law: id, evidence } of keeps.values())
    if (Option.isSome(evidence))
      edge(['keeps', by, id], LawEdge.Keeps({ transition: by, law: id, evidence: evidence.value }))
  for (const { entity, write: name, from, to } of report.arrows) {
    const by = write(name, entity)
    edge(['from', by, entity, from], LawEdge.From({ transition: by, entity, state: from }))
    edge(['to', by, entity, to], LawEdge.To({ transition: by, entity, state: to }))
  }
  for (const finding of report.findings)
    if (Finding.$is('Enforced')(finding)) {
      const by = write(finding.write, finding.entity)
      edge(
        ['to', by, finding.entity, finding.to],
        LawEdge.To({ transition: by, entity: finding.entity, state: finding.to }),
      )
    }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

/**
 * Declared transitions as graph facts, read off the declarations alone: a
 * transition per entry and the members it writes (an `Unknown` footprint
 * every field), a law per invariant of its Entity and the members it reads,
 * the Entity's states, and a write's `from` and `becomes`. Nothing is
 * enumerated, since whether a transition keeps a law is evidence. What
 * `foldkit-surface`'s `Graph.of` derives a contract's `laws.entities`
 * with; a function by name, so that path does not carry `Laws.check`.
 */
export const lawFactsOf = (entries: ReadonlyArray<LawEntry>): LawFacts => {
  const nodes = new Map<string, LawNode>()
  const edges = new Map<string, LawEdge>()
  const node = (made: LawNode) => nodes.set(JSON.stringify(made), made)
  const edge = (made: LawEdge) => edges.set(JSON.stringify(made), made)
  for (const entry of entries) {
    const entity = entityOf(entry)
    const by = transition(entry)
    const member = (key: string) => ({ space: 'entity' as const, path: [entity.name, key] })
    node(LawNode.Transition({ id: by, kind: 'write', entity: entity.name }))
    const written = Footprint.$match(footprintOf(entry), {
      Derived: ({ writes }) => writes,
      Declared: ({ writes }) => writes,
      Unknown: () => Object.keys(entity.fields),
    })
    for (const key of written) edge(LawEdge.Writes({ transition: by, ...member(key) }))
    for (const held of invariantsOf(entity)) {
      const id = law(held)
      node(LawNode.Law({ id }))
      for (const key of readOf(held)) edge(LawEdge.Reads({ law: id, ...member(key) }))
      // A write leaving a transition invariant's members alone can still break it: it reads the row.
      if (readsBefore(held)) edge(LawEdge.Reads({ law: id, space: 'entity', path: [entity.name] }))
    }
    for (const state of states(entity))
      node(LawNode.State({ entity: entity.name, name: state.name }))
    if (!isWriteEntry(entry)) continue
    for (const state of Option.toArray(entry.write.from))
      edge(LawEdge.From({ transition: by, entity: entity.name, state: state.name }))
    for (const state of Option.toArray(entry.write.becomes))
      edge(LawEdge.To({ transition: by, entity: entity.name, state: state.name }))
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}

export const Laws = {
  check,
  show,
  facts,
  transition,
  law,
}
