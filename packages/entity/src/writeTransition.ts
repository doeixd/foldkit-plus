/**
 * A declared write as a metakit `Transition`, so the checker, the prover,
 * `Transition.commutes` and the graph read an Entity's writes as they read
 * any other transition (the kernel convergence note, "How are an insert and a
 * delete transitions"). Its own entry, `foldkit-entity/transition`: a page
 * that declares writes does not carry it.
 *
 * The state is the row's place in its table, `{ present, row }`: `present`
 * says whether the row is there, `row` is the Entity's row as the store holds
 * it. The input is the write's own input, each key in the stored (encoded)
 * form of its Schema, and `supplied` holds what no caller passes and no row
 * holds: the viewer and the time. Each part of a write is a way of writing:
 *
 * - a set, a link and a context value are `set` of `row.<field>`;
 * - an increment is `add` of the amount (a decrement adds it negated);
 * - an assignment is `set` of the expression it computes, read under `row`;
 * - an insert is `set` of `present` to true, and a delete to false.
 */
import { Effect, Match, Option, Schema, SchemaAST } from 'effect'
import { Bool, Eq, Node, Null, Num, Path, Transition } from 'metakit'
import type { ExprContext } from './context.js'
import { viewerIdOf } from './context.js'
import type { OneRelation } from './expr.js'
import { lower } from './lower.js'
import { Write, type AnyWrite, type ContextRead, type ContextSet } from './write.js'

/** A row's place in its table: whether it is there, and what it holds, as the store holds it. */
export interface WriteState {
  readonly present: boolean
  readonly row: Readonly<Record<string, unknown>>
}

/** A write's input, each key in the stored form of its Schema (`Schema.encodeSync(write.input.schema)`). */
export type WriteInput = Readonly<Record<string, unknown>>

/**
 * What a write's context supplies: `viewer` (the asker's id, null for a
 * visitor), `now`, and, for a context value read from the viewer's row, one
 * `viewer:<member>` each. See `suppliedOf`.
 */
export type WriteSupplied = Readonly<Record<string, unknown>>

/** The transition of a declared write. */
export type WriteTransition = Transition.Transition<WriteState, WriteInput, never, WriteSupplied>

type Equation = WriteTransition['writes'][number]

const VIEWER = 'viewer'
const NOW = 'now'

const wrap = (node: Node.Node): Equation['value'] => ({
  [Path.ExprTypeId]: undefined as never,
  node,
})

const read = (segments: ReadonlyArray<string>, schema: Schema.Top): Node.Node =>
  Node.Path({ segments, ast: Option.some(Schema.toEncoded(schema).ast) })

const fail = (write: AnyWrite, message: string): never => {
  throw new Error(`[foldkit-entity] transitionOf ${write.input.entity.name}: ${message}`)
}

/** Whether a key of the input may be left out: it is optional, or takes `undefined` or an empty `Option`. */
const mayBeLeftOut = (schema: Schema.Top): boolean => {
  const takes = Schema.is(Schema.toType(schema) as Schema.Codec<unknown>)
  return SchemaAST.isOptional(schema.ast) || takes(undefined) || takes(Option.none())
}

const holdsNull = (schema: Schema.Top): boolean =>
  Schema.is(Schema.toEncoded(schema) as Schema.Codec<unknown>)(null)

const joined = (op: Node.Op, operands: ReadonlyArray<Node.Node>): Node.Node =>
  operands.reduce((left, right) => Node.Call({ op, args: [left, right] }))

/** The name a context value is supplied under, and the Schema it is of. */
const suppliedFor = (
  write: AnyWrite,
  { member, value }: ContextSet,
): { readonly name: string; readonly schema: Schema.Top } =>
  Match.valueTags(value, {
    Viewer: () => ({ name: VIEWER, schema: Schema.NullOr(Schema.String) }),
    Now: () => ({ name: NOW, schema: Schema.Int }),
    ViewerPath: () =>
      Match.valueTags(member, {
        Relation: ({ key }) =>
          fail(write, `${key} is a relation set from a path of the viewer's row`),
        Field: field => ({
          name: `${VIEWER}:${field.key}`,
          schema: Schema.NullOr(Schema.toEncoded(field.schema as unknown as Schema.Top)),
        }),
      }),
  })

/**
 * An expression of the entity's, translated (`lower`) and read under the
 * transition's slices: `row` is `state.row`, `input` stays. It reads the row
 * and the input alone, as a write's precondition and assignments do.
 */
