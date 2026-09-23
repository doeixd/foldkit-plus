/**
 * `FocusScope` as a Behavior: attaches the `foldkit-primitives/dom` Mount to a
 * container slot. No Bundle, because which element has focus is a DOM fact.
 */
import { Behavior, Capability } from 'foldkit-mixins'
import { FocusScope as FocusScopeMount } from '../dom/focus-scope.js'

export { FocusScope as mount, tabbableWithin } from '../dom/focus-scope.js'

export interface BehaviorOptions<Slots> {
  readonly container: keyof Slots & string
  /** Keep Tab, Shift+Tab, and a stray focus inside. Default `true`. */
  readonly contain?: boolean
  /** Give focus back to what had it when the container unmounts. Default `true`. */
  readonly restore?: boolean
  /** A selector inside the container to focus first. */
  readonly initialFocus?: string
}

/**
 * On insert the container focuses `initialFocus`, else its first tabbable
 * descendant, else itself; with `contain`, Tab and Shift+Tab wrap inside and
 * focus that lands outside comes back to the first tabbable; on unmount, with
 * `restore`, focus returns to the element that had it. A dialog that is not
 * a native `<dialog>`, a menu, or a command palette takes this.
 */
export const behavior =
  <Slots>(slots: Slots) =>
  <Input, ParentMessage>(
    options: BehaviorOptions<Slots>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Container },
          mount: () =>
            FocusScopeMount({
              contain: options.contain ?? true,
              restore: options.restore ?? true,
              initialFocus: options.initialFocus ?? null,
            }),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'FocusScope' },
    )
