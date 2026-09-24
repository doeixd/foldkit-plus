/**
 * The page's one stylesheet, composed rather than configured: the layer order
 * first, then the scales, the palette, the element defaults, and every slot
 * style in `style.ts`, each compiled to a class named by a hash of its rule so
 * the server and the browser agree. `client.ts` injects it once.
 *
 * Every slot style goes in `app`, the last layer, so it wins over the design
 * system beneath it. The `Layout` pieces and the Button recipe those styles
 * compose were already placed in `layouts`, `components`, and `variants`, and
 * keep those layers; `L.in` only places what is still unlayered. Leaving a slot style out of a layer is refused: an
 * unlayered rule would beat every layer, `app` included.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import {
  AddButtonStyle,
  ClearButtonStyle,
  ComposerStyle,
  FilterStyle,
  FooterStyle,
  HeaderStyle,
  ItemStyle,
  PageStyle,
  ToggleStyle,
  theme,
} from './style.js'

const L = Layers.standard

export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens })),
  L.in('defaults', Defaults.body),
  L.in('app', PageStyle),
  L.in('app', HeaderStyle),
  L.in('app', ComposerStyle),
  L.in('app', AddButtonStyle),
  L.in('app', FilterStyle),
  L.in('app', ItemStyle),
  L.in('app', ToggleStyle),
  L.in('app', FooterStyle),
  L.in('app', ClearButtonStyle),
)
