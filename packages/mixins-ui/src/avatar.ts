import { Option } from 'effect'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'
import { fill, wordsOf } from './words.js'

export { picture } from './avatar/picture.js'

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

/** An avatar's sizes, in rem: the recipe's `size` axis draws them, and `widthOf` reads them. */
export const sizes = { xs: 1.25, sm: 1.5, md: 2.5, lg: 3.5, xl: 5 } as const
export type AvatarSize = keyof typeof sizes

/**
 * How wide an avatar of `size` is drawn, in CSS pixels at the browser's
 * default 16px rem: the `width` an `AvatarPicture` asks its candidates for, so
 * the recipe's size is written once.
 */
export const widthOf = (size: AvatarSize): number => sizes[size] * 16

/** Whether someone is there, shown as a dot at the avatar's lower end. */
export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline'

/**
 * The words an avatar and its group draw: each status as read aloud, and the
 * group's count of those left out (`{count}` is filled).
 */
export interface AvatarWords {
  readonly online: string
  readonly away: string
  readonly busy: string
  readonly offline: string
  readonly more: string
}

export const words: AvatarWords = {
  online: 'Online',
  away: 'Away',
  busy: 'Busy',
  offline: 'Offline',
  more: '{count} more',
}

/**
 * A picture the application passes in place of a URL: it writes the `img`'s
 * attributes, or none when it has no URL (the initials then stand alone).
 * `Avatar.picture({ asset, provider, width })` makes one from `foldkit-media`;
 * it lives in a file of its own, so a page that passes `src` as text ships no
 * picture code. Implement it to draw pictures any other way.
 */
export interface AvatarPicture {
  readonly attributes: <Message>(
    h: HtmlBuilder<Message>,
  ) => Option.Option<ReadonlyArray<Attribute<Message>>>
}

/** Where the picture comes from: a URL, or an `AvatarPicture`; never both. */
export type AvatarSource =
  | { readonly src?: string | undefined; readonly picture?: undefined }
  | { readonly picture: AvatarPicture; readonly src?: undefined }

/** What an avatar shows of one person, apart from how it is styled. */
export type AvatarPerson = {
  /** Who the avatar shows: its accessible name, its initials and its hue. */
  readonly name: string
  /** What the disc says in place of initials taken from the name (a group's `+3`). */
  readonly initials?: string | undefined
  readonly status?: AvatarStatus | undefined
} & AvatarSource

/**
 * An avatar in one call: who it pictures, the picture if there is one, a
 * style for its slots, and mixins beside the style. No upstream component
 * stands behind it. Without a picture the initials stand alone.
 */
export type AvatarView<Message = never> = AvatarPerson & {
  /** The status and the group's count as read aloud; English when omitted. */
  readonly words?: Partial<AvatarWords> | undefined
  /** A style of `AvatarSlots`, for the avatar's look. */
  readonly style?: NamedStyle<typeof AvatarSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

// Not `toLocaleUpperCase`: its default locale is the runtime's, so a Turkish server and an
// English browser would draw different initials for the same name.
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(part => part.length > 0)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()

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
  options: AvatarSource,
  h: HtmlBuilder<Message>,
): ReadonlyArray<ReadonlyArray<Attribute<Message>>> => {
  if (options.picture !== undefined) {
    return Option.match(options.picture.attributes(h), {
      onNone: () => [],
      onSome: attributes => [attributes],
    })
  }
  return options.src === undefined ? [] : [[h.Src(options.src)]]
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
    options.status === undefined ? undefined : wordsOf(words, options.words)[options.status]
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
      ...pictureAttributes(options, h).map(attributes =>
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
  readonly people: ReadonlyArray<AvatarPerson>
  /** How many to draw before the `+N`; every one when omitted. */
  readonly max?: number | undefined
  /** The group's accessible name, such as "Editors". */
  readonly label?: string | undefined
  /** The statuses and the `+N`'s reading (`words.more`), for every avatar in the group. */
  readonly words?: Partial<AvatarWords> | undefined
  /** Draws around each avatar, such as a Tooltip or a link; the `+N` is not wrapped. */
  readonly wrap?: ((avatar: Html, person: AvatarPerson) => Html) | undefined
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
  const around = options.wrap ?? ((avatar: Html) => avatar)
  return h.div(
    builders.root.attrs([
      h.Role('group'),
      ...(options.label === undefined ? [] : [h.AriaLabel(options.label)]),
    ]),
    [
      ...shown.map(person =>
        around(view({ ...person, words: options.words, style: avatarStyle }, h), person),
      ),
      ...(rest > 0
        ? [
            draw(
              {
                name: fill(wordsOf(words, options.words).more, { count: rest }),
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

/** What an Avatar is given once: its look, its words, and the look of a group around it. */
export type AvatarPreset = Pick<AvatarView<never>, 'style' | 'words'> & {
  readonly groupStyle?: NamedStyle<typeof AvatarGroupSlots> | undefined
  readonly mixins?: MixinList<never>
}

// A preset's `style` is the avatar's, so a group's avatars wear it; the group's own is `groupStyle`.
const forGroup = (preset: AvatarPreset): Partial<AvatarGroupView<never>> => ({
  ...(preset.groupStyle === undefined ? {} : { style: preset.groupStyle }),
  ...(preset.style === undefined ? {} : { avatarStyle: preset.style }),
  ...(preset.words === undefined ? {} : { words: preset.words }),
})

/**
 * The application's own Avatar: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. A preset's `style` and `words`
 * reach a group's avatars too; its `groupStyle` is the group's own.
 */
export const configure = <const Names extends string = never>(
  config: Presets<AvatarPreset, Names>,
): {
  readonly view: <Outer>(
    options: AvatarView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
  readonly group: <Outer>(
    options: AvatarGroupView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => {
  const groups: Presets<Partial<AvatarGroupView<never>>, Names> = {
    ...(config.base === undefined ? {} : { base: forGroup(config.base) }),
    ...(config.presets === undefined
      ? {}
      : {
          presets: Object.fromEntries(
            Object.entries<AvatarPreset>(config.presets).map(([name, preset]) => [
              name,
              forGroup(preset),
            ]),
          ) as Record<Names, Partial<AvatarGroupView<never>>>,
        }),
  }
  return {
    view: (options, h) => view(layered(config, options), h),
    group: (options, h) => group(layered(groups, options), h),
  }
}
