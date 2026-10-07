/**
 * One overlay policy value instead of nine subtly different overlay
 * implementations. `modal` and `nonModal` cover the two shapes; anything
 * else is an explicit `Policy`. `behaviors` turns a policy into the
 * existing pieces — `DismissLayer` marking, `FocusScope`, `ScrollLock`,
 * `HideOutside` — attached to one layer slot, with nothing reimplemented:
 * the mounts are the shared implementation, and the data attributes are the
 * stack's protocol. Positioning stays per-widget (`Anchor.behavior`
 * directly): it binds a floating element to an external id, a different
 * shape than this layer policy. Presence stays CSS (`data-open`): it needs
 * a per-overlay placement, which is the Drawer's, not the policy's.
 *
 * The `DismissLayer` stack bundle itself is placed once per app, not per
 * overlay; its `Dismiss` outmessage reaches the app through the placement's
 * `onOut`, which closes the dismissed layers.
 */
import type { Declared } from 'foldkit-bundle'
import { Behavior, type NamedBehavior } from 'foldkit-mixins'
import { behavior as dismissLayerBehavior, bundle as dismissLayerBundle } from './dismiss-layer.js'
import { behavior as focusScopeBehavior } from './focus-scope.js'
import { hideOutside, scrollLock } from './layers.js'

export interface DismissPolicy {
  /** Dismiss on a press outside. Default `true`. */
  readonly outside: boolean
  /** Dismiss on Escape when topmost. Default `true`. */
  readonly escape: boolean
}

export interface FocusPolicy {
  /** Keep Tab, Shift+Tab, and stray focus inside. Default `true`. */
  readonly contain: boolean
  /** Give focus back to what had it on unmount. Default `true`. */
  readonly restore: boolean
  /** A selector inside the layer to focus first. */
  readonly initialFocus?: string
}

export interface Policy {
  readonly dismiss: DismissPolicy
  readonly focus: FocusPolicy
  /** Lock the document's scroll while mounted. */
  readonly scroll: { readonly lock: boolean }
  /** Mark everything outside inert while mounted. */
  readonly inert: boolean
}

/** A modal overlay: dismissed by Escape and outside press, focused, locked, inert. */
export const modal: Policy = {
  dismiss: { outside: true, escape: true },
  focus: { contain: true, restore: true },
  scroll: { lock: true },
  inert: true,
}

/** A modeless overlay: dismissed by Escape and outside press, focus restored, page usable. */
export const nonModal: Policy = {
  dismiss: { outside: true, escape: true },
  focus: { contain: false, restore: true },
  scroll: { lock: false },
  inert: false,
}

/**
 * The policy as behaviors, to spread into the view's pipe alongside the
 * widget's own. Conditional pieces are included or left out when the list
 * is built — a static policy per composition — so no slot carries a mount
 * its policy never uses.
 */
export const behaviors =
  <Slots>(slots: Slots) =>
  <Input, ParentMessage, StackField extends string>(options: {
    readonly stack: Declared<typeof dismissLayerBundle, StackField>
    readonly layer: keyof Slots & string
    readonly trigger?: keyof Slots & string
    readonly id: (input: Input) => string
    readonly policy: Policy
  }): ReadonlyArray<NamedBehavior<Slots, Input, ParentMessage>> => [
    dismissLayerBehavior(options.stack)(slots)<Input, ParentMessage>({
      layer: options.layer,
      ...(options.trigger === undefined ? {} : { trigger: options.trigger }),
      id: options.id,
      outsidePress: options.policy.dismiss.outside,
      escape: options.policy.dismiss.escape,
    }),
    focusScopeBehavior(slots)<Input, ParentMessage>({
      container: options.layer,
      contain: options.policy.focus.contain,
      restore: options.policy.focus.restore,
      ...(options.policy.focus.initialFocus === undefined
        ? {}
        : { initialFocus: options.policy.focus.initialFocus }),
    }),
    ...(options.policy.scroll.lock
      ? [scrollLock(slots)<Input, ParentMessage>({ container: options.layer })]
      : []),
    ...(options.policy.inert
      ? [hideOutside(slots)<Input, ParentMessage>({ container: options.layer })]
      : []),
  ]
