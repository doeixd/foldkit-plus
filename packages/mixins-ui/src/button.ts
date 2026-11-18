import { view as buttonView, type ButtonAttributes } from '@foldkit/ui/button'
import {
  Attr,
  Capability,
  Event,
  Slot,
  Slots,
  type NamedStyle,
  type SlotAttributes,
} from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'
import { wordsOf } from './words.js'

/**
 * The button publishes the button and the boxes its parts stand in: `icon`
 * before the label, `trailing` after it, `content` and `description` when
 * there is a second line, and `mark`, a corner badge or dot. `click`
 * is owned by the base `OnClick` when the button is interactive, so a Behavior
 * that adds its own click handler is a conflict rather than a second silent
 * owner.
 */
export const ButtonSlots = Slots.define({
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaDisabled, Attr.Disabled, Attr.AriaPressed],
  }),
  icon: Slot.make({ capability: Capability.Container }),
  content: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  trailing: Slot.make({ capability: Capability.Container }),
  mark: Slot.make({ capability: Capability.Container }),
})

/** The button's bundles with the attached Mixins applied. */
export type ResolvedButton<Message> = Resolved<
  ButtonAttributes<Message>,
  typeof ButtonSlots,
  Message
>

/** Applies `mixins` to the button's bundles. */
export const resolve = <Input, Message>(
  attributes: ButtonAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedButton<Message> => resolveFor(ButtonSlots, mixins, context)(attributes)

/** The button's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedButton<Message>) => Html,
  ) =>
  (attributes: ButtonAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))

export interface ButtonWords {
  /** A link that opens a new tab says so to a screen reader. */
  readonly external: string
}

/** The defaults, in English: text with `{blanks}`, as the other widgets' words. */
export const words: ButtonWords = { external: 'Opens in a new tab' }

interface ButtonCommon<Message> {
  /**
   * The button's text, and its accessible name. The recipe's `icon` variant
   * hides it from sight and draws the `icon` alone.
   */
  readonly label: string
  /** A drawing before the label (an `svg`), hidden from assistive technology. */
  readonly icon?: Html | undefined
  /**
   * A drawing after the label: a count, a chevron, a shortcut. It is read as
   * drawn, so a decorative one (a chevron) carries its own `aria-hidden`.
   */
  readonly trailing?: Html | undefined
  /** A second line of text under the label, which names the button with it. */
  readonly description?: string | undefined
  /**
   * A badge or a dot on the button's corner. It is not hidden, so a count in
   * it is read; a bare dot needs the meaning in `label` or its own text.
   */
  readonly mark?: Html | undefined
  /** A style of `ButtonSlots`, for the button's own look. */
  readonly style?: NamedStyle<typeof ButtonSlots> | undefined
  /** Mixins beside the style, for state or behavior the style does not own. */
  readonly mixins?: MixinList<Message> | undefined
  /** What an input-driven Mixin reads; omit it when no attached Mixin reads one. */
  readonly input?: unknown
  readonly disabled?: boolean | undefined
  /**
   * The button's value is refused, and the recipe says so (`data-invalid`).
   * Not `aria-invalid`: a button's role does not take it, so the reason
   * belongs in text the application draws and points at with `aria-describedby`.
   */
  readonly invalid?: boolean | undefined
  /**
   * The button's work is under way: `aria-busy`, `data-busy`, and a press does
   * nothing (a submit button stops submitting too, since the press would
   * otherwise send the form again). It stays focusable. The spinner is the
   * application's, in `icon`: the button draws none, so no page pays for one.
   */
  readonly busy?: boolean | undefined
  /**
   * Whether the button is on, as a toggle button: `aria-pressed`, and the
   * recipe's pressed look. Omit it for a button that is not a toggle.
   */
  readonly pressed?: boolean | undefined
  /** The button's own words. */
  readonly words?: Partial<ButtonWords> | undefined
  /**
   * Attributes another component hands this button, added to its Slot before
   * the mixins resolve, as `PasswordInput.view`'s are: a Dialog's
   * `initialFocus`, so the dialog opens on it. A class among them joins the
   * recipe's, and an owned event or attribute among them is a conflict.
   */
  readonly attributes?: { readonly [K in keyof typeof ButtonSlots]?: SlotAttributes<Message> }
}

