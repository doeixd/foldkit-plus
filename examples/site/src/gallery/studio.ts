/**
 * The state `/create`'s own controls keep: the tabs that pick a pane, and a
 * Listbox for each knob with too many choices for a row. Each component owns
 * its focus and its open list; the knobs it chooses are the site's, and a
 * choice crosses into them through `pickedKnobs`, which decodes it first.
 */
import { Option, Schema } from 'effect'
import { Listbox as UiListbox, Tabs as UiTabs } from '@foldkit/ui'
import { ListboxView } from 'foldkit-mixins-ui'

import { Base, Font, HeadingFont, MenuColor, Section, bases, type Knobs } from './theme.js'

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
 * `knobs` with `value` chosen from `picker`, or nothing when the value is
 * not one of its choices. A base color brings its own surface tint.
 */
export const pickedKnobs = (knobs: Knobs, picker: Picker, value: string): Option.Option<Knobs> => {
  switch (picker) {
    case 'base':
      return Schema.decodeUnknownOption(Base)(value).pipe(
        Option.map(base => ({
          ...knobs,
          base,
          ...(base === 'accent' ? {} : { surfaceSaturation: bases[base].c }),
        })),
      )
    case 'font':
      return Schema.decodeUnknownOption(Font)(value).pipe(Option.map(font => ({ ...knobs, font })))
    case 'headingFont':
      return Schema.decodeUnknownOption(HeadingFont)(value).pipe(
        Option.map(headingFont => ({ ...knobs, headingFont })),
      )
    case 'menuColor':
      return Schema.decodeUnknownOption(MenuColor)(value).pipe(
        Option.map(menuColor => ({ ...knobs, menuColor })),
      )
  }
}
