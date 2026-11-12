/** The shipped theme's foundations, as a demo writes them into its page. */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'

const L = Layers.standard

export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('theme', Theme.root(Theme.standard())),
  L.in('defaults', Defaults.all),
)
