/**
 * A theme's tokens as `:root` custom properties, for the page stylesheet.
 * Unlayered: the page decides which layer with `Layers.in`.
 */
import { global, type StyleValue } from '../styleValue.js'
import { VAR_PREFIX, type ThemeTokens } from './core.js'

export interface RootOptions {
  /** Tokens present in this theme are left out, so a scale shipped in another layer goes out once. */
  readonly omit?: ThemeTokens
  /** Default `'light dark'`, so `lightDark` tokens resolve. */
  readonly colorScheme?: 'light dark' | 'light' | 'dark'
}

/**
 * Every token as `--fk-group-name:value`, in authored order. `omit` is
 * matched token by token, not group by group: two themes can both carry a
 * `knob` group (the scales' density beside a palette's hues) and only the
 * names `omit` has are skipped.
 */
const declarations = (theme: ThemeTokens, omit?: ThemeTokens): ReadonlyArray<string> =>
  Object.entries(theme).flatMap(([group, names]) =>
    Object.entries(names).flatMap(([name, value]) =>
      omit !== undefined && Object.hasOwn(omit[group] ?? {}, name)
        ? []
        : [`${VAR_PREFIX}-${group}-${name}:${value}`],
    ),
  )

export const root = (theme: ThemeTokens, options?: RootOptions): StyleValue =>
  global(
    `:root{${[...declarations(theme, options?.omit), `color-scheme:${options?.colorScheme ?? 'light dark'}`].join(';')}}`,
  )

/** Some of a theme's tokens, by the theme's own group and token names. */
export type Overrides<T extends ThemeTokens> = {
  readonly [G in keyof T]?: { readonly [N in keyof T[G]]?: string }
}

/**
 * Token overrides under `selector`: a named theme the Model selects with a
 * root attribute (`:root[data-theme="ocean"]`), a scheme the user chose
 * (`:root[data-color-scheme="dark"]`), or a subtree (`.marketing`). Which
 * one is active is the Model's fact; this only says what it means.
 *
 * `theme` is the theme being overridden and is read only for its type, so a
 * group or token it lacks is a type error rather than a variable nothing reads.
 */
export const scoped = <T extends ThemeTokens>(
  _theme: T,
  selector: string,
  overrides: Overrides<T>,
): StyleValue => {
  const tokens: Record<string, Record<string, string>> = {}
  for (const [group, names] of Object.entries(overrides)) {
    const defined: Record<string, string> = {}
    for (const [name, value] of Object.entries(names ?? {})) {
      if (typeof value === 'string') defined[name] = value
    }
    tokens[group] = defined
  }
  return global(`${selector}{${declarations(tokens).join(';')}}`)
}
