/**
 * The Disclosure drawn from options: one button, its label and icon, and the
 * panel it shows, over `@foldkit/ui`'s stateless disclosure. The adapter
 * (`../disclosure.ts`) stays the rung for a layout of your own, such as the
 * button below its panel.
 */
import { view as disclosureView } from '@foldkit/ui/disclosure'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { layered, type PresetOption, type Presets } from '../configure.js'
import { resolveFor, type MixinList } from '../resolve.js'
import { DisclosureSlots } from './slots.js'

export interface DisclosureView<Outer> {
  /** Prefixes the button's and the panel's ids, unique on the page. */
  readonly id: string
  /** Whether the panel is open: `Bundles.Disclosure`'s, or the application's own. */
  readonly isOpen: boolean
  /** The state a press asks for; its type comes from `h`. */
  readonly onToggle: (isOpen: boolean) => NoInfer<Outer>
  /** The button's text, and its accessible name. */
  readonly label: string
  /** Drawn before the label: a glyph, an avatar. */
  readonly icon?: Html | undefined
  readonly content: Html | string
  /** A height the shut panel keeps as a preview of its content, such as `'3em'`; inert until open. */
  readonly peek?: string | undefined
  readonly disabled?: boolean | undefined
  readonly style?: NamedStyle<typeof DisclosureSlots> | undefined
  readonly mixins?: MixinList<Outer> | undefined
}

export const view = <Outer>(options: DisclosureView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const mixins = [
    ...(options.style === undefined ? [] : [options.style.mixin]),
    ...(options.mixins ?? []),
  ]
  return disclosureView<Outer>(
    {
      id: options.id,
      isOpen: options.isOpen,
      onToggle: options.onToggle,
      ...(options.disabled === true ? { isDisabled: true } : {}),
      toView: attributes => {
        const drawn = resolveFor(DisclosureSlots, mixins, { h })(attributes)
        return h.div(drawn.root, [
          h.button(drawn.button, [
            ...(options.icon === undefined ? [] : [h.span(drawn.icon, [options.icon])]),
            h.span(drawn.label, [options.label]),
          ]),
          drawn.animatePanel(
            h.div(drawn.panel, [options.content]),
            options.peek === undefined ? undefined : { peek: options.peek },
          ),
        ])
      },
    },
    h,
  )
}

/** What a Disclosure is given once: its look and the options that hold no Message. */
export type DisclosurePreset = Pick<DisclosureView<never>, 'peek' | 'style'> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Disclosure: `base` for every use, `presets` chosen at
 * a use with `preset`, and the call over both. `mixins` concatenate in that
 * order; any other option given at the call replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<DisclosurePreset, Names>,
): {
  readonly view: <Outer>(
    options: DisclosureView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
