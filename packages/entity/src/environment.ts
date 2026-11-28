/**
 * The environment an expression reads, built from what a holder has (the
 * kernel convergence note, "What environment does an Entity expression read,
 * and how is it typed?"). Only what the nodes read is built. A value the
 * holder lacks or may not see is left out, which metakit's `Expr.judge` reads
 * as not known; a null link is `null`; the rows pointing at a row are
 * `{ rows, whole }` under `<Entity.relation`, `whole` when the holder has
 * every one.
 */
import { Option } from 'effect'
import { Node } from 'metakit'
import type { ExprContext } from './context.js'
import { relationsOf } from './descriptor.js'
import { ASKER, type OneRelation } from './expr/operand.js'
import { Held, type HeldRow, type HeldRows, type Pinned } from './held.js'
import type { EntityIdentity } from './index.js'
import { conjuncts, pinsOf as pinsOfFilter } from './pins.js'
import type { Reading, RelatedSlot } from './reading.js'
import { own, put } from './record.js'

/** What the nodes read, as a tree of segments. */
type Need = Map<string, Need>

const grow = (tree: Need, segments: ReadonlyArray<string>): Need => {
  let at = tree
  for (const segment of segments) {
    let next = at.get(segment)
    if (next === undefined) {
      next = new Map()
      at.set(segment, next)
    }
    at = next
  }
  return at
}

/** Every segment list `node` reads into `resolve`; inside a `Rows` body, the element's under its slot. */
const visit = (node: Node.Node, resolve: (segments: ReadonlyArray<string>) => Need): void =>
  Node.$match(node, {
    Lit: () => undefined,
    Path: ({ segments }) => {
      resolve(segments)
    },
    Call: ({ args }) => args.forEach(arg => visit(arg, resolve)),
    If: ({ cond, then, otherwise }) =>
      [cond, then, otherwise].forEach(each => visit(each, resolve)),
    Match: ({ on, cases, otherwise }) =>
      [on, ...cases.map(([, then]) => then), ...Option.toArray(otherwise)].forEach(each =>
        visit(each, resolve),
      ),
    // An Entity expression holds none.
    Opaque: () => undefined,
    Rows: rows =>
      Node.RowsOver.$match(rows.over, {
        List: () => {
          throw new Error('[foldkit-entity] envOf: an Entity expression folds no list')
        },
        Related: ({ of, relation }) => {
          if (!Node.$is('Path')(of)) {
            throw new Error('[foldkit-entity] envOf: related rows are asked of a path')
          }
          const element = grow(resolve(of.segments), [Node.relatedSegment(relation)])
          Node.rowsBody(rows).forEach(body =>
            visit(body, segments =>
              Node.readsEach(segments) ? grow(element, segments.slice(1)) : resolve(segments),
            ),
          )
        },
      }),
  })

/** What the judged row is, and what else the nodes may read. */
export interface EnvSource {
  readonly row: HeldRow
  /**
   * The Entity `row` (and `next`) is a row of; without it no relation of
   * theirs is followed, and what one reaches is not known.
   */
  readonly owner?: EntityIdentity<string> | undefined
  readonly next?: HeldRow | undefined
  readonly input?: Readonly<Record<string, unknown>> | undefined
  /** Who asks and when; without it `viewer` and `now` are not known. */
  readonly context?: ExprContext | undefined
  /** Where the viewer's row is found; without them its fields are not known. */
  readonly rows?: HeldRows | undefined
  /** Told each segment list left out of the environment, with the holder's reason. */
  readonly unheld?: ((segments: ReadonlyArray<string>, reason: string) => void) | undefined
}

const oneRelation = (owner: EntityIdentity<string>, key: string): OneRelation => {
  const member = own(relationsOf(owner), key)
  if (member?._tag !== 'Relation' || member.cardinality !== 'one') {
    throw new Error(`[foldkit-entity] envOf: ${owner.name}.${key} is no one relation`)
  }
  return member as OneRelation
}

/**
 * The environment `reading`'s nodes read over `source`. The values `pinned`
 * gives a holder's `pointing` are the filter's, when every exists over a
 * relation asks the same one.
 */
