import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An avatar publishes its regions as slots; it owns no state, messages, or
 * bundles. The picture stacks over the fallback initials: a loaded image
 * covers them, a missing one leaves its alt text, and the initials show
 * through while loading. The browser owns loading; this owns layout.
 */
export const AvatarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  fallback: Slot.make({ capability: Capability.Container }),
  image: Slot.make({ capability: Capability.Container }),
})

/**
 * An avatar in one call: who it pictures, where the picture lives, a style
 * for its slots, and mixins beside the style. No upstream component stands
 * behind it.
 */
export interface AvatarView {
  /** Who the picture shows, read when it does not load. */
  readonly name: string
  readonly src: string
  /** A style of `AvatarSlots`, for the avatar's look. */
  readonly style?: NamedStyle<typeof AvatarSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(part => part.length > 0)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toLocaleUpperCase()

export const view = (options: AvatarView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    AvatarSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(builders.root.attrs(), [
    h.div(builders.fallback.attrs([]), [initialsOf(options.name)]),
    h.img(builders.image.attrs([h.Src(options.src), h.Alt(options.name)])),
  ])
}
