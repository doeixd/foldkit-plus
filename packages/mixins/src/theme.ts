/**
 * `foldkit-mixins/theme`: the root export's `Theme` plus the page-level
 * pieces. `root` and `scoped` turn tokens into unlayered `:root` and
 * selector rules for `Style.stylesheet`; `make` is a theme of typed knob
 * values, and `standard` every shipped token with a theme's knobs;
 * `schemeScript` and `chooseScheme` keep a reader's light or dark choice, and
 * `knobScript` and `chooseKnobs` the knob values of a theme they made.
 */
import * as Core from './theme/core.js'
import * as Knob from './theme/knob.js'
import {
  containerFluidProgress,
  containerFluidRatio,
  fluidRatio,
  fluidType,
} from './theme/fluid.js'
import { fonts } from './theme/fonts.js'
import {
  at,
  describe,
  make,
  paths,
  print,
  schemaOf,
  set,
  standard,
  tokensOf,
  valueAt,
  variables,
  withValue,
} from './theme/knobs.js'
import * as ThemeSet from './theme/themes.js'
import { root, scoped } from './theme/root.js'
import { chooseScheme, currentScheme, schemeScript } from './theme/scheme.js'
import { chooseKnobs, knobScript } from './theme/knobsKept.js'
import { raise, raisedSurface } from './theme/raise.js'
import {
  breakpointWidths,
  concentric,
  inContainer,
  ladder,
  nested,
  nests,
  role,
  tokens,
} from './theme/tokens.js'

export { compose, define, lightDark, ref, variables, VAR_PREFIX } from './theme/core.js'
export type { Refs, Theme as ThemeValue, ThemeTokens } from './theme/core.js'
export {
  containerFluidProgress,
  containerFluidRatio,
  fluidRatio,
  fluidType,
} from './theme/fluid.js'
export type { FluidTypeOptions, Viewport } from './theme/fluid.js'
export { root, scoped } from './theme/root.js'
export type { Overrides, RootOptions } from './theme/root.js'
export {
  breakpointWidths,
  concentric,
  inContainer,
  ladder,
  nested,
  nests,
  role,
  tokens,
} from './theme/tokens.js'
export type { FluidRole, Role, Rung, Tokens } from './theme/tokens.js'
/** The icons the shipped components draw themselves, which a pack must hold. */
export type { IconName as ChromeIcon } from './theme/iconMasks.js'
export { Knob }
export type {
  KnobAt,
  KnobSet,
  KnobTheme,
  PathOf,
  Standard,
  Values,
  ValueOf,
} from './theme/knobs.js'
export type { Choice, Control, Knob as KnobOf, Schemed, Variables } from './theme/knob.js'

/** The knobs a theme sets: `Knobs.standard`, every knob the shipped tokens read. */
export const Knobs = { standard, schema: schemaOf, paths, at, valueAt, withValue } as const

/**
 * Themes installed by name: `Themes.make({ iris, cobalt }, { initial: 'iris' })`; `Themes.apply`
 * shows one, `Themes.choose` shows and keeps it, and `Themes.script` shows the kept one before
 * the first paint.
 */
export const Themes = {
  make: ThemeSet.make,
  apply: ThemeSet.apply,
  choose: ThemeSet.choose,
  script: ThemeSet.script,
} as const
export { THEME_KEY } from './theme/themes.js'
export type { StandardTokens, Themes as ThemesOf } from './theme/themes.js'
export { raise, raisedSurface } from './theme/raise.js'
export type { Palette } from './theme/oklch.js'
export { chooseScheme, currentScheme, SCHEME_KEY, schemeScript } from './theme/scheme.js'
export type { Scheme } from './theme/scheme.js'
export { chooseKnobs, KNOBS_FORMAT, KNOBS_KEY, knobScript } from './theme/knobsKept.js'
export type { KnobsChoice, KnobsPlace } from './theme/knobsKept.js'

export const Theme = {
  ...Core.Theme,
  root,
  scoped,
  tokens,
  standard: ThemeSet.standardOf,
  ladder,
  role,
  nested,
  nests,
  concentric,
  raise,
  raisedSurface,
  breakpointWidths,
  inContainer,
  make,
  set,
  describe,
  variables,
  tokensOf,
  print,
  fonts,
  fluidType,
  fluidRatio,
  containerFluidProgress,
  containerFluidRatio,
  scope: ThemeSet.scope,
  schemeScript,
  chooseScheme,
  currentScheme,
  knobScript,
  chooseKnobs,
} as const
