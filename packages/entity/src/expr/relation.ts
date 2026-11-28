/**
 * Reading other rows (the kernel convergence note, "How is a hop through a
 * relation written, and how is `exists`?"): a hop is a `Path` through the
 * segment `@relation` (`row.@author.handle`), null where the link is null or
 * reaches no row; `Expr.exists` is metakit's `Rows` node with the fold `any`
 * over the rows pointing at a row, held under `<Entity.relation`, whose filter
 * reads the pointing row under `each`. `Expr.is` asks a row's case.
 */
import { Match, Option, type Schema } from 'effect'
import { Node } from 'metakit'
import { isExpr, loadRows } from 'metakit/build'
import type { ViewerExpr, ViewerPathExpr } from '../context.js'
import type { AnyEntity, AnyVariantEntity, EntityField, EntityRelation } from '../index.js'
import { put } from '../record.js'
import { variantsOf } from '../variants.js'
import { dependenciesOf } from './dependencies.js'
import { and, eq } from './logic.js'
import {
  asOne,
  exprOf,
  fieldNode,
  made,
  originOf,
  originTagged,
  readStored,
  relationName,
  toNode,
  type Expr,
  type FieldOrigin,
  type OneRelation,
  type Origin,
  type Predicate,
  type Reads,
  type ReadsOf,
  type ValueOf,
} from './operand.js'
import { kindOf } from './kind.js'
import { show } from './show.js'

/**
 * The most relations one path follows. Each is a subquery in SQL and a lookup
 * in memory; the deepest rule a real app here writes follows two.
 */
export const maxPathLength = 4

/** The segment under a row at which the row `relation` reaches is held. */
const hopSegment = (relation: OneRelation): string => `@${relation.key}`

/** What a path may end at on a row of `Name`: a field, a further path, or an exists. */
export type PathEnd<Name extends string> =
  | EntityField<Name, string, Schema.Constraint>
  | (Expr<any> & Reads<Name>)

/** `Expr.path`'s two starts: a relation of the judged row, or the viewer's row. */
interface PathOf {
  <Owner extends string, Target extends AnyEntity, E extends PathEnd<Target['name']>>(
    relation: EntityRelation<Owner, string, Target, 'one', boolean>,
    end: E,
  ): Expr<ValueOf<E> | null> & Reads<Owner>
  <Name extends string, E extends PathEnd<Name>>(
    viewer: ViewerExpr<any, Name>,
    end: E,
  ): ViewerPathExpr<ValueOf<E> | null>
}

/** A value checked to be a `one` relation, or refused with what to write instead. */
const oneRelation = (step: 'path' | 'exists', value: unknown): OneRelation => {
  // tag-check: open, an operand is any value a caller passed
  if ((value as { readonly _tag?: unknown } | null)?._tag !== 'Relation') {
    throw new Error(
      `[foldkit-entity] Expr.${step}: the first argument is a relation (Post.relations.author)`,
    )
  }
  return asOne(
    `Expr.${step}`,
    value,
    `; name the one relation that points back${step === 'path' ? ', with Expr.exists' : ''}`,
  )
}

/** The segments of the row `via` reaches from `start`. */
const hops = (start: ReadonlyArray<string>, via: ReadonlyArray<OneRelation>) => [
  ...start,
  ...via.map(hopSegment),
]

/** A field read on the row `via` reaches from `start`: null where none is reached. */
const reached = (
  start: ReadonlyArray<string>,
  via: ReadonlyArray<OneRelation>,
  field: FieldOrigin,
): Node.Node => readStored([...hops(start, via), field.key], field.schema, true)

/** The rows pointing through `relation` at the row `via` reaches from the judged one. */
const pointing = (
  via: ReadonlyArray<OneRelation>,
  relation: OneRelation,
  where: Option.Option<Node.Node>,
): Node.Node => {
  // The readers' folds arrive on a page with the first exists it builds.
  loadRows()
  return Node.Rows({
    fold: 'any',
    over: Node.RowsOver.Related({
      of: Node.Path({ segments: hops(['row'], via), ast: Option.none() }),
      relation: relationName(relation),
    }),
    where,
    value: Option.none(),
    set: [],
  })
}

/** Where an exists starts on the judged row: the relation it follows first, or the row's id. */
export const existsStart = (
  origin: Extract<Origin, { readonly _tag: 'Exists' }>,
): { readonly owner: { readonly name: string; readonly token: symbol }; readonly key: string } =>
  origin.via[0] ?? { owner: origin.relation.target().identity, key: 'id' }