const underState = (write: AnyWrite, node: Node.Node): Node.Node => {
  const again = (each: Node.Node) => underState(write, each)
  return Node.$match(node, {
    Lit: literal => literal,
    Path: ({ segments, ast }) => {
      const [slice, key, ...rest] = segments
      const plain = key !== undefined && rest.length === 0 && !/^[@<#]/.test(key)
      if (slice === 'row' && plain) return Node.Path({ segments: ['state', 'row', key], ast })
      if (slice === 'input' && key !== undefined) return Node.Path({ segments, ast })
      return fail(
        write,
        `it reads ${segments.join('.')}, and a write reads its row and its input alone`,
      )
    },
    Call: ({ op, args }) => Node.Call({ op, args: args.map(again) }),
    If: ({ cond, then, otherwise }) =>
      Node.If({ cond: again(cond), then: again(then), otherwise: again(otherwise) }),
    Match: ({ on, cases, otherwise }) =>
      Node.Match({
        on: again(on),
        cases: cases.map(([value, then]) => [value, again(then)] as const),
        otherwise: Option.map(otherwise, again),
      }),
    Opaque: () => fail(write, 'it holds opaque code'),
    Rows: () => fail(write, 'it reads another row'),
  })
}

const transitions = new WeakMap<AnyWrite, WriteTransition>()

/**
 * The transition of `write`. It applies where the row is `present` (an
 * insert: is not), the write's `when` and `from` hold, and the revision it
 * `expect`s is the row's. Its writes are in the module's own description; the
 * revision's new value is the store's to choose, so it is an opaque value that
 * reads the old one and gives one more, as the reference stores do.
 *
 * An input key that may be left out sets "the key if given, else the field as
 * it was". Evaluation reads a key left out as null, so where the field cannot
 * hold null that is a choice on the key being null; where it can, the value is
 * opaque, reading both, and a rule over that field is unknown to the checker.
 * The id is not written: it names the row, as `Write.footprint` has it.
 */
export const transitionOf = (write: AnyWrite): WriteTransition => {
  const known = transitions.get(write)
  if (known !== undefined) return known
  const made = build(write)
  transitions.set(write, made)
  return made
}

const build = (write: AnyWrite): WriteTransition => {
  const { entity } = write.input
  const inputFields = write.input.schema.fields as Readonly<Record<string, Schema.Top>>
  const inputOf = (key: string): Node.Node => read(['input', key], inputFields[key]!)
  const rowOf = (field: { readonly key: string; readonly schema: unknown }): Node.Node =>
    read(['state', 'row', field.key], field.schema as Schema.Top)
  const present = Node.Path({
    segments: ['state', 'present'],
    ast: Option.some(Schema.Boolean.ast),
  })

  const lowered = lower([
    ...Option.match(write.when, { onNone: () => [], onSome: query => query.where }),
    ...write.assignments.map(assignment => assignment.expr),
  ])
  const [conditions, assigned] = [
    lowered.nodes.slice(0, lowered.nodes.length - write.assignments.length),
    lowered.nodes.slice(lowered.nodes.length - write.assignments.length),
  ]
  const guard = [
    Match.value(write._tag).pipe(
      Match.when('Insert', () => Node.Call({ op: Bool.notOp, args: [present] })),
      Match.orElse(() => present),
    ),
    ...conditions.map(node => underState(write, node)),
    ...(write.expect === undefined
      ? []
      : [
          Node.Call({
            op: Eq.equalsOp,
            args: [rowOf(write.expect.field), inputOf(write.expect.key)],
          }),
        ]),
  ]

  const set = (target: ReadonlyArray<string>, value: Node.Node): Equation => ({
    _tag: 'WriteEquation',
    target,
    value: wrap(value),
    way: Transition.Way.set(),
  })
  const optional = (key: string, field: { readonly key: string; readonly schema: unknown }) => {
    const given = inputOf(key)
    const before = rowOf(field)
    if (!holdsNull(field.schema as Schema.Top)) {
      return Node.If({
        cond: Node.Call({ op: Null.isNullOp, args: [given] }),
        then: before,
        otherwise: given,
      })
    }
    return Node.Opaque({
      name: `${entity.name}.${field.key}:given`,
      reads: Option.some([
        ['input', key],
        ['state', 'row', field.key],
      ]),
      run: env => {
        const { input, state } = env as { input: WriteInput; state: WriteState }
        return Object.hasOwn(input, key) && input[key] !== undefined
          ? input[key]
          : state.row[field.key]
      },
    })
  }
  const setOf = (key: string, field: { readonly key: string; readonly schema: unknown }) =>
    set(['row', field.key], mayBeLeftOut(inputFields[key]!) ? optional(key, field) : inputOf(key))

  const supplied: Record<string, Schema.Top> = {}
  const state: Record<string, Schema.Top> = {}
  for (const [key, field] of Object.entries(entity.fields)) {
    state[key] = Schema.toEncoded(field.schema as unknown as Schema.Top)
  }
  const link = (relation: OneRelation): Schema.Top =>
    relation.optional ? Schema.NullOr(Schema.String) : Schema.String
  for (const { relation } of write.links) state[relation.key] = link(relation)

  const writes: Array<Equation> = []
  if (write._tag !== 'Update') {
    writes.push(set(['present'], Node.Lit({ value: write._tag === 'Insert' })))
  }
  if (write._tag !== 'Delete') {
    writes.push(...write.sets.map(({ key, field }) => setOf(key, field)))
    // A link left out points nowhere, as `Write.bind` binds it.
    writes.push(...write.links.map(({ key, relation }) => set(['row', relation.key], inputOf(key))))
    writes.push(
      ...write.increments.map(({ key, field, direction }): Equation => {
        const given = inputOf(key)
        // An amount left out moves nothing.
        const amount = mayBeLeftOut(inputFields[key]!)
          ? Node.If({
              cond: Node.Call({ op: Null.isNullOp, args: [given] }),
              then: Node.Lit({ value: 0 }),
              otherwise: given,
            })
          : given
        const by = direction === 'decrement' ? Node.Call({ op: Num.negOp, args: [amount] }) : amount
        return {
          _tag: 'WriteEquation',
          target: ['row', field.key],
          value: wrap(Node.Call({ op: Num.addOp, args: [rowOf(field), by] })),
          way: Transition.Way.add({ amount: by }),
        }
      }),
    )
    writes.push(
      ...write.assignments.map(({ field }, at) =>
        set(['row', field.key], underState(write, assigned[at]!)),
      ),
    )
    let viewing: string | undefined
    for (const each of write.context) {
      const { name, schema } = suppliedFor(write, each)
      if (each.value._tag === 'Viewer') {
        const asker = each.value.entity.name
        if (viewing !== undefined && viewing !== asker) {
          fail(write, `its context asks for the viewer as a ${viewing} and as a ${asker}`)
        }
        viewing = asker
      }
      supplied[name] = schema
      if (each.member._tag === 'Relation') state[each.member.key] = link(each.member)
      writes.push(set(['row', each.member.key], read(['supplied', name], schema)))
    }
    if (write.expect !== undefined) {
      const { field } = write.expect
      writes.push(
        set(
          ['row', field.key],
          Node.Opaque({
            name: `${entity.name}.${field.key}:revision`,
            reads: Option.some([['state', 'row', field.key]]),
            run: env => {
              const held = (env as { state: WriteState }).state.row[field.key]
              return typeof held === 'number' ? held + 1 : null
            },
          }),
        ),
      )
    }
  }
  return {
    _tag: 'Transition',
    stateSchema: Option.some(
      Schema.Struct({
        present: Schema.Boolean,
        row: Schema.Struct(state),
      }) as unknown as Schema.Codec<WriteState>,
    ),
    inputSchema: Option.some(
      Schema.toEncoded(write.input.schema) as unknown as Schema.Codec<WriteInput>,
    ),
    suppliedSchema: Option.some(Schema.Struct(supplied) as unknown as Schema.Codec<WriteSupplied>),
    when: wrap(joined(Bool.andOp, guard)) as WriteTransition['when'],
    writes,
    emits: [],
  }
}

/**
 * What `transitionOf(write)` is supplied when it runs, read once: the viewer's
 * id, the time, and what a path from the viewer's row reads (through `read`,
 * one row at a time). `unfilled` names each member there is no value for, as
 * `Write.contextValues` does; a caller refuses such a write, since `supplied`
 * lacks the value.
 */
export const suppliedOf = <E, R>(
  write: AnyWrite,
  by: ExprContext,
  read: ContextRead<E, R>,
): Effect.Effect<
  { readonly supplied: WriteSupplied; readonly unfilled: ReadonlyArray<string> },
  E,
  R
> =>
  Effect.map(Write.contextValues(write, by, read), ({ values, unfilled }) => {
    const supplied: Record<string, unknown> = {}
    const missing = new Set(unfilled)
    for (const each of write.context) {
      const { name } = suppliedFor(write, each)
      const { value, member } = each
      Match.valueTags(value, {
        Viewer: ({ entity }) => {
          supplied[name] = Option.getOrNull(viewerIdOf(entity, by))
        },
        Now: () =>
          Option.match(by.now, {
            onNone: () => void missing.add(member.key),
            onSome: now => void (supplied[name] = now),
          }),
        ViewerPath: () => {
          if (!missing.has(member.key)) supplied[name] = values[member.key]
        },
      })
    }
    return { supplied, unfilled: [...missing] }
  })
