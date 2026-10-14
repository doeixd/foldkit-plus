/**
 * `foldkit-mixins/theme`: the root export's `Theme` plus the page-level
 * pieces. `root` and `scoped` turn tokens into unlayered `:root` and
 * selector rules for `Style.stylesheet`; `tokens` is the shipped set of
 * non-color scales; `oklch` derives a whole palette from a few knobs;
 * `schemeScript` and `chooseScheme` keep a reader's light or dark choice.
 */
import * as Core from './theme/core.js'
import { oklch } from './theme/oklch.js'
import { root, scoped } from './theme/root.js'
import { chooseScheme, currentScheme, schemeScript } from './theme/scheme.js'
import { breakpointWidths, inContainer, tokens } from './theme/tokens.js'

export { compose, define, lightDark, ref, variables, VAR_PREFIX } from './theme/core.js'
export type { Refs, Theme as ThemeValue, ThemeTokens } from './theme/core.js'
export { root, scoped } from './theme/root.js'
export type { Overrides, RootOptions } from './theme/root.js'
export { breakpointWidths, inContainer, tokens } from './theme/tokens.js'
export type { Tokens } from './theme/tokens.js'
export { oklch } from './theme/oklch.js'
export type { OklchKnobs, OklchTheme } from './theme/oklch.js'
export { chooseScheme, currentScheme, SCHEME_KEY, schemeScript } from './theme/scheme.js'
export type { Scheme } from './theme/scheme.js'

export const Theme = {
  ...Core.Theme,
  root,
  scoped,
  tokens,
  breakpointWidths,
  inContainer,
  oklch,
  schemeScript,
  chooseScheme,
  currentScheme,
} as const