/** What an end of a path is, read from its node: a field, a further path, or an exists. */
const endOf = (end: unknown): Node.Node => toNode(end)

/** `Expr.path` from the viewer: a field of their row, or what a path from it reads. */
const viewerPathOf = (from: AnyEntity, end: unknown): ViewerPathExpr<unknown> => {
  const onStart = (owner: { readonly token: symbol; readonly name: string }, what: string) => {
    if (owner.token !== from.identity.token) {
      throw new Error(
        `[foldkit-entity] Expr.path: the viewer is a ${from.name}, but ${what} is read on a ${owner.name}`,
      )
    }
  }
  const node = endOf(end)
  const start = ['viewer', from.name]
  const built = (via: ReadonlyArray<OneRelation>, field: FieldOrigin) =>
    Object.freeze({
      ...exprOf(made(reached(start, via, field), { _tag: 'ViewerHop', viewer: from, via, field })),
      term: 'viewerPath' as const,
    })
  const refused = (): never => {
    throw new Error(
      `[foldkit-entity] Expr.path: a path from the viewer ends at a field or a path, not ${show(exprOf(node))}`,
    )
  }
  return Option.match(originOf(node), {
    onNone: refused,
    onSome: origin =>
      Match.value(origin).pipe(
        Match.tag('Field', ({ slice, field }) => {
          if (slice !== 'row') return refused()
          onStart(field.owner, `${field.owner.name}.${field.key}`)
          return built([], field)
        }),
        Match.tag('Hop', ({ via, field }) => {
          onStart(via[0].owner, show(exprOf(node)))
          return built(via, field)
        }),
        Match.orElse(refused),
      ),
  })
}

/** `Expr.path`: `relation` followed first, then whatever `end` reads, checked to be on its target. */
const pathOf = (relation: unknown, end: unknown): Expr<unknown> => {
  if (isExpr(relation)) {
    const viewer = originTagged(relation.node, 'Viewer')
    if (Option.isSome(viewer)) return viewerPathOf(viewer.value.entity, end)
  }
  const first = oneRelation('path', relation)
  const target = first.target().identity
  const onTarget = (owner: { readonly token: symbol; readonly name: string }, what: string) => {
    if (owner.token !== target.token) {
      throw new Error(
        `[foldkit-entity] Expr.path: ${first.owner.name}.${first.key} reaches a ${target.name}, but ${what} is read on a ${owner.name}`,
      )
    }
  }
  const capped = (via: ReadonlyArray<OneRelation>, shown: () => string) => {
    if (via.length > maxPathLength) {
      throw new Error(
        `[foldkit-entity] Expr.path: ${shown()} follows more than ${maxPathLength} relations`,
      )
    }
  }
  const node = endOf(end)
  const refused = (): never => {
    throw new Error(
      `[foldkit-entity] Expr.path: a path ends at a field, a path or an exists, not ${show(exprOf(node))}`,
    )
  }
  const hop = (via: readonly [OneRelation, ...Array<OneRelation>], field: FieldOrigin) => {
    const built = made(reached(['row'], via, field), { _tag: 'Hop', via, field })
    capped(via, () => show(exprOf(built)))
    return exprOf(built)
  }
  return Option.match(originOf(node), {
    onNone: refused,
    onSome: origin =>
      Match.value(origin).pipe(
        Match.tag('Field', ({ slice, field }) => {
          if (slice !== 'row') return refused()
          onTarget(field.owner, `${field.owner.name}.${field.key}`)
          return hop([first], field)
        }),
        Match.tag('Hop', ({ via, field }) => {
          onTarget(via[0].owner, show(exprOf(node)))
          return hop([first, ...via], field)
        }),
        Match.tag('Exists', exists => {
          onTarget(existsStart(exists).owner, show(exprOf(node)))
          const via = [first, ...exists.via]
          const where = Node.$is('Rows')(node) ? node.where : Option.none<Node.Node>()
          const built = made(pointing(via, exists.relation, where), { ...exists, via })
          capped(via, () => show(exprOf(built)))
          return exprOf(built)
        }),
        Match.orElse(refused),
      ),
  })
}

/**
 * What the row reached through a `one` relation holds: a field of it, a
 * further path from it, or an exists asked of it. The first relation is the
 * judged row's own, or the viewer's row (`Expr.viewer(User)`).
 *
 * ```ts
 * Expr.eq(Expr.path(Post.relations.author, User.fields.handle), input.handle)
 * Expr.path(Note.relations.project, Expr.path(Project.relations.org, Org.fields.plan))
 * ```
 *
 * A null link, or a row the reader may not see, reaches no row: the field
 * reads null, and an exists at the end is unknown, as SQL's scalar subquery
 * is. At most `maxPathLength` relations.
 */
