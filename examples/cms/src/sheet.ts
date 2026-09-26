/**
 * The example's stylesheet: the page's foundations, which no Slot draws — the
 * layer order, the reset, the scales and the palette, the element defaults.
 * `client.ts` injects it once. Every Style a view or a site Block's look
 * attaches brings its own rules when it draws, so none is listed here.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { theme } from './style.js'

const L = Layers.standard

export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens })),
  L.in('defaults', Defaults.all),
)