/**
 * A button in one call: the label, a style for its slot, and the rest of
 * `@foldkit/ui`'s own config. It presses (`onClick`, `type`) or it is a link
 * (`href`, `external`), never both; `toView` stays for a control drawn as
 * something else (a split control).
 */
export type ButtonView<Message> = ButtonCommon<Message> &
  (
    | {
        readonly type?: 'button' | 'submit' | 'reset' | undefined
        readonly onClick?: NoInfer<Message> | undefined
        readonly href?: undefined
        readonly external?: undefined
      }
    | {
        /** Draws the button as a link, without a `type` or a click. */
        readonly href: string
        /** Open in a new tab, and say so to a screen reader. */
        readonly external?: boolean | undefined
        readonly type?: undefined
        readonly onClick?: undefined
      }
  )

/** What a Button is given once: its look and each option that holds no Message, state or drawing. */
export type ButtonPreset = Pick<ButtonCommon<never>, 'style' | 'words'> & {
  readonly type?: 'button' | 'submit' | 'reset' | undefined
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Button: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. `mixins` concatenate in that
 * order and `words` merge word by word; a style given at the call replaces
 * the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<ButtonPreset, Names>,
): {
  readonly view: <Outer>(
    options: ButtonView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})

export const view = <Message>(options: ButtonView<Message>, h: HtmlBuilder<Message>): Html => {
  const text = wordsOf(words, options.words)
  const busy = options.busy === true
  return buttonView(
    {
      // A busy submit would send the form again: it stops being one while the work is under way.
      ...(options.type === undefined ? {} : { type: busy ? 'button' : options.type }),
      ...(options.disabled === undefined ? {} : { isDisabled: options.disabled }),
      ...(options.onClick === undefined || busy ? {} : { onClick: options.onClick }),
      toView: attributes => {
        const marks: SlotAttributes<Message> = [
          ...(options.pressed === undefined ? [] : [h.AriaPressed(String(options.pressed))]),
          ...(options.invalid === true ? [h.DataAttribute('invalid', '')] : []),
          ...(busy ? [h.AriaBusy(true), h.DataAttribute('busy', '')] : []),
        ]
        const external = options.external === true
        // An anchor is focusable and activates on its own: it takes the disabled marks and no
        // `type`, `tabindex` or click. A disabled link has no `href`, so it goes nowhere.
        const own: SlotAttributes<Message> =
          options.href === undefined
            ? attributes.button
            : [
                ...(options.disabled === true
                  ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')]
                  : [
                      h.Href(options.href),
                      ...(external
                        ? [
                            h.Target('_blank'),
                            h.Rel('noopener noreferrer'),
                            h.AriaDescription(text.external),
                          ]
                        : []),
                    ]),
              ]
        const base: SlotAttributes<Message> = [
          ...own,
          ...marks,
          ...(options.attributes?.button ?? []),
        ]
        const slots = resolveFor(
          ButtonSlots,
          [
            ...(options.style === undefined ? [] : [options.style.mixin]),
            ...(options.mixins ?? []),
          ],
          { input: options.input, h },
        )({
          ...attributes,
          button: base,
          icon: options.attributes?.icon ?? [],
          content: options.attributes?.content ?? [],
          description: options.attributes?.description ?? [],
          trailing: options.attributes?.trailing ?? [],
          mark: options.attributes?.mark ?? [],
        })
        const children: ReadonlyArray<Html | string> = [
          ...(options.icon === undefined
            ? []
            : [h.span([...slots.icon, h.AriaHidden(true)], [options.icon])]),
          ...(options.description === undefined
            ? [options.label]
            : [
                h.span(slots.content, [
                  options.label,
                  h.span(slots.description, [options.description]),
                ]),
              ]),
          ...(options.trailing === undefined ? [] : [h.span(slots.trailing, [options.trailing])]),
          ...(options.mark === undefined ? [] : [h.span(slots.mark, [options.mark])]),
        ]
        return options.href === undefined
          ? h.button(slots.button, children)
          : h.a(slots.button, children)
      },
    },
    h,
  )
}