export const path = pathOf as PathOf

/**
 * `where`'s node read on the pointing row: each field of the row as `each`,
 * every other read as it is, each origin carried to the node built for it.
 */
const resliced = (node: Node.Node, seen: Map<Node.Node, Node.Node>): Node.Node => {
  const known = seen.get(node)
  if (known !== undefined) return known
  const again = (each: Node.Node) => resliced(each, seen)
  const rebuilt = (): Node.Node =>
    Node.$match(node, {
      Lit: lit => lit,
      Path: read => read,
      Call: ({ op, args }) => Node.Call({ op, args: args.map(again) }),
      If: ({ cond, then, otherwise }) =>
        Node.If({ cond: again(cond), then: again(then), otherwise: again(otherwise) }),
      Match: ({ on, cases, otherwise }) =>
        Node.Match({
          on: again(on),
          cases: cases.map(([value, then]) => [value, again(then)] as const),
          otherwise: Option.map(otherwise, again),
        }),
      Opaque: opaque => opaque,
      // The filter's reads were checked: no other row is reached from it.
      Rows: rows => rows,
    })
  const built = Option.match(originOf(node), {
    onNone: rebuilt,
    onSome: origin =>
      Match.value(origin).pipe(
        Match.tag('Field', ({ slice, field }) =>
          slice === 'row' ? fieldNode(field, 'each') : made(rebuilt(), origin),
        ),
        Match.tag('Call', call =>
          made(rebuilt(), {
            ...call,
            args: call.args.map(again),
            expansion: Option.map(call.expansion, again),
          }),
        ),
        Match.tag('Compare', compare =>
          made(rebuilt(), { ...compare, left: again(compare.left), right: again(compare.right) }),
        ),
        Match.tag('Contains', contains =>
          made(rebuilt(), {
            ...contains,
            value: again(contains.value),
            search: again(contains.search),
          }),
        ),
        Match.tag('NotNull', notNull =>
          made(rebuilt(), { ...notNull, operand: again(notNull.operand) }),
        ),
        // A read of the viewer or another row keeps its node: it is not the pointing row's.
        Match.orElse(() => node),
      ),
  })
  seen.set(node, built)
  return built
}

/** `Expr.exists`: the filter checked to read only the pointing row and the input. */
const existsOf = (relation: unknown, where: unknown): Predicate => {
  const through = oneRelation('exists', relation)
  const filter = Option.map(Option.fromUndefinedOr(where), given => {
    const node = toNode(given)
    if (kindOf(node) !== 'boolean') {
      throw new Error('[foldkit-entity] Expr.exists: the filter is a predicate')
    }
    const read = dependenciesOf(exprOf(node))
    const foreign = read.fields.find(field => field.owner.token !== through.owner.token)
    // A filter reading the row asked about, or a further row, would be a
    // correlation each reader has to carry: say it with a path instead.
    if (foreign !== undefined || read.next.length > 0 || read.reaches.length > 0) {
      throw new Error(
        `[foldkit-entity] Expr.exists: the filter reads ${foreign === undefined ? 'past its row' : `${foreign.entity}.${foreign.key}`}; it reads the pointing ${through.owner.name}'s own fields and the input`,
      )
    }
    return node
  })
  return exprOf(
    made(
      pointing(
        [],
        through,
        Option.map(filter, node => resliced(node, new Map())),
      ),
      { _tag: 'Exists', via: [], relation: through, where: filter },
    ),
  )
}

/**
 * Some row points at this one through `relation`, a `one` relation of another
 * Entity, and holds `where`, a predicate over that row's own fields and the
 * input:
 *
 * ```ts
 * // Posts whose author the reader follows.
 * Expr.path(Post.relations.author,
 *   Expr.exists(Follow.relations.followee, Expr.eq(Follow.fields.followerId, input.me)))
 * ```
 *
 * Only rows the reader may see are sought. Never unknown in SQL; in memory,
 * unknown when no held row holds and the holder may lack one that would.
 */
export const exists = existsOf as <
  Owner extends string,
  Target extends AnyEntity,
  W extends Predicate & Reads<Owner> = never,
>(
  relation: EntityRelation<Owner, string, Target, 'one', boolean>,
  where?: W,
) => Predicate & Reads<Target['name']>

/** The case names of an Entity with variants. */
type TagOf<E extends AnyVariantEntity> = keyof E['variants']['cases'] & string

