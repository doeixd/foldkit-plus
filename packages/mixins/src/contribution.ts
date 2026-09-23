/**
 * The normalized attachment algebra. Style and Behavior both compile to a
 * `SlotContribution`, so one resolver owns conflict and merge semantics.
 *
 * A contribution is either static data (Style) or a function of the render
 * context (`input` and the view's `h`) — Behavior uses the dynamic form so its
 * attributes are built with the Message universe of the view it is attached to.
 * `input` is `unknown` here; the Behavior authoring helpers re-narrow it.
 */
import type { Attribute, ChildAttribute, HtmlBuilder } from 'foldkit/html'
import type { MountAction } from 'foldkit/mount'

export interface StaticContribution<Message> {
  readonly classes?: ReadonlyArray<string>
  readonly style?: Readonly<Record<string, string>>
  readonly attributes?: ReadonlyArray<Attribute<Message> | ChildAttribute>
  readonly mounts?: ReadonlyArray<MountAction<Message, any>>
  /** Compiled rule CSS for a class this contribution introduces. */
  readonly css?: string
  /** Class-independent CSS this contribution introduces (keyframes, layers). */
  readonly globalCss?: string
}

/**
 * Which repetition of a slot is being resolved, when a view renders one slot
 * once per item (rows, tabs, options). The view passes it as the second
 * argument of `slots.x.attrs(base, item)`; a Behavior reads it to write
 * per-item attributes such as `tabindex`, `aria-posinset`, or an id.
 */
export interface SlotItem {
  readonly index: number
  /** The item's stable identity, when it has one: a row id, an option value. */
  readonly id?: string
  /** How many items the slot renders, when the view knows. */
  readonly count?: number
}

export interface ContributionContext<Message> {
  readonly input: unknown
  readonly h: HtmlBuilder<Message>
  /** Present only when the view resolved the slot for one item. */
  readonly item?: SlotItem
}

export type DynamicContribution<Message> = (
  context: ContributionContext<Message>,
) => StaticContribution<Message>

/**
 * A contribution that reads the view input but names no Message universe, so it
 * stays assignable to any view. Input-driven Style (`Style.whenInput`) compiles
 * to this. It never receives `h`, because a conditional style emits no handlers.
 */
export type InputContribution<Message = never> = (context: {
  readonly input: unknown
}) => StaticContribution<Message>

export type SlotContribution<Message> = StaticContribution<Message> | DynamicContribution<Message>

export type Contribution<Message> = {
  readonly [slot: string]: SlotContribution<Message> | undefined
}

export type StaticContributionMap<Message> = {
  readonly [slot: string]: StaticContribution<Message> | undefined
}
