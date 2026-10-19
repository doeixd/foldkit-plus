/**
 * The state `/create`'s own controls keep: the tabs that pick a pane, and a
 * Listbox for each knob with too many choices for a row. Each component owns
 * its focus and its open list; the theme it chooses is the site's, and a
 * choice crosses into it through `pickedTheme`, which decodes it first.
 */
import { Option, Schema } from 'effect'
import { Listbox as UiListbox, Tabs as UiTabs, Tooltip as UiTooltip } from '@foldkit/ui'
import { ListboxView } from 'foldkit-mixins-ui'

import { Theme } from 'foldkit-mixins/theme'

import {
  Base,
  KnobPath,
  knobAt,
  knobPaths,
  Section,
  withBase,
  withValue,
  type ThemeValues,
} from './theme.js'

/** The knobs chosen from a list. */
export const Picker = Schema.Literals(['base', 'font', 'headingFont', 'menuColor'])
export type Picker = typeof Picker.Type

export const Pickers = Schema.Struct({
  base: UiListbox.Model,
  font: UiListbox.Model,
  headingFont: UiListbox.Model,
  menuColor: UiListbox.Model,
})
export type Pickers = typeof Pickers.Type

// Annotated: the inferred types name foldkit internal modules.
export const SectionTabs: ReturnType<typeof UiTabs.create<Section>> = UiTabs.create<Section>()
/** One Listbox for every picker: a choice is text until `pickedKnobs` decodes it. */
export const PickerBox: ReturnType<typeof ListboxView.create<string>> = ListboxView.create<string>()

export const pickerId = (picker: Picker) => `knob-${picker}`

export const initialPickers: Pickers = {
  base: UiListbox.init({ id: pickerId('base'), isAnimated: true }),
  font: UiListbox.init({ id: pickerId('font'), isAnimated: true }),
  headingFont: UiListbox.init({ id: pickerId('headingFont'), isAnimated: true }),
  menuColor: UiListbox.init({ id: pickerId('menuColor'), isAnimated: true }),
}

export const initialTabs = UiTabs.init({ id: 'theme-sections' })

/**
 * Everything `/create` names, each with a tooltip saying more than its name:
 * every knob, a schemed knob's dark half, and the choices that are no knob.
 */
export const Hint = Schema.Literals([
  ...knobPaths,
  'surface.lightness.dark',
  'base',
  'theme',
  'look',
])
export type Hint = typeof Hint.Type

/** A hint's Tooltip, by the hint it explains. */
export const HintTip = Schema.Struct({ hint: Hint, tooltip: UiTooltip.Model })
export const initialHints: ReadonlyArray<typeof HintTip.Type> = Hint.literals.map(hint => ({
  hint,
  tooltip: UiTooltip.init({ id: `hint-${hint}` }),
}))

/**
 * What the preview shows: every component, the type set in the theme, the
 * palette's tokens, or one of four application screens drawn in it.
 */
export const Canvas = Schema.Literals([
  'components',
  'typography',
  'palette',
  'dashboard',
  'assistant',
  'booking',
  'settings',
])
export type Canvas = typeof Canvas.Type
export const CanvasTabs: ReturnType<typeof UiTabs.create<Canvas>> = UiTabs.create<Canvas>()
export const initialCanvasTabs = UiTabs.init({ id: 'theme-canvas' })

/** The knob a picker sets, apart from the base color, which sets two. */
const pickerKnob: Readonly<Record<Exclude<Picker, 'base'>, KnobPath>> = {
  font: 'type.body',
  headingFont: 'type.heading',
  menuColor: 'menu.panel',
}

/** A font picker's value: a name of `Theme.fonts`, or `inherit` for the body's. */
const fontOf = (value: string): Option.Option<string> =>
  value === 'inherit'
    ? Option.some('inherit')
    : Option.fromNullishOr(Object.entries(Theme.fonts).find(([name]) => name === value)?.[1])

/**
 * `values` with `value` chosen from `picker`, or nothing when the value is
 * not one of its choices. A base color brings its own surface tint.
 */
export const pickedTheme = (
  values: ThemeValues,
  picker: Picker,
  value: string,
): Option.Option<ThemeValues> => {
  if (picker === 'base')
    return Schema.decodeUnknownOption(Base)(value).pipe(Option.map(base => withBase(values, base)))
  const path = pickerKnob[picker]
  const chosen = picker === 'menuColor' ? Option.some(value) : fontOf(value)
  return chosen.pipe(
    Option.flatMap(Schema.decodeUnknownOption(knobAt(path).schema)),
    Option.map(decoded => withValue(values, path, decoded)),
  )
}
