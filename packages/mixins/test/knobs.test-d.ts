/**
 * Compile-time contract of a theme's knob values: each rejection alone, so an
 * excess key cannot hide a wrong type. Type-checked, not executed.
 */
import { AppStyle } from '../src/app.js'
import { Theme, Themes } from '../src/theme.js'

Theme.make({
  accent: { hue: 235, chroma: 0.225, lightness: { light: 55, dark: 70 } },
  shape: { radius: 1.8, size: 'compact', controls: 'pill' },
  menu: { panel: 'inverted' },
})

// @ts-expect-error An unknown group.
Theme.make({ colour: { hue: 1 } })
// @ts-expect-error An unknown knob in a known group.
Theme.make({ shape: { radiusFactor: 1 } })
// @ts-expect-error A choice outside its options.
Theme.make({ shape: { size: 'huge' } })
// @ts-expect-error A string where a number goes.
Theme.make({ shape: { radius: '1.8' } })
// @ts-expect-error A scheme the value does not have.
Theme.make({ accent: { lightness: { dim: 40 } } })

Theme.make({}).pipe(Theme.set({ shape: { density: 0.9 } }))
// @ts-expect-error Set takes the theme's own knobs.
Theme.make({}).pipe(Theme.set({ shape: { densty: 0.9 } }))

// Themes installed by name: the initial one is one of them, and so is each one applied.
const round = Theme.make({ shape: { radius: 2 } })
const square = Theme.make({ shape: { radius: 0 } })
const themes = Themes.make({ round, square }, { initial: 'round' })
Themes.apply(themes, 'square')
// @ts-expect-error A name the set does not have.
Themes.apply(themes, 'oval')
// @ts-expect-error An initial theme the set does not have.
Themes.make({ round, square }, { initial: 'oval' })
// The palette `t` reads is typed as a theme's tokens are.
export const radius: string = AppStyle.make({ themes }).t.radius.md
