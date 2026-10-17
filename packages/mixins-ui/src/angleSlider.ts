import { Match, Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { PointerPosition, type PointerMoved, type PointerPressed } from 'foldkit-primitives/dom'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import type { MixinList } from './resolve.js'

/**
 * A dial after Zag's angle slider: a value in degrees, 0 at the top and
 * growing clockwise, chosen by dragging a `thumb` around the `control` or by
 * the keys. The thumb is the APG's slider (`role="slider"`, the angle in
 * `aria-valuetext`); a dial has no ends, so the keys go round: Right and Up
 * step clockwise, Left and Down back, Page Up and Page Down (or Shift with
 * an arrow) take the `largeStep`, Home goes to 0 and End to the last value
 * before a full turn. The dial is a drawing, so its keys and its turn are the
 * same in either direction of text.
 *
 * The angle and whether it is being dragged are a small Model of this
 * module's, which the application keeps and folds with `update(layout)`,
 * the same `step` and `marks` the view draws. A key reaches `update` as the
 * key pressed, not the value the last frame drew, so keys faster than a frame
 * each step from the value before them. A press or drag on the control, a
 * Mount, says the angle of the pointer from its center.
 *
 * The root carries `--fk-angle` (the value, in `deg`), which the recipe turns
 * the needle and places the thumb by; each `marker` carries its own as
 * `--fk-angle-marker`, and `data-state`: `at`, `under` or `over` the value.
 */
export const AngleSliderSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  label: Slot.make({ capability: Capability.Container }),
  /** The dial; a press anywhere on it turns the thumb to the pointer. */
  control: Slot.make({ capability: Capability.Container }),
  /** A line from the center to the thumb. */
  needle: Slot.make({ capability: Capability.Base }),
  thumb: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaDisabled, Attr.AriaInvalid],
  }),
  markers: Slot.make({ capability: Capability.Container }),
  marker: Slot.make({ capability: Capability.Container }),
  markerLabel: Slot.make({ capability: Capability.Container }),
  /** The angle as the eye reads it, in the middle of the dial by default. */
  value: Slot.make({ capability: Capability.Container }),
  /** A hidden input holding the angle, drawn when the view has a `name`, for a form. */
  input: Slot.make({ capability: Capability.Base, attributes: [Attr.Value] }),
})

export const Model = Schema.Struct({
  /** Prefixes every id the dial draws; unique on the page. */
  id: Schema.String,
  /** Degrees, from 0 up to a full turn (never 360 itself). */
  value: Schema.Number,
  /** A pointer is turning the dial, from its press to its release. */
  dragging: Schema.Boolean,
})
export type Model = typeof Model.Type

// A positive angle keeps its digits: adding a turn before the remainder put float noise in 0.1.
const turn = (degrees: number) => {
  const within = degrees % 360
  return within < 0 ? within + 360 : within
}

/** A dial at `value` degrees (default 0), taken round into one turn. */
export const init = (options: {
  readonly id: string
  readonly value?: number | undefined
}): Model => ({
  id: options.id,
  value: turn(options.value ?? 0),
  dragging: false,
})

export const Message = defineMessageUnion({
  /** The pointer pressed or dragged on the control, at `angle` degrees clockwise from the top. */
  Pointed: { angle: Schema.Number },
  /** The pointer that was turning the dial was let go: the end of a change. */
  Released: {},
  /** A key on the thumb; `update` decides where it moves, from the value it has. */
  PressedKey: { key: Schema.String, shift: Schema.Boolean },
  /** Sets the angle from outside, snapped as a drag would be. */
  Set: { value: Schema.Number },
})
export type Message = typeof Message.Type

/** A value marked on the dial, with words shown beside it. */
export interface AngleMark {
  readonly value: number
  readonly label?: string | undefined
}

/** What `update` and the view agree on: the steps a value takes and the marks. */
export interface AngleSliderLayout {
  /** Degrees between values; default 1. */
  readonly step?: number | undefined
  /** What Page Up and Page Down, and Shift with an arrow, move, as the multiple of `step` nearest it; default 15. */
  readonly largeStep?: number | undefined
  readonly marks?: ReadonlyArray<AngleMark> | undefined
  /** The value is one of the `marks`: a drag lands on the nearest, and the keys go mark to mark. */
  readonly restrictToMarks?: boolean | undefined
}

const keys: ReadonlySet<string> = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
])

/** The shortest way round between two angles. */
const apart = (left: number, right: number) => {
  const gap = Math.abs(turn(left) - turn(right))
  return Math.min(gap, 360 - gap)
}

