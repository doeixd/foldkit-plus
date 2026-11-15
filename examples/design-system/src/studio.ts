/**
 * The theme panel: the named themes, the colour scheme and direction, and one
 * slider per knob. It is drawn from the generated `themeData.ts` and sends only
 * what it is handed (`on`), so the application's Model stays the one owner of
 * which theme shows and which knobs are tweaked.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { SlotView } from 'foldkit-mixins'
import { Button, Segmented, Slider } from 'foldkit-mixins-ui'
import { GhostButtonStyle, PlanStyle, SliderStyle, StudioStyle } from './style.js'
import { StudioSlots } from './slots.js'
import { knobs, themeNames } from './themeData.js'
import type { ThemeName } from './themeRuntime.js'
import { hasTweaks, tweakNames, valueOf, type TweakName, type Tweaks } from './tweaks.js'

export type Scheme = 'system' | 'light' | 'dark'
export type Direction = 'ltr' | 'rtl'

export interface StudioState {
  readonly theme: ThemeName
  readonly scheme: Scheme
  readonly dir: Direction
  readonly tweaks: Tweaks
  readonly status: string
}

export interface StudioMessages<Message> {
  readonly theme: (name: ThemeName) => Message
  readonly scheme: (scheme: Scheme) => Message
  readonly dir: (dir: Direction) => Message
  readonly tweak: (name: TweakName, value: number) => Message
  readonly reset: Message
}

export const titled = (name: string): string => `${name.charAt(0).toUpperCase()}${name.slice(1)}`

const schemes: ReadonlyArray<Scheme> = ['system', 'light', 'dark']
const directions: ReadonlyArray<Direction> = ['ltr', 'rtl']

/** The panel and its off-screen live region, as the studio's `panel` slot. */
export const studioPanel = <Message>(
  state: StudioState,
  on: StudioMessages<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const slots = SlotView.buildersFor(StudioSlots, [StudioStyle.style.mixin], { input: state, h })
  const choice = <Value extends string>(
    id: string,
    label: string,
    values: ReadonlyArray<Value>,
    chosen: Value,
    send: (value: Value) => Message,
  ): Html =>
    h.div(slots.group.attrs(), [
      h.p(slots.groupLabel.attrs(), [label]),
      Segmented.view(
        {
          id,
          label,
          options: values.map(value => ({ value, label: titled(value) })),
          pressed: [chosen],
          onPress: send,
          direction: state.dir,
          style: PlanStyle,
        },
        h,
      ),
    ])
  return h.div(slots.panel.attrs(), [
    choice('theme-choice', 'Theme', themeNames, state.theme, on.theme),
    choice('scheme-choice', 'Colour scheme', schemes, state.scheme, on.scheme),
    choice('direction-choice', 'Direction', directions, state.dir, on.dir),
    h.div(
      slots.sliders.attrs(),
      tweakNames.map(name =>
        Slider.view(
          {
            id: `tweak-${name}`,
            label: knobs[name].title,
            value: valueOf(state.theme, state.tweaks, name),
            min: knobs[name].min,
            max: knobs[name].max,
            step: knobs[name].step,
            format: value => `${value}${knobs[name].unit}`,
            showValue: true,
            onChange: value => on.tweak(name, value),
            style: SliderStyle,
          },
          h,
        ),
      ),
    ),
    h.div(slots.actions.attrs(), [
      Button.view(
        {
          label: 'Reset tweaks',
          style: GhostButtonStyle,
          disabled: !hasTweaks(state.tweaks),
          onClick: on.reset,
        },
        h,
      ),
      h.p(slots.hint.attrs(), [
        'A theme is a few knob values. Sliders move one knob over it; a theme resets them.',
      ]),
    ]),
    h.p(slots.status.attrs([h.Role('status'), h.Id('theme-status')]), [state.status]),
  ])
}
