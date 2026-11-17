import { Theme, Themes } from '../src/theme.js'
import { applyTheme, chooseTheme, themeChanges, type ThemeNames } from '../src/theme/runtime.js'
import { knobData, type KnobData } from '../src/theme/knobData.js'

const names: ThemeNames<'soft' | 'hard'> = {
  names: ['soft', 'hard'],
  initial: 'soft',
  attribute: 'data-theme',
}

applyTheme(names, 'hard')
chooseTheme(names, 'soft', 'key')
// @ts-expect-error A name the set does not have.
applyTheme(names, 'oval')
// @ts-expect-error A name the set does not have.
chooseTheme(names, 'oval')
themeChanges(names)

// @ts-expect-error The initial theme must be one of the names.
export const bad: ThemeNames<'soft'> = { names: ['soft'], initial: 'hard', attribute: 'x' }

// The compiled themes go where the names do, and the Themes members take them unchanged.
const themes = Themes.make({ soft: Theme.make({}), hard: Theme.make({}) }, { initial: 'soft' })
applyTheme(themes, 'hard')
// @ts-expect-error A name the set does not have.
Themes.apply(themes, 'oval')

// Each knob is named by its path, and a knob with two schemes by each half.
export const density: KnobData<'shape.density'> = knobData['shape.density']
export const chromaDark: KnobData<'accent.chroma.dark'> = knobData['accent.chroma.dark']
// @ts-expect-error A knob that is not a range has no data.
knobData['type.body']
// @ts-expect-error A schemed knob is its two halves, not one.
knobData['accent.chroma']
