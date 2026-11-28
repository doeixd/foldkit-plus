/**
 * A write's context as expressions: who asks (`Expr.viewer`) and what time it
 * is (`Expr.now`). Each is a value no row and no input holds, which each side
 * provides once: a server from its principal and its clock, a client from
 * `Remote.make`'s `viewer` and its stand-in for the time.
 */
import { Option, Schema } from 'effect'
import { wrap } from '@doeixd/metakit/build'
import type { AnyEntity, EntityIdentity, EntityRef, IdOf } from './index.js'
import { ASKER, made, read, type EntityEnv, type Expr } from './expr/operand.js'

/**
 * Whoever asks, as the row they are of `target` (`viewer.<Entity>`): a path
 * can go on from it. Its value is the row's id; for a visitor, or a viewer of
 * another Entity, it is null, which compares as SQL's unknown.
 */
export interface ViewerExpr<T, Name extends string = string> extends Expr<T> {
  readonly term: 'viewer'
  readonly entity: EntityIdentity<Name>
  readonly target: () => AnyEntity
}

/**
 * What the row of whoever asks holds, or the row reached from it through `one`
 * relations (`Expr.path(Expr.viewer(User), end)`): a field of that row. Null
 * for a visitor, a viewer of another Entity, a null link, or a row the reader
 * may not see. `Entity.sets` reads one, and so may a query body or a rule.
 */
export interface ViewerPathExpr<T> extends Expr<T> {
  readonly term: 'viewerPath'
}

/** The time of the write, in milliseconds since the epoch. */
export interface NowExpr<T> extends Expr<T> {
  readonly term: 'now'
}

/**
 * What the context terms read, as one side provides it: the viewer as a
 * ref, none for a visitor; the time, none where the side has no reading of
 * it (a client judging a list, which knows no time the server judged it at).
 */
export interface ExprContext {
  readonly viewer: Option.Option<EntityRef>
  readonly now: Option.Option<number>
}

const Millis = Schema.Int

/** `Expr.viewer`: whoever asks, as a row of `entity`. */
export const viewer = <E extends AnyEntity>(entity: E): ViewerExpr<IdOf<E>, E['name']> =>
  Object.freeze({
    // A ref's id travels as text, whatever the Entity's id field stores.
    ...wrap<EntityEnv, IdOf<E>>(
      made(read(['viewer', entity.name, ASKER], Schema.String, true), {
        _tag: 'Viewer',
        entity,
      }),
    ),
    term: 'viewer' as const,
    entity: entity.identity as EntityIdentity<E['name']>,
    target: () => entity,
  })

/** `Expr.now`: the time of the write. */
export const now: NowExpr<number> = Object.freeze({
  ...wrap<EntityEnv, number>(read(['now'], Millis)),
  term: 'now' as const,
})

/**
 * What a context term comes to in `context`, as a reader binds it: the
 * viewer's id when they are a row of the term's Entity, else null, as for a
 * visitor; the time. None when the side has no reading of the time, which is
 * not a null: a reader refuses what it cannot say.
 */
export const contextValue = (
  term: ViewerExpr<unknown> | NowExpr<unknown>,
  context: ExprContext,
): Option.Option<string | number | null> =>
  term.term === 'viewer'
    ? Option.some(Option.getOrNull(viewerIdOf(term.entity, context)))
    : context.now

/** A value the write's context gives: who asks, what their row holds, or when. */
export type ContextValue = ViewerExpr<unknown> | ViewerPathExpr<unknown> | NowExpr<unknown>

/** One case per kind of context value, every kind named. */
export const matchContext = <A>(
  value: ContextValue,
  cases: {
    readonly viewer: (value: ViewerExpr<unknown>) => A
    readonly viewerPath: (value: ViewerPathExpr<unknown>) => A
    readonly now: (value: NowExpr<unknown>) => A
  },
): A => {
  switch (value.term) {
    case 'viewer':
      return cases.viewer(value)
    case 'viewerPath':
      return cases.viewerPath(value)
    case 'now':
      return cases.now(value)
  }
}

/** The viewer's id, when they are a row of `entity`. */
export const viewerIdOf = (
  entity: { readonly name: string },
  context: Pick<ExprContext, 'viewer'>,
): Option.Option<string> =>
  Option.map(
    Option.filter(context.viewer, ref => ref.entity === entity.name),
    ref => ref.id,
  )