// Rounded to the step's own decimals, so 0.1 steps read 0.3 and not 0.30000000000000004.
const decimals = (step: number) => (String(step).split('.')[1] ?? '').length

/** The last value a step reaches before a full turn: 359 by ones, 357 by sevens. */
const lastOf = (step: number) => Number((Math.ceil(360 / step - 1) * step).toFixed(decimals(step)))

/**
 * The `update` for `layout`, the steps and marks the view draws; the same
 * Model when nothing changes. Built once per layout, outside the view.
 */
export const update = (layout: AngleSliderLayout = {}) => {
  const step = layout.step ?? 1
  if (!(step > 0 && step <= 360))
    throw new Error(`AngleSlider.update: step must be above 0 and at most 360, got ${step}`)
  const places = decimals(step)
  // The values are `step` times 0 up to `count - 1`; the keys move along them and go round.
  const count = Math.round(lastOf(step) / step) + 1
  const large = Math.max(1, Math.round((layout.largeStep ?? 15) / step))
  const valueAt = (place: number) =>
    Number(((((place % count) + count) % count) * step).toFixed(places))
  const placeOf = (value: number) => Math.round(value / step)
  /** The value nearest `degrees`, 0 included from the far side of a turn when no step divides it. */
  const snapped = (degrees: number) => {
    const grid = valueAt(Math.min(placeOf(turn(degrees)), count - 1))
    return apart(0, degrees) < apart(grid, degrees) ? 0 : grid
  }
  const marks = [...new Set((layout.marks ?? []).map(mark => turn(mark.value)))].sort(
    (left, right) => left - right,
  )
  if (layout.restrictToMarks === true && marks.length === 0)
    throw new Error('AngleSlider.update: restrictToMarks needs marks to keep to')
  const restricted = layout.restrictToMarks === true
  const nearest = (degrees: number) =>
    marks.reduce((best, mark) => (apart(mark, degrees) < apart(best, degrees) ? mark : best))
  const landed = (degrees: number) => (restricted ? nearest(degrees) : snapped(degrees))

  /** The next mark clockwise from `value` (or back, `by` below 0), round past the ends. */
  const nextMark = (value: number, by: number) => {
    const from = marks.findIndex(mark => mark === nearest(value))
    return marks[(from + (by > 0 ? 1 : -1) + marks.length) % marks.length] ?? value
  }

  const keyed = (value: number, key: string, shift: boolean): number => {
    const by = shift ? large : 1
    const moved = (steps: number) =>
      restricted ? nextMark(value, steps) : valueAt(placeOf(value) + steps)
    switch (key) {
      case 'Home':
        return restricted ? (marks[0] ?? value) : 0
      case 'End':
        return restricted ? (marks[marks.length - 1] ?? value) : valueAt(count - 1)
      case 'PageUp':
        return moved(large)
      case 'PageDown':
        return moved(-large)
      case 'ArrowRight':
      case 'ArrowUp':
        return moved(by)
      case 'ArrowLeft':
      case 'ArrowDown':
        return moved(-by)
      default:
        return value
    }
  }

  const at = (model: Model, value: number, dragging: boolean): Return<Model, Message> =>
    value === model.value && dragging === model.dragging
      ? { model }
      : { model: modifyFields(model, { value: () => value, dragging: () => dragging }) }

  return (model: Model, message: Message): Return<Model, Message> =>
    Message.match(message, {
      Pointed: ({ angle }) => at(model, landed(angle), true),
      Released: () => at(model, model.value, false),
      PressedKey: ({ key, shift }) => at(model, keyed(model.value, key, shift), model.dragging),
      Set: ({ value }) => at(model, landed(value), model.dragging),
    })
}

// ---------------------------------------------------------------- the control's pointer

/** The pointer's angle around the dial's center, clockwise from the top. */
const angleIn = ({ point, width, height }: PointerPressed | PointerMoved) =>
  turn((Math.atan2(point.x - width / 2, -(point.y - height / 2)) * 180) / Math.PI)

// ---------------------------------------------------------------- the view

