/**
 * Invariants: what every stored row of an Entity must hold, and what every
 * change of one must, declared once on the Entity and read by each
 * interpreter: the reference judge here, a Schema check, a form, a server's
 * writer. They are the Entity's, as its relations are, so every descriptor of
 * it judges them, the one they were declared over included.
 *
 * One is built over the row before a write (`before`, each field as `Expr.field`) and
 * the row after it (`after`, each field as `Expr.next`); each `one` relation is
 * there too, as the id it points at, so a judged row holds it as that id. What
 * it reads decides when it is judged:
 *
 * ```text
 * reads `after` only  -> a state invariant: every create and update, a CHECK constraint
 * reads `before` too  -> a transition invariant: every update, which has a row before
 * ```
 *
 * It reads no input and no principal. Who may write is a guard's; whether a
 * write applies now is its `when`'s.
 */
import { Match, Option, Schema, type SchemaAST } from 'effect'
import { OperatorMissingError, truthOver, type Row } from './evaluate.js'
import { kernelOperators } from './memoryTable.js'
import type { MemoryOperators } from './operators.js'
import { put } from './record.js'
import { linkId, oneRelations } from './rows.js'
import { dependenciesOf } from './expr/dependencies.js'
import { and, eq, implies, isNotNull, isNull, not, or } from './expr/logic.js'
import { exprOf, toNode, type Expr, type Predicate, type Reads } from './expr/operand.js'
import { next } from './expr/value.js'
import { unsupportedIn } from './expr/table.js'
import { dependencies as queryDependencies, from, where } from './expr/query.js'
import { extend, invariantsOfIdentity, variantBases } from './descriptor.js'
import type { AnyEntity, EntityField, EntityIdentity, EntityInput, InputMember } from './index.js'
import type { AnyRefinement, RefinementOf } from './refine.js'
import { storesNull, variantsOf } from './variants.js'

type AnyField = EntityField<string, string, Schema.Constraint>

/** One invariant of an Entity, as its interpreters read it. */
export interface Invariant {
  /** Stable, unique within its Entity: what a refusal names, and forms and logs key on. */
  readonly id: string
  /** The Entity it is declared on: ids are unique only within one, so a refusal names both. */
  readonly entity: string
  readonly predicate: Predicate
  /** What someone the rules let write is told when a write would break it. */
  readonly message: string
  /** The members a form shows the failure beside. */
  readonly path: ReadonlyArray<string>
  /** The members it reads of the row before a write (fields, `one` relations); none for a state invariant. */
  readonly before: ReadonlyArray<string>
  /** The members it reads of the row after. */
  readonly after: ReadonlyArray<string>
}

/** The keys of an Entity's `one` relations: what a row holds as the id each points at. */
type LinkKeys<E extends AnyEntity> = {
  [K in keyof E['relations'] & string]: E['relations'][K]['cardinality'] extends 'one' ? K : never
}[keyof E['relations'] & string]

/** The id a `one` relation points at, as a row holds it: null for an optional one pointing nowhere. */
type LinkOf<
  E extends AnyEntity,
  K extends keyof E['relations'],
> = E['relations'][K]['optional'] extends true ? string | null : string

/**
 * Each field as the row before a write holds it, and each `one` relation as
 * the id it points at: what an invariant reads as `before`. Encoded, as the
 * store holds it and the judge reads it, so a literal is written so too (a
 * date as its ISO text).
 */
export type BeforeRow<E extends AnyEntity> = {
  readonly [K in keyof E['fields'] & string]: Expr<Schema.Codec.Encoded<E['fields'][K]['schema']>> &
    Reads<E['name']>
} & { readonly [K in LinkKeys<E>]: Expr<LinkOf<E, K>> & Reads<E['name']> }

