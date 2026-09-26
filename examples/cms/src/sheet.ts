/**
 * The example's one stylesheet: the layer order, the reset, the scales and the
 * palette, the element defaults, every style in `style.ts`, and every rule a
 * site Block's look can draw. `client.ts` injects it once.
 */
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { lookStyles } from './site.js'
import {
  AdminStyle,
  BuilderStyle,
  FieldStyle,
  FormStyle,
  ListStyle,
  SiteStyle,
  WritingFieldStyle,
  theme,
} from './style.js'

const L = Layers.standard

export const stylesheet = Style.stylesheet(
  L.declare,
  L.in('reset', Defaults.reset),
  L.in('tokens', Theme.root(Theme.tokens)),
  L.in('theme', Theme.root(theme, { omit: Theme.tokens })),
  L.in('defaults', Defaults.all),
  ...lookStyles,
  AdminStyle,
  FieldStyle,
  WritingFieldStyle,
  FormStyle,
  ListStyle,
  BuilderStyle,
  SiteStyle,
)
