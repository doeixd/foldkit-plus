/**
 * The knobs the theme panel moves on top of the chosen theme. A tweak is the
 * reader's own value for one knob; absent, the theme's shows. Each is written as
 * the knob's variable on `:root`, unlayered, which beats the theme layer's own
 * declarations without touching them.
 */
import { Option, Schema } from 'effect'
import { knobs, themeValues } from './themeData.js'
import type { ThemeName } from './themeRuntime.js'

export const TweakName = Schema.Literals(['hue', 'density', 'radius', 'text', 'motion', 'shadow'])
export type TweakName = typeof TweakName.Type
export const tweakNames: ReadonlyArray<TweakName> = TweakName.literals

const Tweak = Schema.Option(Schema.Number)

export const Tweaks = Schema.Struct({
  hue: Tweak,
  density: Tweak,
  radius: Tweak,
  text: Tweak,
  motion: Tweak,
  shadow: Tweak,
})
export type Tweaks = typeof Tweaks.Type

export const noTweaks: Tweaks = {
  hue: Option.none(),
  density: Option.none(),
  radius: Option.none(),
  text: Option.none(),
  motion: Option.none(),
  shadow: Option.none(),
}

const setters: { readonly [K in TweakName]: (tweaks: Tweaks, value: number) => Tweaks } = {
  hue: (tweaks, value) => ({ ...tweaks, hue: Option.some(value) }),
  density: (tweaks, value) => ({ ...tweaks, density: Option.some(value) }),
  radius: (tweaks, value) => ({ ...tweaks, radius: Option.some(value) }),
  text: (tweaks, value) => ({ ...tweaks, text: Option.some(value) }),
  motion: (tweaks, value) => ({ ...tweaks, motion: Option.some(value) }),
  shadow: (tweaks, value) => ({ ...tweaks, shadow: Option.some(value) }),
}

export const withTweak = (tweaks: Tweaks, name: TweakName, value: number): Tweaks =>
  Option.exists(tweaks[name], current => current === value) ? tweaks : setters[name](tweaks, value)

export const hasTweaks = (tweaks: Tweaks): boolean =>
  tweakNames.some(name => Option.isSome(tweaks[name]))

/** What the knob stands at: the tweak, else the chosen theme's value. */
export const valueOf = (theme: ThemeName, tweaks: Tweaks, name: TweakName): number =>
  Option.getOrElse(tweaks[name], () => themeValues[theme][name])

/** The `:root` rule that writes the tweaks, or nothing while there are none. */
export const tweaksCss = (tweaks: Tweaks): string => {
  const declared = tweakNames.flatMap(name =>
    Option.match(tweaks[name], {
      onNone: () => [],
      onSome: value => [`--fk-knob-${knobs[name].variable}:${value}${knobs[name].unit}`],
    }),
  )
  return declared.length === 0 ? '' : `:root{${declared.join(';')}}`
}
