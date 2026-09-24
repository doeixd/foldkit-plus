/**
 * `foldkit-mixins/theme`: the root export's `Theme` plus the page-level
 * pieces. `root` and `scoped` turn tokens into unlayered `:root` and
 * selector rules for `Style.stylesheet`; `tokens` is the shipped set of
 * non-color scales; `oklch` derives a whole palette from a few knobs.
 */
import * as Core from './theme/core.js'
import { oklch } from './theme/oklch.js'
import { root, scoped } from './theme/root.js'
import { breakpointWidths, tokens } from './theme/tokens.js'

export { compose, define, lightDark, variable, variables, VAR_PREFIX } from './theme/core.js'
export type { Theme as ThemeValue, ThemeTokens } from './theme/core.js'
export { root, scoped } from './theme/root.js'
export type { RootOptions } from './theme/root.js'
export { breakpointWidths, tokens } from './theme/tokens.js'
export type { Tokens } from './theme/tokens.js'
export { oklch } from './theme/oklch.js'
export type { OklchKnobs, OklchTheme } from './theme/oklch.js'

export const Theme = { ...Core.Theme, root, scoped, tokens, breakpointWidths, oklch } as const
