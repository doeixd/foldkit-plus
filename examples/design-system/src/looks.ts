/**
 * The themes the page can show, as the run-time half of `Themes` takes them:
 * names, the initial one and the root attribute, with no compiled theme behind
 * them. The names are typed from the compiled set by a type-only import, so a
 * theme renamed in `appStyle.ts` is a type error here.
 */
import { Schema } from 'effect'
import type { ThemeNames } from 'foldkit-mixins/theme/runtime'
import type { themes } from './appStyle.js'
import { initialTheme, themeAttribute, themeNames } from './themeData.js'

export type ThemeName = (typeof themes)['names'][number]
export const ThemeName = Schema.Literals(themeNames)

export const looks: ThemeNames<ThemeName> = {
  names: themeNames,
  initial: initialTheme,
  attribute: themeAttribute,
}

/** The theme the root element shows now: what the head script applied. */
export const shownTheme = (): ThemeName =>
  looks.names.find(name => name === document.documentElement.getAttribute(looks.attribute)) ??
  looks.initial
