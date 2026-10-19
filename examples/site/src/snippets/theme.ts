import { AppStyle } from 'foldkit-mixins/app'
import { Theme, Themes } from 'foldkit-mixins/theme'

const theme = Theme.make({
  surface: { saturation: 0.006, contrast: 24 },
  shape: { radius: 1.4 },
  type: { body: '"Geist", ui-sans-serif, system-ui, sans-serif' },
})

export const { t, slots, forSlots, stylesheet } = AppStyle.make({
  themes: Themes.make({ theme }, { initial: 'theme' }),
})
