/**
 * A theme's tokens as `:root` custom properties, for the page stylesheet.
 * Unlayered: the page decides which layer with `Layers.in`.
 */
import type { StyleValue } from '../styleValue.js'
import { VAR_PREFIX, type ThemeTokens } from './core.js'

export interface RootOptions {
  /** Tokens present in this theme are left out, so a scale shipped in another layer goes out once. */
  readonly omit?: ThemeTokens
  /** Default `'light dark'`, so `lightDark` tokens resolve. */
  readonly colorScheme?: 'light dark' | 'light' | 'dark'
}

const globalPiece = (css: string): StyleValue =>
  Object.freeze({
    classes: Object.freeze([]),
    style: Object.freeze({}),
    globalCss: Object.freeze([css]),
  })

/**
 * Every token as `--fk-group-name:value`, in authored order. `omit` is
 * matched token by token, not group by group: two themes can both carry a
 * `knob` group (the scales' density beside a palette's hues) and only the
 * names `omit` has are skipped.
 */
export const declarations = (theme: ThemeTokens, omit?: ThemeTokens): ReadonlyArray<string> =>
  Object.entries(theme).flatMap(([group, names]) =>
    Object.entries(names).flatMap(([name, value]) =>
      omit !== undefined && Object.hasOwn(omit[group] ?? {}, name)
        ? []
        : [`${VAR_PREFIX}-${group}-${name}:${value}`],
    ),
  )

export const root = (theme: ThemeTokens, options?: RootOptions): StyleValue =>
  globalPiece(
    `:root{${[...declarations(theme, options?.omit), `color-scheme:${options?.colorScheme ?? 'light dark'}`].join(';')}}`,
  )

/**
 * Token overrides under `selector`: a named theme the Model selects with a
 * root attribute (`:root[data-theme="ocean"]`), a scheme the user chose
 * (`:root[data-color-scheme="dark"]`), or a subtree (`.marketing`). Which
 * one is active is the Model's fact; this only says what it means.
 */
export const scoped = (selector: string, overrides: ThemeTokens): StyleValue =>
  globalPiece(`${selector}{${declarations(overrides).join(';')}}`)