export const envOf = (reading: Reading, source: EnvSource): Readonly<Record<string, unknown>> => {
  const need: Need = new Map()
  for (const node of [...reading.nodes, ...reading.keys]) {
    visit(node, segments => grow(need, segments))
  }
  const input = source.input ?? {}
  const pinsOf = ({ filters }: RelatedSlot): Pinned => {
    const [first, ...rest] = filters.map(Option.getOrUndefined)
    if (first === undefined || rest.some(other => other !== first)) return new Map()
    return pinsOfFilter(conjuncts(first), input, source.context).pins
  }
  const left = (segments: ReadonlyArray<string>) => (reason: string) => {
    source.unheld?.(segments, reason)
  }
  const fill = (
    row: HeldRow,
    owner: EntityIdentity<string> | undefined,
    wanted: Need,
    at: ReadonlyArray<string>,
  ) => {
    const record: Record<string, unknown> = {}
    for (const [segment, child] of wanted) {
      const here = [...at, segment]
      if (segment.startsWith('@')) {
        if (owner === undefined) {
          left(here)('the row was given without its Entity, so no relation of it is followed')
          continue
        }
        const relation = oneRelation(owner, segment.slice(1))
        Held.match(row.follow(relation), {
          onUnheld: left(here),
          onHeld: target =>
            put(
              record,
              segment,
              Option.match(target, {
                onNone: () => null,
                onSome: reached => fill(reached, relation.target().identity, child, here),
              }),
            ),
        })
      } else if (segment.startsWith('<')) {
        const slot = reading.related.get(segment)
        if (slot === undefined) {
          throw new Error(`[foldkit-entity] envOf: no relation is held under ${segment}`)
        }
        const { rows, missing } = row.pointing(slot.relation, pinsOf(slot))
        Option.map(missing, left(here))
        put(record, segment, {
          rows: rows.map(each => fill(each, slot.relation.owner, child, [...here, '*'])),
          whole: Option.isNone(missing),
        })
      } else {
        Held.match(row.field(segment), {
          onUnheld: left(here),
          onHeld: value => put(record, segment, value ?? null),
        })
      }
    }
    return record
  }
  const env: Record<string, unknown> = {}
  const wanted = (slice: string): Need => need.get(slice) ?? new Map()
  put(env, 'row', fill(source.row, source.owner, wanted('row'), ['row']))
  if (source.next !== undefined) {
    put(env, 'next', fill(source.next, source.owner, wanted('next'), ['next']))
  }
  const given: Record<string, unknown> = {}
  // An input not given is null, as SQL binds it.
  for (const key of wanted('input').keys()) put(given, key, own(input, key) ?? null)
  put(env, 'input', given)
  const { context } = source
  if (context === undefined) return env
  Option.map(context.now, now => put(env, 'now', now))
  const viewers: Record<string, unknown> = {}
  for (const [name, child] of wanted('viewer')) {
    const entity = reading.viewers.get(name)!
    put(
      viewers,
      name,
      Option.match(
        Option.filter(context.viewer, ref => ref.entity === name),
        {
          // A visitor, or a viewer of another Entity.
          onNone: () => null,
          onSome: ({ id }) => {
            const found =
              source.rows === undefined
                ? Held.unheld<Option.Option<HeldRow>>('the holder was given no rows')
                : source.rows.find(entity, id)
            const asker = { [ASKER]: id }
            const fields: Need = new Map([...child].filter(([key]) => key !== ASKER))
            return Held.match(found, {
              onUnheld: reason => {
                left(['viewer', name])(reason)
                return asker
              },
              onHeld: row =>
                Option.match(row, {
                  // A row the reader may not see: what is read of it, its id too, is null.
                  onNone: () => {
                    const hidden: Record<string, unknown> = { ...asker }
                    for (const key of fields.keys()) put(hidden, key, null)
                    return hidden
                  },
                  onSome: held => ({
                    ...fill(held, entity.identity, fields, ['viewer', name]),
                    ...asker,
                  }),
                }),
            })
          },
        },
      ),
    )
  }
  put(env, 'viewer', viewers)
  return env
}
