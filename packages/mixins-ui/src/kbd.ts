import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A keyboard key publishes its slots; it owns no state, messages, or
 * bundles. It names the key to press, never an action: pair it with words.
 * A combination is a `kbd` (`combo`) holding a `kbd` per key, as HTML
 * writes one, with an optional `joiner` between the keys.
 */
export const KbdSlots = Slots.define({
  key: Slot.make({ capability: Capability.Container }),
  combo: Slot.make({ capability: Capability.Container }),
  joiner: Slot.make({ capability: Capability.Container }),
})

/**
 * A key in one call: the key it names, a style for its slot, and mixins
 * beside the style. No upstream component stands behind it.
 */
export interface KbdView<Message = never> {
  readonly key: string
  /** A style of `KbdSlots`, for the key's look. */
  readonly style?: NamedStyle<typeof KbdSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const buildersOf = <Message>(
  style: NamedStyle<typeof KbdSlots> | undefined,
  mixins: MixinList<Message> | undefined,
  h: HtmlBuilder<Message>,
) =>
  SlotView.buildersFor(
    KbdSlots,
    [...(style === undefined ? [] : [style.mixin]), ...(mixins ?? [])],
    {
      input: undefined,
      h,
    },
  )

export const view = <Message = never>(options: KbdView<Message>, h: HtmlBuilder<Message>): Html =>
  h.kbd(buildersOf(options.style, options.mixins, h).key.attrs(), [options.key])

/** A key combination: the keys pressed together, in order. */
export interface KbdCombo<Message = never> {
  readonly keys: ReadonlyArray<string>
  /**
   * Words between the keys, such as `+` for "Ctrl + K". Omit it for keys
   * that read as one, as `⌘K` does. It is read aloud with the keys.
   */
  readonly joiner?: string | undefined
  /** A style of `KbdSlots`, for the keys' look. */
  readonly style?: NamedStyle<typeof KbdSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** `Kbd.combo({ keys: ['⌘', 'K'] }, h)`: the keys in a row, inside one `kbd`. Throws on no keys. */
export const combo = <Message = never>(
  options: KbdCombo<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  if (options.keys.length === 0) {
    throw new Error('Kbd.combo: a combination needs at least one key')
  }
  const builders = buildersOf(options.style, options.mixins, h)
  const { joiner } = options
  return h.kbd(
    builders.combo.attrs(),
    options.keys.flatMap((key, index) => [
      ...(index === 0 || joiner === undefined ? [] : [h.span(builders.joiner.attrs(), [joiner])]),
      h.kbd(builders.key.attrs(), [key]),
    ]),
  )
}
