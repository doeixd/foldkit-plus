/**
 * A write's context as terms of `Expr`: who asks (`Expr.viewer`) and what
 * time it is (`Expr.now`). Each is a value no row and no input holds, which
 * each side provides once: a server from its principal and its clock, a
 * client from `Remote.make`'s `viewer` and its stand-in for the time.
 */
import { Match, Option, Schema } from 'effect'
import type { FieldExpr, OneRelation } from './expr.js'
import type { AnyEntity, EntityIdentity, EntityRef, IdOf } from './index.js'

/**
 * Whoever asks, as the row they are of `target`: shaped as a `one` relation
 * to that Entity, so a path can go on from it. Its value is the row's id; for
 * a visitor, or a viewer of another Entity, it is null, which compares as
 * SQL's unknown.
 */
export interface ViewerExpr<T, Name extends string = string> {
  readonly _tag: 'Viewer'
  readonly entity: EntityIdentity<Name>
  readonly target: () => AnyEntity
  readonly schema: Schema.Codec<T, unknown>
}

/**
 * What the row of whoever asks holds, or the row reached from it through `one`
 * relations (`Expr.path(Expr.viewer(User), end)`): a field of that row. Null
 * for a visitor, a viewer of another Entity, a null link, or a row the reader
 * may not see. `Entity.sets` reads one, and so may a query body or a rule:
 * SQL reads the viewer's row under its Entity's `visible` rule, and the client
 * judges it from the rows it holds.
 */
export interface ViewerPathExpr<T> {
  readonly _tag: 'ViewerPath'
  readonly viewer: ViewerExpr<unknown>
  /** The relations followed from the viewer's row, in order; empty for a field of it. */
  readonly via: ReadonlyArray<OneRelation>
  readonly field: FieldExpr<T>
}

/** The time of the write, in milliseconds since the epoch. */
export interface NowExpr<T> {
  readonly _tag: 'Now'
  readonly schema: Schema.Codec<T, unknown>
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
    _tag: 'Viewer',
    entity: entity.identity,
    target: () => entity,
    // A ref's id travels as text, whatever the Entity's id field stores.
    schema: Schema.String as unknown as Schema.Codec<IdOf<E>, unknown>,
  })

/** `Expr.now`: the time of the write. */
export const now: NowExpr<number> = Object.freeze({ _tag: 'Now', schema: Millis })

/**
 * What a context term comes to in `context`, as an interpreter binds it: the
 * viewer's id when they are a row of the term's Entity, else null, as for a
 * visitor; the time. None when the side has no reading of the time, which is
 * not a null: an interpreter refuses what it cannot say.
 */
export const contextValue = (
  term: ViewerExpr<unknown> | NowExpr<unknown>,
  context: ExprContext,
): Option.Option<string | number | null> =>
  Match.value(term).pipe(
    Match.tagsExhaustive({
      Viewer: ({ entity }): Option.Option<string | number | null> =>
        Option.some(Option.getOrNull(viewerIdOf(entity, context))),
      Now: () => context.now,
    }),
  )

/** The viewer's id, when they are a row of `entity`. */
export const viewerIdOf = (
  entity: { readonly name: string },
  context: Pick<ExprContext, 'viewer'>,
): Option.Option<string> =>
  Option.map(
    Option.filter(context.viewer, ref => ref.entity === entity.name),
    ref => ref.id,
  )