/** Each field, and each `one` relation's id, as the row after a write holds it: `after`. */
export type AfterRow<E extends AnyEntity> = {
  readonly [K in keyof E['fields'] & string]: Expr<Schema.Codec.Encoded<E['fields'][K]['schema']>> &
    Reads<E['name']>
} & { readonly [K in LinkKeys<E>]: Expr<LinkOf<E, K>> & Reads<E['name']> }

/** A row, or a change from one row to another, as an invariant is judged over it. */
export interface Change {
  readonly after: Row
  /** The row before an update; none for a create, which judges no transition invariant. */
  readonly before?: Row
}

/** What a row, or a change, comes to under an Entity's invariants. */
export type Judgement =
  | { readonly _tag: 'Valid' }
  | { readonly _tag: 'Invalid'; readonly failures: ReadonlyArray<Invariant> }
  /**
   * Validity is not known: some invariant reads a field the row does not have
   * (`fields`), or calls an operator the table does not run (`operators`, by name).
   */
  | {
      readonly _tag: 'Undecided'
      readonly fields: ReadonlyArray<string>
      readonly operators: ReadonlyArray<string>
    }

/** Whether an invariant reads the row before a write: judged on updates only, and no CHECK. */
export const readsBefore = (held: Invariant): boolean => held.before.length > 0

/**
 * An invariant as declared: the step that attaches it to its Entity and
 * returns the descriptor it was given, carrying its id and, once attached,
 * that Entity's name, so a refusal is matched
 * against the declaration rather than a string spelled again
 * (`Refusal.isInvalidBy(refusal, reservedWithinQuantity)`). An id is unique
 * only within an Entity, so the name is part of what a refusal names; reading
 * it before the declaration is attached throws.
 */
export interface DeclaredInvariant<E extends AnyEntity> {
  (entity: E): E
  readonly id: string
  readonly entity: string
}

/** Which step declared a rule: an invariant may read `before`, a transition must. */
type Step = 'invariant' | 'transition'

const fail = (entity: AnyEntity, message: string, step: Step = 'invariant'): never => {
  throw new Error(`[foldkit-entity] Entity.${step} on ${entity.name}: ${message}`)
}

/** How an invariant is declared: what `build` returns over the rows, and what a failure says. */
type Build<E extends AnyEntity> = (rows: {
  readonly before: BeforeRow<E>
  readonly after: AfterRow<E>
}) => Predicate & Reads<E['name']>

interface Options<E extends AnyEntity> {
  readonly message: string
  readonly path?: ReadonlyArray<(keyof E['fields'] & string) | LinkKeys<E>>
  /**
   * The state (`Entity.refine`) the rule binds: it holds of a row the write
   * leaves in that state, and of no other, as `Expr.implies(state.after, rule)`.
   */
  readonly in?: RefinementOf<E> | undefined
}

/** The rule `build` says, bound to the row after being in `state` when one is given. */
const boundTo = (
  entity: AnyEntity,
  id: string,
  predicate: Predicate,
  state: AnyRefinement | undefined,
  step: Step,
): Predicate => {
  if (state === undefined) return predicate
  if (state.entity.identity !== entity.identity)
    fail(
      entity,
      `"${id}" is in ${state.entity.name}.${state.name}, a state of another Entity`,
      step,
    )
  if (!state.local)
    fail(
      entity,
      `"${id}" is in ${entity.name}.${state.name}, which reaches another row, and a rule is judged over its own row`,
      step,
    )
  return implies(state.after, predicate)
}

