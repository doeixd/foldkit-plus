import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'

export const { t, slots, forSlots, stylesheet } = AppStyle.make({
  palette: Theme.compose(
    Theme.oklch({
      accent: { h: 264, c: 0.17, l: '52%' },
      surfaceSaturation: 0.006,
      surfaceContrast: '60%',
    }),
    Theme.define({
      knob: {
        'radius-factor': '1.4',
        density: '1',
        motion: '1',
        'shadow-strength': '100%',
      },
      font: { body: '"Geist", ui-sans-serif, system-ui, sans-serif', heading: 'inherit' },
    }),
  ),
})