/** A case's schemas, `_tag` aside. */
type CaseSchemas<E extends AnyVariantEntity, T extends string> = Omit<
  E['variants']['cases'][T]['fields'],
  '_tag'
>

/** A case's fields as `Expr.is` hands them out: typed as the case holds them, never null. */
export type CaseFields<E extends AnyVariantEntity, T extends string> = {
  readonly [K in keyof CaseSchemas<E, T> & string]: EntityField<E['name'], K, CaseSchemas<E, T>[K]>
}

/** A case's fields as read through a `one` relation to its Entity: a path to each. */
export type CasePaths<Owner extends string, E extends AnyVariantEntity, T extends string> = {
  readonly [K in keyof CaseSchemas<E, T> & string]: Expr<Schema.Schema.Type<
    CaseSchemas<E, T>[K]
  > | null> &
    Reads<Owner>
}

/** `Expr.is`'s two subjects: the row judged, or the row a `one` relation of it reaches. */
interface IsOf {
  <E extends AnyVariantEntity, const T extends TagOf<E>, P extends Predicate = never>(
    entity: E,
    tag: T,
    build?: (fields: CaseFields<E, T>) => P,
  ): Predicate & Reads<E['name'] | ReadsOf<P>>
  <
    Owner extends string,
    Target extends AnyVariantEntity,
    const T extends TagOf<Target>,
    P extends Predicate = never,
  >(
    relation: EntityRelation<Owner, string, Target, 'one', boolean>,
    tag: T,
    build?: (fields: CasePaths<Owner, Target, T>) => P,
  ): Predicate & Reads<Owner | ReadsOf<P>>
}

const isOf = (
  subject: unknown,
  tag: string,
  build?: (fields: Readonly<Record<string, unknown>>) => unknown,
): Predicate => {
  // tag-check: open, an operand is any value a caller passed
  const relation =
    (subject as { readonly _tag?: unknown } | null)?._tag === 'Relation'
      ? asOne('Expr.is', subject, ', which reaches no one row')
      : undefined
  const entity = relation === undefined ? (subject as AnyEntity) : relation.target()
  const variants = Option.getOrThrowWith(
    typeof entity === 'object' && entity !== null && 'identity' in entity
      ? variantsOf(entity.identity)
      : Option.none(),
    () =>
      new Error(
        '[foldkit-entity] Expr.is: the first argument is an Entity declared with Entity.defineVariants, or a one relation to one',
      ),
  )
  if (!variants.tags.includes(tag)) {
    throw new Error(
      `[foldkit-entity] Expr.is: ${entity.name} has no case "${tag}"; its cases are ${variants.tags.join(', ')}`,
    )
  }
  const stored = entity.fields as Readonly<
    Record<string, EntityField<string, string, Schema.Constraint>>
  >
  // Through a relation, each field is read on the row it reaches.
  const read = (field: EntityField<string, string, Schema.Constraint>): unknown =>
    relation === undefined ? field : pathOf(relation, field)
  const is = eq(exprOf(toNode(read(stored._tag!))), tag as never)
  if (build === undefined) return is
  const caseFields: Record<string, unknown> = {}
  for (const [key, schema] of Object.entries(variants.cases[tag]!)) {
    // The stored field, whatever a descriptor annotated on it, typed as the case holds it.
    put(caseFields, key, read(Object.freeze({ ...stored[key]!, schema })))
  }
  const asked = build(Object.freeze(caseFields))
  if (!isExpr(asked) || kindOf(asked.node) !== 'boolean') {
    throw new Error(`[foldkit-entity] Expr.is: what is asked of a ${tag} is a predicate`)
  }
  return and(is, asked as Predicate)
}

/**
 * The row is of case `tag` of an Entity declared with `Entity.defineVariants`,
 * and holds what `build` asks of that case's fields, each typed as the case
 * holds it:
 *
 * ```ts
 * Expr.is(Domain, 'Unconfirmed')
 * Expr.is(Domain, 'Available', ({ price }) => Expr.lt(price, 20))
 * // Through a one relation, the row it reaches.
 * Expr.is(Order.relations.domain, 'Available', ({ price }) => Expr.lt(price, 20))
 * ```
 *
 * It is `_tag = tag` and the predicate, so a row of another case is false,
 * never unknown, and `Expr.not` of it holds there. Through a relation, a null
 * link reaches no row and the test is unknown, as a path's field reads null.
 * Use the fields inside `build`: outside it a case's field is the stored
 * column, null on rows of other cases.
 */
export const is = isOf as IsOf
