/**
 * `/create`'s theme in its address, so a reload or a shared link comes back
 * to the same theme: `?accent.hue=145&type.body=mono&scheme=dark`. Only what
 * differs from the default theme is written, by the knob's path; a schemed
 * knob's dark value is `path.dark`. Read back, each value crosses its knob's
 * schema before it is kept, and a number is fitted to its slider; a name or a
 * value that is none of the knobs' is dropped. An address of the flat names
 * `/create` wrote before (`?hue=145&font=mono`) reads as the same theme.
 */
import { Option, Schema } from 'effect'
import { Theme } from 'foldkit-mixins/theme'

import { Canvas } from './studio.js'
import {
  Base,
  Direction,
  KnobPath,
  Scheme,
  defaults,
  fit,
  halfAt,
  knobAt,
  knobPaths,
  valueAt,
  withBase,
  withValue,
  type ThemeValues,
} from './theme.js'

/** What the address holds: the theme, and how the preview shows it. */
export interface ThemeAddress {
  readonly values: ThemeValues
  readonly scheme: Scheme
  readonly canvas: Canvas
  readonly direction: Direction
}

const SCHEME = 'scheme'
const VIEW = 'view'
const DIRECTION = 'direction'
const DARK = '.dark'

const fontName = (stack: unknown): Option.Option<string> =>
  Option.fromNullishOr(Object.entries(Theme.fonts).find(([, each]) => each === stack)?.[0])

/** A knob's value as the text of a param: a font by its name where it has one. */
const textOf = (path: KnobPath, value: unknown): string =>
  knobAt(path).control.kind === 'font'
    ? Option.getOrElse(fontName(value), () => String(value))
    : String(value)

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** The query `address` is, without its `?`; empty for the default theme. */
export const queryOf = (address: ThemeAddress): string => {
  const params = new URLSearchParams()
  for (const path of knobPaths) {
    const value = valueAt(address.values, path)
    const base = valueAt(defaults, path)
    if (same(value, base)) continue
    if (typeof value === 'object' && value !== null) {
      // Each half that differs from the default's, under a name of its own.
      const halves: { readonly light?: unknown; readonly dark?: unknown } =
        typeof base === 'object' && base !== null ? base : { light: base }
      if (value.light !== undefined && value.light !== halves.light)
        params.set(path, textOf(path, value.light))
      if (value.dark !== undefined && value.dark !== halves.dark)
        params.set(`${path}${DARK}`, textOf(path, value.dark))
    } else params.set(path, textOf(path, value))
  }
  if (address.scheme !== 'system') params.set(SCHEME, address.scheme)
  if (address.canvas !== 'components') params.set(VIEW, address.canvas)
  if (address.direction !== 'ltr') params.set(DIRECTION, address.direction)
  return params.toString()
}

/** The text of a param as the value its knob takes, fitted to a slider. */
const valueOf = (path: KnobPath, raw: string, dark: boolean): Option.Option<unknown> => {
  const { control } = halfAt(path, dark)
  switch (control.kind) {
    case 'range': {
      const value = Number(raw)
      return Number.isFinite(value) ? Option.some(fit(control, value)) : Option.none()
    }
    // A font by its name only: a link sets no stack of its own.
    case 'font':
      return raw === 'inherit'
        ? Option.some(raw)
        : Option.fromNullishOr(Object.entries(Theme.fonts).find(([name]) => name === raw)?.[1])
    case 'choice':
      return Option.some(raw)
  }
}

/** `values` with the param `path` = `raw` over them, or as they were where it is none of the knob's. */
const read = (values: ThemeValues, path: KnobPath, raw: string, dark: boolean): ThemeValues =>
  valueOf(path, raw, dark).pipe(
    Option.map(value => {
      const current = valueAt(values, path)
      if (typeof current !== 'object' || current === null) return dark ? current : value
      return dark ? { ...current, dark: value } : { ...current, light: value }
    }),
    Option.flatMap(Schema.decodeUnknownOption(knobAt(path).schema)),
    Option.match({ onNone: () => values, onSome: value => withValue(values, path, value) }),
  )

/** The flat names `/create` wrote before, each as the path it is now. */
const legacy: Readonly<Record<string, readonly [KnobPath, boolean]>> = {
  hue: ['accent.hue', false],
  chroma: ['accent.chroma', false],
  lightness: ['accent.lightness', false],
  surfaceSaturation: ['surface.saturation', false],
  surfaceContrast: ['surface.contrast', false],
  surfaceLightness: ['surface.lightness', false],
  surfaceLightnessDark: ['surface.lightness', true],
  outlines: ['shape.outlines', false],
  radius: ['shape.radius', false],
  density: ['shape.density', false],
  border: ['shape.border', false],
  size: ['shape.size', false],
  controlShape: ['shape.controls', false],
  motion: ['motion.scale', false],
  shadow: ['shadow.strength', false],
  shadowStyle: ['shadow.style', false],
  relief: ['shadow.relief', false],
  font: ['type.body', false],
  hover: ['surface.hover', false],
  menuAccent: ['menu.highlight', false],
  menuColor: ['menu.panel', false],
  easing: ['motion.easing', false],
  headingFont: ['type.heading', false],
  textScale: ['type.scale', false],
  headingScale: ['type.headingScale', false],
  leading: ['type.leading', false],
  headingWeight: ['type.headingWeight', false],
  tracking: ['type.headingTracking', false],
  scaleChroma: ['scales.chroma', false],
}

const isPath = Schema.is(KnobPath)

/** The theme `query` names, over the default one; what it names wrongly is passed over. */
export const addressOf = (query: string): ThemeAddress => {
  const params = new URLSearchParams(query)
  let values = defaults
  for (const [name, raw] of params) {
    const dark = name.endsWith(DARK)
    const path = dark ? name.slice(0, -DARK.length) : name
    if (isPath(path)) values = read(values, path, raw, dark)
    else if (name === 'base')
      values = Option.match(Schema.decodeUnknownOption(Base)(raw), {
        onNone: () => values,
        onSome: base => withBase(values, base),
      })
    else if (Object.hasOwn(legacy, name)) {
      const [old, oldDark] = legacy[name]!
      values = read(values, old, raw, oldDark)
    }
  }
  return {
    values,
    scheme: Option.getOrElse(
      Schema.decodeUnknownOption(Scheme)(params.get(SCHEME)),
      () => 'system',
    ),
    canvas: Option.getOrElse(
      Schema.decodeUnknownOption(Canvas)(params.get(VIEW)),
      () => 'components',
    ),
    direction: Option.getOrElse(
      Schema.decodeUnknownOption(Direction)(params.get(DIRECTION)),
      () => 'ltr',
    ),
  }
}