/** The invariant `build` declares over `entity`'s rows, refused where it could judge nothing. */
const declareOn = <E extends AnyEntity>(
  entity: E,
  id: string,
  build: Build<E>,
  options: Options<E>,
  step: Step = 'invariant',
): Invariant => {
  const fields = entity.fields as Readonly<Record<string, E['fields'][string]>>
  // A `one` relation reads as the id it points at.
  const links = oneRelations(entity)
  const members = [
    ...Object.entries(fields),
    ...links.map(link => [link.key, link] as const),
  ] as ReadonlyArray<readonly [string, AnyField | (typeof links)[number]]>
  const after = Object.fromEntries(
    members.map(([key, member]) => [key, next(member as AnyField)]),
  ) as unknown as AfterRow<E>
  // Before a write, each is what its `after` reads after it: the same member, unmoved.
  const before = Object.fromEntries(
    members.map(([key, member]) => [key, exprOf(toNode(member))]),
  ) as unknown as BeforeRow<E>
  const said = build({ before, after }) as Predicate
  // `where` refuses a predicate over another Entity, which the type allows when it is unmarked.
  const dependencies = queryDependencies(from(entity).pipe(where(said)))
  if (dependencies.inputs.length > 0) {
    fail(
      entity,
      `"${id}" reads the input ${dependencies.inputs.join(', ')}; it judges stored rows`,
      step,
    )
  }
  const beforeReads = dependencies.predicate.map(field => field.key)
  // Reading the row before alone, it says which rows a write may start from: a write's `when`.
  // Judged as an invariant, a create would skip it and a repair would be refused by it.
  if (dependencies.next.length === 0) {
    fail(
      entity,
      `"${id}" reads no field of \`after\`; what a write may start from is its \`when\``,
      step,
    )
  }
  if (step === 'transition' && beforeReads.length === 0) {
    fail(
      entity,
      `"${id}" reads no field of \`before\`, so it is a rule of one row; declare it with Entity.invariant`,
      step,
    )
  }
  const predicate = boundTo(entity, id, said, options.in, step)
  const afterReads = dependenciesOf(predicate).next.map(field => field.key)
  const path = options.path ?? [...new Set([...afterReads, ...beforeReads])]
  for (const key of path) {
    if (!Object.hasOwn(fields, key) && !links.some(link => link.key === key))
      fail(entity, `"${id}"'s path names "${key}", neither a field nor a one relation`, step)
  }
  return Object.freeze({
    id,
    entity: entity.name,
    predicate,
    message: options.message,
    path: Object.freeze([...path]),
    before: Object.freeze(beforeReads),
    after: Object.freeze(afterReads),
  })
}

/**
 * Declares what every stored row, or every change of one, must hold:
 * `Entity.invariant('reservedWithinQuantity', ({ after }) =>
 * Expr.lte(after.reserved, after.quantity), { message })` over the row a
 * write leaves, or with `before` too over the change an update makes. It is
 * the Entity's: every descriptor of it judges it, and the step returns the one
 * it was given. Applied to that Entity again, it adds nothing.
 * Refused where it is declared: an id declared twice, a predicate over another
 * Entity, one reading an input or nothing of `after` (that is a `when`), a path
 * naming no field.
 *
 * `in: Open` (an `Entity.refine` state of the Entity, over its own row) says
 * the state once: the rule binds only a row the write leaves in it, as
 * `Expr.implies(Open.after, rule)` would.
 */
export const invariant = <E extends AnyEntity>(
  id: string,
  build: Build<E>,
  options: Options<E>,
): DeclaredInvariant<E> => declaring('invariant', id, build, options)

/**
 * Declares what every change of a row must hold, over the row before and the
 * row after: `Entity.transition('staysClosed', ({ before, after }) =>
 * Expr.implies(Expr.eq(before.status, 'closed'), Expr.eq(after.status,
 * 'closed')), { message })`. The same rule `Entity.invariant` stores, judged on
 * updates only (`Entity.readsBefore` says so of either), refused where it is
 * declared when it reads nothing of `before`: a rule of one row is an invariant.
 */
export const transition = <E extends AnyEntity>(
  id: string,
  build: Build<E>,
  options: Options<E>,
): DeclaredInvariant<E> => declaring('transition', id, build, options)

