/**
 * `foldkit-mixins/theme`: the root export's `Theme` plus the page-level
 * pieces. `root` and `scoped` turn tokens into unlayered `:root` and
 * selector rules for `Style.stylesheet`; `tokens` is the shipped set of
 * non-color scales; `oklch` derives a whole palette from a few knobs;
 * `schemeScript` and `chooseScheme` keep a reader's light or dark choice.
 */
import * as Core from './theme/core.js'
import * as Knob from './theme/knob.js'
import { describe, make, set, standard, tokensOf, variables } from './theme/knobs.js'
import { oklch } from './theme/oklch.js'
import { root, scoped } from './theme/root.js'
import { chooseScheme, currentScheme, schemeScript } from './theme/scheme.js'
import { raise, raisedSurface } from './theme/raise.js'
import {
  breakpointWidths,
  concentric,
  hardShadows,
  inContainer,
  ladder,
  nested,
  nests,
  relief,
  role,
  tokens,
} from './theme/tokens.js'

export { compose, define, lightDark, ref, variables, VAR_PREFIX } from './theme/core.js'
export type { Refs, Theme as ThemeValue, ThemeTokens } from './theme/core.js'
export { root, scoped } from './theme/root.js'
export type { Overrides, RootOptions } from './theme/root.js'
export {
  breakpointWidths,
  concentric,
  hardShadows,
  inContainer,
  ladder,
  nested,
  nests,
  relief,
  role,
  tokens,
} from './theme/tokens.js'
export type { Role, Rung, Tokens } from './theme/tokens.js'
export { oklch } from './theme/oklch.js'
export { Knob }
export type { KnobSet, KnobTheme, Standard, Values, ValueOf } from './theme/knobs.js'
export type { Control, Knob as KnobOf, Variables } from './theme/knob.js'

/** The knobs a theme sets: `Knobs.standard`, every knob the shipped tokens read. */
export const Knobs = { standard } as const
export { raise, raisedSurface } from './theme/raise.js'
export type { OklchKnobs, OklchTheme } from './theme/oklch.js'
export { chooseScheme, currentScheme, SCHEME_KEY, schemeScript } from './theme/scheme.js'
export type { Scheme } from './theme/scheme.js'

export const Theme = {
  ...Core.Theme,
  root,
  scoped,
  tokens,
  hardShadows,
  relief,
  ladder,
  role,
  nested,
  nests,
  concentric,
  raise,
  raisedSurface,
  breakpointWidths,
  inContainer,
  oklch,
  make,
  set,
  describe,
  variables,
  tokensOf,
  schemeScript,
  chooseScheme,
  currentScheme,
} as const
