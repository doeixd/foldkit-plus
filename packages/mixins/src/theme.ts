/**
 * `Theme` is typed token data, not a service. Dynamic theme state (light/dark)
 * belongs in the Foldkit Model; `variables` compiles the tokens to CSS custom
 * properties so switching a class or a root style is cheap and SSR-safe.
 */
import type { StyleValue } from './style.js'
import { inline } from './style.js'

export type ThemeTokens = {
  readonly [group: string]: { readonly [name: string]: string }
}

export type Theme<T extends ThemeTokens = ThemeTokens> = T

const VAR_PREFIX = '--fk'

export const define = <T extends ThemeTokens>(tokens: T): Readonly<T> =>
  Object.freeze(
    Object.fromEntries(
      Object.entries(tokens).map(([group, names]) => [group, Object.freeze({ ...names })]),
    ),
  ) as Readonly<T>

export const variable = <T extends ThemeTokens, G extends keyof T & string>(
  _theme: T,
  group: G,
  name: keyof T[G] & string,
): string => `var(${VAR_PREFIX}-${group}-${name})`

export const variables = <T extends ThemeTokens>(theme: T): StyleValue => {
  const style: Record<string, string> = {}
  for (const [group, names] of Object.entries(theme)) {
    for (const [name, value] of Object.entries(names as Record<string, string>)) {
      style[`${VAR_PREFIX}-${group}-${name}`] = value
    }
  }
  return inline(style)
}

/**
 * A token that follows the user's color scheme with CSS `light-dark()`: no
 * JavaScript and no Model field. A theme the user chooses is the other case,
 * and belongs in the Model as a class on the root; `variables` compiles both.
 */
export const lightDark = (light: string, dark: string): string => `light-dark(${light}, ${dark})`

type Merge<A, B> = {
  readonly [G in keyof A | keyof B]: G extends keyof B
    ? G extends keyof A
      ? A[G] & B[G]
      : B[G]
    : G extends keyof A
      ? A[G]
      : never
}

/** Themes merged at definition time, later tokens winning within a group. */
export const compose = <A extends ThemeTokens, B extends ThemeTokens>(
  base: A,
  over: B,
): Readonly<Merge<A, B>> => {
  const merged: Record<string, Record<string, string>> = {}
  for (const source of [base, over]) {
    for (const [group, names] of Object.entries(source)) {
      merged[group] = { ...merged[group], ...(names as Record<string, string>) }
    }
  }
  return define(merged) as unknown as Readonly<Merge<A, B>>
}

export const Theme = { define, variable, variables, lightDark, compose } as const
