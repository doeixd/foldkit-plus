import { Option } from 'effect'
import { Layout, Picture, type ImageAsset, type Provider } from 'foldkit-media'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { imgAttributes } from './imageAttributes.js'
import type { MixinList } from './resolve.js'

/**
 * An avatar publishes its regions as slots; it owns no state, messages, or
 * bundles. The picture stacks over the fallback initials, so the initials
 * show while it loads and where it fails; the browser owns loading. The root
 * is one image named by the person (and their status), so a screen reader
 * hears the name once, not the initials. It carries the name's hue as
 * `--fk-avatar-hue` (0 to 359, the same for the same name everywhere), for a
 * style that colours the initials by who they are. The status dot carries
 * `data-status`.
 */
export const AvatarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  fallback: Slot.make({ capability: Capability.Container }),
  image: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
})

/** Whether someone is there, shown as a dot at the avatar's lower end. */
export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline'

const statusWords: Readonly<Record<AvatarStatus, string>> = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
}

/**
 * A picture `foldkit-media` writes the candidates of: the avatar's facts, the
 * provider of its variants, and how wide the avatar is drawn in CSS pixels,
 * so a 24px avatar fetches a 48px variant, not the original.
 */
export interface AvatarPicture {
  readonly asset: ImageAsset
  readonly provider: Provider.Provider
  readonly width: number
}

/**
 * An avatar in one call: who it pictures, the picture if there is one, a
 * style for its slots, and mixins beside the style. No upstream component
 * stands behind it.
 */
export interface AvatarView<Message = never> {
  /** Who the avatar shows: its accessible name, its initials and its hue. */
  readonly name: string
  /**
   * The picture: a URL, or an `AvatarPicture` drawn with its candidates.
   * Without one, or with a provider that has no URL for it, the initials stand alone.
   */
  readonly src?: string | AvatarPicture | undefined
  /** What the disc says in place of initials taken from the name (a group's `+3`). */
  readonly initials?: string | undefined
  readonly status?: AvatarStatus | undefined
  /** The status as read aloud; the English word when omitted. */
  readonly statusLabel?: string | undefined
  /** A style of `AvatarSlots`, for the avatar's look. */
  readonly style?: NamedStyle<typeof AvatarSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(part => part.length > 0)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toLocaleUpperCase()

/** A hue from the name's characters (FNV-1a), so one person keeps one colour on every page and server. */
const hueOf = (name: string): number => {
  let hash = 0x811c9dc5
  for (const character of name) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash % 360
}

// At most one attribute list: none without a picture, or when the provider has none for it.
const pictureAttributes = <Message>(
  src: string | AvatarPicture | undefined,
  h: HtmlBuilder<Message>,
): ReadonlyArray<ReadonlyArray<Attribute<Message>>> => {
  if (src === undefined) return []
  if (typeof src === 'string') return [[h.Src(src)]]
  return Option.match(
    Picture.derive({
      asset: src.asset,
      provider: src.provider,
      layout: Layout.Fixed({ width: src.width }),
    }),
    { onNone: () => [], onSome: ({ img }) => [imgAttributes(img, h)] },
  )
}

const draw = <Message>(
  options: AvatarView<Message>,
  h: HtmlBuilder<Message>,
  rest: ReadonlyArray<Attribute<Message>>,
): Html => {
  const builders = SlotView.buildersFor(
    AvatarSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const status =
    options.status === undefined ? undefined : (options.statusLabel ?? statusWords[options.status])
  return h.div(
    builders.root.attrs([
      h.Role('img'),
      h.AriaLabel(status === undefined ? options.name : `${options.name}, ${status}`),
      h.Style({ '--fk-avatar-hue': String(hueOf(options.name)) }),
      ...rest,
    ]),
    [
      h.div(builders.fallback.attrs([h.AriaHidden(true)]), [
        options.initials ?? initialsOf(options.name),
      ]),
      // Unnamed: the root says who it is, and a picture that fails shows the initials, not its alt text.
      ...pictureAttributes(options.src, h).map(attributes =>
        h.img(builders.image.attrs([...attributes, h.Alt('')])),
      ),
      ...(options.status === undefined
        ? []
        : [h.span(builders.status.attrs([h.DataAttribute('status', options.status)]), [])]),
    ],
  )
}

export const view = <Message = never>(
  options: AvatarView<Message>,
  h: HtmlBuilder<Message>,
): Html => draw(options, h, [])

/**
 * A group publishes its frame; each avatar in it is an `AvatarSlots`
 * avatar, and the count of those left out is one more, so it takes the same
 * size and shape. The `+N`'s root carries `data-rest`, so a style can keep
 * it out of a colour by name.
 */
export const AvatarGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

/** Avatars overlapping in a row, at most `max` of them and a `+N` for the rest. */
export interface AvatarGroupView<Message = never> {
  readonly people: ReadonlyArray<Omit<AvatarView<Message>, 'style' | 'mixins'>>
  /** How many to draw before the `+N`; every one when omitted. */
  readonly max?: number | undefined
  /** The group's accessible name, such as "Editors". */
  readonly label?: string | undefined
  /** How the `+N` is read: `N more` when omitted. */
  readonly moreLabel?: ((count: number) => string) | undefined
  /** A style of `AvatarGroupSlots`, for the overlap. */
  readonly style?: NamedStyle<typeof AvatarGroupSlots> | undefined
  /** A style of `AvatarSlots` for every avatar in it, the `+N` included. */
  readonly avatarStyle?: NamedStyle<typeof AvatarSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const group = <Message = never>(
  options: AvatarGroupView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    AvatarGroupSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const max = options.max ?? options.people.length
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`Avatar.group: max must be a whole number from 1, not ${max}`)
  }
  const shown = options.people.slice(0, max)
  const rest = options.people.length - shown.length
  const avatarStyle = options.avatarStyle
  return h.div(
    builders.root.attrs([
      h.Role('group'),
      ...(options.label === undefined ? [] : [h.AriaLabel(options.label)]),
    ]),
    [
      ...shown.map(person => view({ ...person, style: avatarStyle }, h)),
      ...(rest > 0
        ? [
            draw(
              {
                name: (options.moreLabel ?? (count => `${count} more`))(rest),
                initials: `+${rest}`,
                style: avatarStyle,
              },
              h,
              [h.DataAttribute('rest', String(rest))],
            ),
          ]
        : []),
    ],
  )
}