const declaring = <E extends AnyEntity>(
  step: Step,
  id: string,
  build: Build<E>,
  options: Options<E>,
): DeclaredInvariant<E> => {
  let attached: { readonly identity: EntityIdentity<string>; readonly name: string } | undefined
  const declared = (entity: E): E => {
    if (id.length === 0) fail(entity, 'a rule needs an id', step)
    if (attached !== undefined) {
      if (attached.identity !== entity.identity)
        fail(
          entity,
          `"${id}" is declared on ${attached.name} already: declare it again for this Entity`,
          step,
        )
      // Applied again to its Entity, as a module evaluated twice or two pipes over one base do.
      return entity
    }
    if (invariantsOf(entity).some(held => held.id === id))
      fail(entity, `"${id}" is declared twice`, step)
    extend(entity, { invariants: [declareOn(entity, id, build, options, step)] })
    attached = { identity: entity.identity, name: entity.name }
    return entity
  }
  return Object.defineProperties(declared, {
    id: { value: id, enumerable: true },
    entity: {
      enumerable: true,
      get: () => {
        if (attached === undefined) {
          throw new Error(
            `[foldkit-entity] Entity.${step} "${id}" names no Entity until it is attached to one`,
          )
        }
        return attached.name
      },
    },
  }) as DeclaredInvariant<E>
}

const ofCases = new WeakMap<EntityIdentity<string>, ReadonlyArray<Invariant>>()

/**
 * Each case's invariant of a variant Entity (`variant_Available`): a field
 * of its own is held, and one of another case is null. Built when first
 * read, so declaring variants reaches no expression code.
 */
const caseInvariants = (identity: EntityIdentity<string>): ReadonlyArray<Invariant> => {
  const base = variantBases.get(identity)
  if (base === undefined) return []
  const known = ofCases.get(identity)
  if (known !== undefined) return known
  const variants = Option.getOrThrow(variantsOf(identity))
  const { name } = base
  const separate = Object.keys(base.fields).filter(
    key => key !== '_tag' && variants.tags.some(tag => !Object.hasOwn(variants.cases[tag]!, key)),
  )
  const built = variants.tags.flatMap(tag => {
    const own = variants.cases[tag]!
    const reads = separate.filter(key => !Object.hasOwn(own, key) || !storesNull(own[key]!))
    if (reads.length === 0) return []
    const held = reads.filter(key => Object.hasOwn(own, key))
    const foreign = reads.filter(key => !Object.hasOwn(own, key))
    return [
      declareOn<AnyEntity>(
        base,
        `variant_${tag}`,
        ({ after }) => {
          const row = after as Readonly<Record<string, Expr<unknown>>>
          const checks = [
            ...held.map(key => isNotNull(row[key]!)),
            ...foreign.map(key => isNull(row[key]!)),
          ]
          return or(not(eq(row._tag!, tag)), and(checks[0]!, ...checks.slice(1)))
        },
        {
          message: `A ${name} that is ${tag} ${[
            ...(held.length > 0 ? [`holds ${held.join(', ')}`] : []),
            ...(foreign.length > 0 ? [`holds none of ${foreign.join(', ')}`] : []),
          ].join(' and ')}`,
          path: reads,
        },
      ),
    ]
  })
  ofCases.set(identity, built)
  return built
}

/** The Entity's invariants, in the order they were declared. */
export const invariantsOf = (entity: AnyEntity): ReadonlyArray<Invariant> => {
  const cases = caseInvariants(entity.identity)
  const declared = invariantsOfIdentity(entity.identity)
  return cases.length === 0 ? declared : [...cases, ...declared]
}

