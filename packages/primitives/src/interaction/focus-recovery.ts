/**
 * `FocusRecovery` as a Behavior: marks an owner slot and the part slots whose
 * focus it recovers, and attaches the `foldkit-primitives/dom` Mount to the
 * owner. No Bundle, because where focus is is a DOM fact; the part's own
 * `OnFocus` keeps the Model's `current` in step.
 */
import { Option } from 'effect'
import type { Attribute, HtmlBuilder } from 'foldkit/html'
import { Behavior, SlotView, type SlotItem } from 'foldkit-mixins'
import { FocusRecovery as FocusRecoveryMount, type Step } from '../dom/focus-recovery.js'
import { FOCUS_MARK } from '../dom/focusable.js'

export { FocusRecovery as mount, UNRECOVERED } from '../dom/focus-recovery.js'

/** A step in slot terms: `{ part }` names a slot of the contract. */
export type Steps<Slot extends string> = ReadonlyArray<
  Exclude<Step, { readonly part: string }> | { readonly part: Slot }
>

export interface BehaviorOptions<Slots, Input> {
  /** The slot drawn once around every part: the container the Mount watches. */
  readonly owner: keyof Slots & string
  /**
   * Each part slot and where focus goes when its element is gone, tried in
   * order until one can take it: `same` (drawn again, as after a reorder),
   * `next`, `previous`, `parent`, `stop` (the roving stop), `{ part }` (the first
   * part of that slot), `owner`. With none left, the next owner out decides;
   * with none, focus stays where the browser put it.
   */
  readonly parts: {
    readonly [Part in keyof Slots & string]?: Steps<keyof Slots & string>
  }
  /** For a tree drawn flat: the id of a row's parent row, which `parent` goes to. */
  readonly parent?: (input: Input, item: SlotItem) => Option.Option<string>
}

/**
 * Focus that was on a part goes to the part's first fallback step that can
 * take it when that part is removed, hidden, made `inert` or `disabled`; focus
 * that was moved elsewhere is never taken. The marks are drawn by the view
 * (`data-fk-focus-owner`, `data-fk-focus-part`, and for a slot drawn per item
 * `data-fk-focus-key` from `item.id`), so a server render has them.
 */
export function behavior<Slots, Input, ParentMessage>(
  bound: SlotView.Bound<Slots, Input, ParentMessage>,
): (options: BehaviorOptions<Slots, Input>) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
export function behavior<Slots>(
  slots: SlotView.Unbound<Slots>,
): <Input, ParentMessage>(
  options: BehaviorOptions<Slots, Input>,
) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
export function behavior<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
  const slots = SlotView.boundSlots(given)
  return <Input, ParentMessage>(
    options: BehaviorOptions<Slots, Input>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
    const parts = Object.entries(options.parts) as Array<[string, Steps<string>]>
    if (Object.hasOwn(options.parts, options.owner)) {
      throw new Error(`FocusRecovery: "${options.owner}" is the owner, so it cannot also be a part`)
    }
    const fallback: Record<string, Array<Step>> = Object.create(null)
    for (const [slot, steps] of parts) fallback[slot] = [...steps]
    const spec: Record<string, ReturnType<typeof Behavior.slot>> = Object.create(null)
    for (const [slot] of parts) {
      spec[slot] = Behavior.slot({
        attributes: ({
          input,
          h,
          item,
        }: {
          readonly input: Input
          readonly h: HtmlBuilder<ParentMessage>
          readonly item?: SlotItem
        }): ReadonlyArray<Attribute<ParentMessage>> => [
          h.DataAttribute(FOCUS_MARK.part, slot),
          ...(item?.id === undefined ? [] : [h.DataAttribute(FOCUS_MARK.key, item.id)]),
          ...(item === undefined || options.parent === undefined
            ? []
            : Option.match(options.parent(input, item), {
                onNone: () => [],
                onSome: id => [h.DataAttribute(FOCUS_MARK.parent, id)],
              })),
        ],
      })
    }
    // An owner is not a part: the Mount reads marks below it.
    spec[options.owner] = Behavior.slot({
      mount: () => FocusRecoveryMount({ fallback }),
      attributes: ({ h }: { readonly h: HtmlBuilder<ParentMessage> }) => [
        h.DataAttribute(FOCUS_MARK.owner, ''),
      ],
    })
    return Behavior.forSlots(slots)<Input, ParentMessage>(
      // Keyed by slot names the caller chose; `forSlots` checks each exists.
      spec as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'FocusRecovery' },
    )
  }
}
