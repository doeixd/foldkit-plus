/**
 * `Mixin` is the common algebra: a named set of per-slot contributions.
 *
 * `StaticMixin` holds only static contributions, so it stays assignable to any
 * Message universe; Style uses it. `Mixin` may hold deferred contributions and
 * is tied to one Message universe; Behavior uses it. Composition is immutable
 * and keeps the deferred form when either side is deferred.
 */
import type {
  Contribution,
  ContributionContext,
  DynamicContribution,
  SlotContribution,
  StaticContribution,
  StaticContributionMap,
} from './contribution.js'

/** What one slot's attachment asked of the slot and what it supplies, as names. */
export interface SlotMeta {
  readonly requires: {
    readonly capability?: string
    readonly events: ReadonlyArray<string>
    readonly attributes: ReadonlyArray<string>
  }
  readonly provides: ReadonlyArray<string>
  /** `input`: the contribution is a function of the view's input; `static`: it is data. */
  readonly reads: 'static' | 'input'
}

/**
 * What a view remembers of an attachment beside its contributions, written
 * once where the Mixin is made. `Behavior.forSlots` and `Style.forSlots` fill
 * it; a Mixin made with `make` or `dynamic` has none, so nothing is known of it.
 */
export interface MixinMeta {
  readonly kind: 'style' | 'behavior' | 'mixin'
  /** Per slot, what this Mixin itself declares. A composition declares nothing of its own. */
  readonly slots: Readonly<Record<string, SlotMeta>>
  /** The Mixins `compose` joined, in order. */
  readonly parts?: ReadonlyArray<{ readonly name: string; readonly meta?: MixinMeta }>
}

export interface Mixin<Message = never> {
  readonly name: string
  readonly contributions: Contribution<Message>
  readonly meta?: MixinMeta
}

export interface StaticMixin<Message = never> {
  readonly name: string
  readonly contributions: StaticContributionMap<Message>
  readonly meta?: MixinMeta
}

export type AnyMixin = Mixin<any> | StaticMixin<any>

/**
 * A Mixin acceptable in any context of `Message`. `Mixin<never>` is included
 * explicitly because a message-free dynamic Mixin (input-driven Style) does not
 * widen to `Mixin<Message>` — `HtmlBuilder` is invariant in `Message`.
 */
export type MixinFor<Message> = Mixin<Message> | StaticMixin<Message> | Mixin<never>

export const isDynamic = <Message>(
  contribution: SlotContribution<Message>,
): contribution is DynamicContribution<Message> => typeof contribution === 'function'

export const evaluate = <Message>(
  contribution: SlotContribution<Message>,
  context: ContributionContext<Message>,
): StaticContribution<Message> => (isDynamic(contribution) ? contribution(context) : contribution)

const mergeStatic = <Message>(
  left: StaticContribution<Message>,
  right: StaticContribution<Message>,
): StaticContribution<Message> => {
  const css = `${left.css ?? ''}${right.css ?? ''}`
  const globalCss = `${left.globalCss ?? ''}${right.globalCss ?? ''}`
  return Object.freeze({
    classes: Object.freeze([...(left.classes ?? []), ...(right.classes ?? [])]),
    style: Object.freeze({ ...(left.style ?? {}), ...(right.style ?? {}) }),
    attributes: Object.freeze([...(left.attributes ?? []), ...(right.attributes ?? [])]),
    mounts: Object.freeze([...(left.mounts ?? []), ...(right.mounts ?? [])]),
    ...(css === '' ? {} : { css }),
    ...(globalCss === '' ? {} : { globalCss }),
  })
}

const mergeSlot = <Message>(
  left: SlotContribution<Message>,
  right: SlotContribution<Message>,
): SlotContribution<Message> => {
  if (!isDynamic(left) && !isDynamic(right)) return mergeStatic(left, right)
  return context => mergeStatic(evaluate(left, context), evaluate(right, context))
}

// With no prototype, so a slot named `constructor` that a Mixin leaves alone reads as none.
const ownCopy = <A extends object>(contributions: A): Readonly<A> =>
  Object.freeze(Object.assign(Object.create(null), contributions))

export const make = <Message = never>(
  name: string,
  contributions: StaticContributionMap<Message>,
): StaticMixin<Message> => Object.freeze({ name, contributions: ownCopy(contributions) })

export const dynamic = <Message = never>(
  name: string,
  contributions: Contribution<Message>,
  meta?: MixinMeta,
): Mixin<Message> =>
  Object.freeze({
    name,
    contributions: ownCopy(contributions),
    ...(meta === undefined ? {} : { meta }),
  })

export const empty = <Message = never>(): StaticMixin<Message> => make('Empty', {})

export const compose = <Message = never>(
  ...mixins: ReadonlyArray<MixinFor<Message>>
): Mixin<Message> => {
  const merged: Record<string, SlotContribution<Message>> = Object.create(null)
  for (const mixin of mixins) {
    for (const [slot, contribution] of Object.entries(mixin.contributions)) {
      if (contribution === undefined) continue
      // A `Mixin<never>` may only contribute message-free data; the cast lets it
      // compose with a message-bearing Mixin under one algebra.
      const normalized = contribution as SlotContribution<Message>
      const existing = merged[slot]
      merged[slot] = existing === undefined ? normalized : mergeSlot(existing, normalized)
    }
  }
  return dynamic(
    mixins.length === 0 ? 'Empty' : mixins.map(mixin => mixin.name).join('+'),
    merged,
    Object.freeze({
      kind: 'mixin',
      slots: Object.freeze({}),
      parts: Object.freeze(
        mixins.map(mixin =>
          Object.freeze({
            name: mixin.name,
            ...(mixin.meta === undefined ? {} : { meta: mixin.meta }),
          }),
        ),
      ),
    }),
  )
}

export const contributionsFor = <Message>(
  mixin: Mixin<Message> | StaticMixin<Message>,
  slot: string,
): SlotContribution<Message> | undefined => mixin.contributions[slot]