/** `Entity.judge` against invariants already read, such as those a database binding keeps. */
export const judgeAgainst = (
  invariants: ReadonlyArray<Invariant>,
  change: Change,
  operators: MemoryOperators = kernelOperators,
): Judgement => {
  const missing = new Set<string>()
  const unrun = new Set<string>()
  const failures: Array<Invariant> = []
  const { after, before } = change
  for (const held of invariants) {
    // A create has no row before, so a transition invariant has nothing to judge.
    if (readsBefore(held) && before === undefined) continue
    const absent = [
      ...held.after.filter(key => !Object.hasOwn(after, key)),
      ...held.before.filter(key => !Object.hasOwn(before ?? {}, key)),
    ]
    if (absent.length > 0) absent.forEach(key => missing.add(key))
    else {
      try {
        if (truthOver(held.predicate, before ?? {}, {}, after, operators) !== true) {
          failures.push(held)
        }
      } catch (error) {
        // An operator this table does not run is a judgement it cannot make, as a
        // field the row lacks is: a form passes it, and a server's checks refuse to
        // start without the operator (expr-operations-DESIGN §5.6).
        if (!(error instanceof OperatorMissingError)) throw error
        unrun.add(error.named)
      }
    }
  }
  if (failures.length > 0) return { _tag: 'Invalid', failures }
  if (missing.size > 0 || unrun.size > 0) {
    return { _tag: 'Undecided', fields: [...missing], operators: [...unrun] }
  }
  return { _tag: 'Valid' }
}

/**
 * A row, or a change, under every invariant (each row as the store holds it,
 * encoded): valid only when each is true. SQL's unknown, from a null, fails
 * one, as a `WHERE` drops the row; a field a row does not have leaves it
 * undecided, never valid. Without `before` (a create), transition invariants
 * are not judged.
 */
export const judge = (
  entity: AnyEntity,
  change: Change,
  operators: MemoryOperators = kernelOperators,
): Judgement => judgeAgainst(invariantsOf(entity), change, operators)

/** What `judgeInput` is given beside the input's value. */
export interface JudgeInputOptions {
  /** The table the judge runs operators with: `Operators.kernel` by default. */
  readonly operators?: MemoryOperators | undefined
  /**
   * The row the input edits, encoded as the store holds it (`rowFrom`): the
   * input's keys are laid over it, and it is the row before, so transition
   * invariants are judged too. None for a create.
   */
  readonly over?: Readonly<Record<string, unknown>> | undefined
}

/**
 * The row an input's value describes, judged under its Entity's invariants:
 * each key mapped to a field, encoded as the store holds it, and each mapped
 * to a `one` relation as the id it points at. Without `over`, an invariant
 * over a field the input does not set (an `Option` holding nothing, a key left
 * out) is undecided, so a partial input is never called valid on its account,
 * and no transition is judged. With `over`, the row it edits, such a field is
 * the row's, and the change from the row to the row with the input laid over
 * it is judged, transitions included.
 */
export const judgeInput = (
  input: EntityInput<AnyEntity, any, any>,
  value: Readonly<Record<string, unknown>>,
  options: JudgeInputOptions = {},
): Judgement => {
  const invariants = invariantsOf(input.entity)
  if (invariants.length === 0) return { _tag: 'Valid' }
  const members = input.members as Readonly<Record<string, InputMember>>
  const row: Record<string, unknown> = {}
  for (const [key, member] of Object.entries(members)) {
    if (!Object.hasOwn(value, key)) continue
    // A `one` relation's key holds the id it points at: the row holds that id, or null.
    if (member._tag === 'RelationInput' && member.relation.cardinality === 'one') {
      const given = value[key]
      const id = Option.isOption(given) ? Option.getOrUndefined(given) : given
      if (id === null || typeof id === 'string') put(row, member.relation.key, id)
      continue
    }
    if (member._tag !== 'Field') continue
    const encode = Schema.encodeUnknownOption(
      member.schema as unknown as Schema.Codec<unknown, unknown>,
    )
    const given = value[key]
    const held = Option.isOption(given) ? given : Option.fromUndefinedOr(given)
    // The value as the field holds it: itself for a field typed `Option`, else what it holds.
    // One the field cannot hold is no row the store would keep, so it decides nothing here.
    const stored = Option.orElse(encode(given), () => Option.flatMap(held, encode))
    Option.map(
      Option.flatMap(held, () => stored),
      encoded => put(row, member.key, encoded),
    )
  }
  const operators = options.operators ?? kernelOperators
  if (options.over === undefined) return judgeAgainst(invariants, { after: row }, operators)
  const after: Record<string, unknown> = {}
  for (const [key, held] of Object.entries(options.over)) put(after, key, held)
  for (const [key, held] of Object.entries(row)) put(after, key, held)
  return judgeAgainst(invariants, { after, before: options.over }, operators)
}

