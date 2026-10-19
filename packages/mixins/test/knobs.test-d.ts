/**
 * Compile-time contract of a theme's knob values: each rejection alone, so an
 * excess key cannot hide a wrong type. Type-checked, not executed.
 */
import { Theme } from '../src/theme.js'

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
