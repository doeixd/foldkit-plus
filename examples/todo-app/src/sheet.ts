/**
 * The page's one stylesheet, composed rather than configured: the layer order
 * first, then the scales, the palette, the element defaults, and every slot
 * style in `style.ts`, each compiled to a class named by a hash of its rule so
 * the server and the browser agree. `client.ts` injects it once.
 *
 * Every slot style is already in `app`, the last layer, placed where
 * `style.ts` defines it: layering changes a rule's class, so the sheet must
 * ship the same value the views attach, not a copy layered here. The `Layout`
 * pieces and the Button recipe those styles compose keep their own layers.
 * An unlayered rule would be refused: it would beat every layer, `app`
 * included.
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
  PageStyle,
  HeaderStyle,
  ComposerStyle,
  AddButtonStyle,
  FilterStyle,
  ItemStyle,
  ToggleStyle,
  FooterStyle,
  ClearButtonStyle,
)