/**
 * A decoded value of `entity`, such as a Selection's, as the row the judge
 * reads: each field it holds encoded as the store holds it, and each `one`
 * relation as the id it points at. A member it does not hold is left out, so
 * an invariant reading it is undecided.
 */
export const rowFrom = (
  entity: AnyEntity,
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> => {
  const fields = entity.fields as Readonly<Record<string, AnyField>>
  const row: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(fields)) {
    if (!Object.hasOwn(value, key)) continue
    put(
      row,
      key,
      Schema.encodeUnknownSync(field.schema as unknown as Schema.Codec<unknown, unknown>)(
        value[key],
      ),
    )
  }
  for (const link of oneRelations(entity)) {
    if (!Object.hasOwn(value, link.key)) continue
    Option.map(linkId(value[link.key]), id => put(row, link.key, id))
  }
  return row
}

/**
 * The members outside `input` that its Entity's invariants read, of each
 * invariant that also reads a member the input sets: what a form over the
 * input loads beside its own keys (`Entity.selectFor(input, { also })`), so it
 * can judge those invariants over the row it edits.
 */
export const judgedBy = (
  input: EntityInput<AnyEntity, any, any>,
): Readonly<Record<string, true>> => {
  const sets = new Set(
    Object.values(input.members as Readonly<Record<string, InputMember>>).flatMap(member =>
      Match.valueTags(member, {
        Field: ({ key }) => [key],
        RelationInput: ({ relation }) => [relation.key],
        NestedInput: ({ relation }) => [relation.key],
        Unmapped: () => [],
      }),
    ),
  )
  const read: Record<string, true> = {}
  for (const held of invariantsOf(input.entity)) {
    const reads = [...held.after, ...held.before]
    if (!reads.some(key => sets.has(key))) continue
    for (const key of reads) if (!sets.has(key)) put(read, key, true)
  }
  return read
}

/**
 * The Entity's state invariants as an Effect Schema check over its row type:
 * each failure at its path, with its message. The value is encoded first,
 * field by field, so it is judged as the store would hold it. Refused where it
 * is made when an invariant calls an operator `operators` does not run: such a
 * check would pass every value.
 */
export const check = <E extends AnyEntity>(
  entity: E,
  options: { readonly operators?: MemoryOperators | undefined } = {},
): SchemaAST.Filter<Schema.Schema.Type<E['schema']>> => {
  const predicates = invariantsOf(entity).map(held => held.predicate)
  // The judge runs every operation an invariant reads; an operator alone can be missing.
  const missing = unsupportedIn(
    predicates,
    dependenciesOf(...predicates).operations,
    options.operators ?? kernelOperators,
  )
  if (missing.length > 0) {
    throw new Error(
      `[foldkit-entity] Entity.check of ${entity.name}: its invariants call ${missing.join(', ')}, which the operator table does not run; pass one that does as \`operators\``,
    )
  }
  return Schema.makeFilter(value => {
    const row = rowFrom(entity, value as Readonly<Record<string, unknown>>)
    const judged = judge(entity, { after: row }, options.operators)
    return Match.valueTags(judged, {
      Invalid: ({ failures }) =>
        failures.flatMap((failure): ReadonlyArray<Schema.FilterIssue> =>
          failure.path.length === 0
            ? [failure.message]
            : failure.path.map(key => ({ path: [key], issue: failure.message })),
        ),
      Valid: () => undefined,
      Undecided: () => undefined,
    })
  })
}
