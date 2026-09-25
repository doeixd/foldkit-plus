/**
 * The example's one stylesheet: the layer order, the reset, the scales and the
 * palette, the element defaults, and every style in `style.ts`. `client.ts`
 * injects it once.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { BuilderStyle, PagesPageStyle, PostsPageStyle, theme } from './style.js'

const L = Layers.standard

export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens })),
  L.in('defaults', Defaults.all),
  PostsPageStyle,
  PagesPageStyle,
  BuilderStyle,
)