export interface AngleSliderView<Message> extends AngleSliderLayout {
  readonly model: Model
  /** Lifts the dial's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** What the angle is of, shown and naming the slider. */
  readonly label: string
  /** The angle as shown; default `90°`. */
  readonly format?: ((value: number) => string) | undefined
  /** The angle as read aloud; default `90 degrees`. */
  readonly valueText?: ((value: number) => string) | undefined
  /** Draws the angle in the dial; default true. */
  readonly showValue?: boolean | undefined
  /** A form field name: a hidden input then holds the angle. */
  readonly name?: string | undefined
  readonly disabled?: boolean | undefined
  /** Focusable and read, but neither keys nor the pointer change it. */
  readonly readOnly?: boolean | undefined
  readonly invalid?: boolean | undefined
  /** A style of `AngleSliderSlots`, for the look. */
  readonly style?: NamedStyle<typeof AngleSliderSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const degrees = (value: number) => `${value} degrees`
const shownDegrees = (value: number) => `${value}°`

/** Where a marker stands against the value, which the recipe fills by. */
const stateOf = (marker: number, value: number) =>
  marker === value ? 'at' : marker < value ? 'under' : 'over'

export const view = <Outer>(options: AngleSliderView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const builders = SlotView.buildersFor(
    AngleSliderSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage: lift } = options
  const { value } = model
  const step = options.step ?? 1
  const format = options.format ?? shownDegrees
  const disabled = options.disabled === true
  const readOnly = options.readOnly === true
  const changes = !disabled && !readOnly
  const labelId = `${model.id}-label`
  const marks = options.marks ?? []

  return h.div(
    builders.root.attrs([
      h.Role('group'),
      h.AriaLabelledBy(labelId),
      h.Style({ '--fk-angle': `${value}deg` }),
      ...(model.dragging ? [h.DataAttribute('dragging', '')] : []),
      ...(disabled ? [h.DataAttribute('disabled', '')] : []),
      ...(readOnly ? [h.DataAttribute('readonly', '')] : []),
      ...(options.invalid === true ? [h.DataAttribute('invalid', '')] : []),
    ]),
    [
      h.span(builders.label.attrs([h.Id(labelId)]), [options.label]),
      h.div(
        builders.control.attrs(
          changes
            ? [
                h.OnMount(
                  // A press focuses the slider, so the keys go on from where the pointer left it.
                  Mount.mapMessage(PointerPosition({ focus: '[role="slider"]' }), fact =>
                    lift(
                      Match.valueTags(fact, {
                        PointerPressed: at => Message.Pointed({ angle: angleIn(at) }),
                        PointerMoved: at => Message.Pointed({ angle: angleIn(at) }),
                        PointerReleased: () => Message.Released(),
                      }),
                    ),
                  ),
                ),
              ]
            : [],
        ),
        [
          ...(marks.length === 0
            ? []
            : [
                h.div(
                  builders.markers.attrs([h.AriaHidden(true)]),
                  marks.map(mark =>
                    h.div(
                      builders.marker.attrs([
                        h.Key(String(mark.value)),
                        h.DataAttribute('state', stateOf(turn(mark.value), value)),
                        h.Style({ '--fk-angle-marker': `${turn(mark.value)}deg` }),
                      ]),
                      mark.label === undefined
                        ? []
                        : [h.span(builders.markerLabel.attrs(), [mark.label])],
                    ),
                  ),
                ),
              ]),
          h.div(builders.needle.attrs([h.AriaHidden(true)]), []),
          h.div(
            builders.thumb.attrs([
              h.Id(`${model.id}-thumb`),
              h.Role('slider'),
              h.AriaLabelledBy(labelId),
              h.AriaValuemin(0),
              h.AriaValuemax(lastOf(step)),
              h.AriaValuenow(value),
              h.AriaValuetext((options.valueText ?? degrees)(value)),
              ...(options.invalid === true ? [h.AriaInvalid(true)] : []),
              ...(disabled
                ? [h.AriaDisabled(true)]
                : [
                    h.Tabindex(0),
                    ...(readOnly
                      ? [h.AriaReadonly(true)]
                      : [
                          h.OnKeyDownPreventDefault((key, modifiers) =>
                            keys.has(key)
                              ? Option.some(
                                  lift(Message.PressedKey({ key, shift: modifiers.shiftKey })),
                                )
                              : Option.none(),
                          ),
                        ]),
                  ]),
            ]),
            [],
          ),
          ...(options.showValue === false
            ? []
            : [
                // The slider says the angle itself; this is the same said again for the eye.
                h.span(builders.value.attrs([h.AriaHidden(true)]), [format(value)]),
              ]),
        ],
      ),
      ...(options.name === undefined
        ? []
        : [
            h.input(
              builders.input.attrs([
                h.Type('hidden'),
                h.Name(options.name),
                h.Value(String(value)),
                ...(disabled ? [h.Disabled(true)] : []),
              ]),
            ),
          ]),
    ],
  )
}
