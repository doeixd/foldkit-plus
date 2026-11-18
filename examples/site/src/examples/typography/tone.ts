import { Style } from 'foldkit-mixins'
import { Typography, TypographySlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { t } from '../../snippets/theme.js'

// The shipped recipe has no `tone` axis. `add` gives it one; the level still
// comes from the view, so the two never have to agree.
const Voices = Recipes.Typography.add({
  tone: { brand: { text: Style.self({ color: t.accent.ink }) } },
})

export default example({
  title: 'A tone of your own',
  slots: TypographySlots,
  recipe: Voices,
  pins: { tone: 'brand' },
  view: ({ style, h }) => Typography.view({ level: 'h3', text: 'Welcome back, Ada', style }, h),
})
