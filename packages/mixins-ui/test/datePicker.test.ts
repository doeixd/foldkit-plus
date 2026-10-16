// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Calendar from 'foldkit/calendar'
import * as Popover from '@foldkit/ui/popover'
import * as UiCalendar from '@foldkit/ui/calendar'
import * as UpstreamDatePicker from '@foldkit/ui/datePicker'
import { Behavior, Diagnostics, Event, Style, type MixinValue } from 'foldkit-mixins'
import {
  Calendar as CalendarAdapter,
  DatePicker as DatePickerAdapter,
  DatePickerSlots,
  DatePickerView,
  type ResolvedDatePicker,
} from '../src/index.js'
import { classValue, holds } from './fixture.js'

type Message = UpstreamDatePicker.Message
type Model = UpstreamDatePicker.Model

const today = Calendar.make(2026, 4, 13)
const id = 'picker'
const trigger = `#${id}-popover-button`

const inputsOf = (
  h: HtmlBuilder<Message>,
  overrides: Partial<UpstreamDatePicker.ViewInputs> = {},
) => ({
  anchor: { placement: 'bottom-start' } as const,
  maybeSelectedDate: Option.none() as Option.Option<Calendar.CalendarDate>,
  triggerContent: (maybeDate: Option.Option<Calendar.CalendarDate>) =>
    h.span(
      [],
      [
        Option.match(maybeDate, {
          onNone: () => 'Pick a date',
          onSome: date => `${date.year}-${date.month}-${date.day}`,
        }),
      ],
    ),
  toCalendarView: () => h.div([], []),
  ...overrides,
})

interface Captured {
  readonly render: import('../src/index.js').DatePickerRenderInfo
  readonly resolved: ResolvedDatePicker
}

type Step = Parameters<typeof Scene.scene<Model, Message, UpstreamDatePicker.OutMessage>>[1]

const closedModel = UpstreamDatePicker.init({ id, today })
const openModel = UpstreamDatePicker.update(closedModel, UpstreamDatePicker.Message.Opened()).model

/** The popover's anchor and backdrop Mounts appear with the open panel. */
const anchored = (): Step =>
  Scene.Mount.resolveAll(
    [Popover.AnchorPopover, Popover.Message.CompletedAnchorPopover()],
    [Popover.PortalPopoverBackdrop, Popover.Message.CompletedPortalPopoverBackdrop()],
  )

const runPicker = (
  mixins: ReadonlyArray<MixinValue<Message> | MixinValue<never>>,
  capture: (captured: Captured) => void,
  draw: (resolved: ResolvedDatePicker, h: HtmlBuilder<Message>) => Html,
  ...extra: Array<Step>
): void => {
  Scene.scene<Model, Message, UpstreamDatePicker.OutMessage>(
    {
      update: UpstreamDatePicker.update,
      view: (model, h) =>
        DatePickerView.view(
          model,
          {
            ...inputsOf(h),
            toView: render => {
              const resolved = DatePickerAdapter.resolve(render, mixins, {
                input: undefined,
                h,
              })
              capture({ render, resolved })
              return draw(resolved, h)
            },
          },
          h,
        ),
    },
    Scene.given(openModel),
    ...extra,
  )
}

const drawDefault = (resolved: ResolvedDatePicker, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.button([...resolved.trigger], [resolved.triggerContent]),
      ...(resolved.backdrop === undefined ? [] : [h.div([...resolved.backdrop])]),
      ...(resolved.panel === undefined ? [] : [h.div([...resolved.panel], [resolved.calendar])]),
    ],
  )

describe('DatePicker adapter', () => {
  it('preserves the base bundles by identity', () => {
    let captured: Captured | undefined
    runPicker(
      [],
      value => {
        captured = value
      },
      drawDefault,
      anchored(),
    )
    const { render, resolved } = captured!
    for (const child of render.trigger) expect(holds(resolved.trigger, child)).toBe(true)
    expect(render.panel).toBeDefined()
    for (const child of render.panel!) expect(holds(resolved.panel!, child)).toBe(true)
  })

  it('styles the trigger and the panel', () => {
    const PickerStyle = Style.forSlots(DatePickerSlots)({
      trigger: Style.class('picker-trigger'),
      panel: Style.class('picker-panel'),
    })
    let captured: Captured | undefined
    runPicker(
      [PickerStyle.mixin],
      value => {
        captured = value
      },
      drawDefault,
      anchored(),
    )
    const { resolved } = captured!
    expect(classValue(resolved.trigger)).toBe('picker-trigger')
    expect(classValue(resolved.panel!)).toBe('picker-panel')
  })

  it('draws the styled bundles end to end', () => {
    const PickerStyle = Style.forSlots(DatePickerSlots)({
      trigger: Style.class('picker-trigger'),
    })
    Scene.scene<Model, Message, UpstreamDatePicker.OutMessage>(
      {
        update: UpstreamDatePicker.update,
        view: (model, h) =>
          DatePickerView.view(
            model,
            {
              ...inputsOf(h),
              toView: DatePickerAdapter.toView([PickerStyle.mixin], drawDefault),
            },
            h,
          ),
      },
      Scene.given(openModel),
      anchored(),
      Scene.expect(Scene.selector(trigger)).toHaveClass('picker-trigger'),
    )
  })

  it("draws upstream's markup with the style applied when given no draw", () => {
    const PickerStyle = Style.forSlots(DatePickerSlots)({
      trigger: Style.class('picker-trigger'),
      panel: Style.class('picker-panel'),
    })
    Scene.scene<Model, Message, UpstreamDatePicker.OutMessage>(
      {
        update: UpstreamDatePicker.update,
        view: (model, h) =>
          DatePickerView.view(
            model,
            { ...inputsOf(h), toView: DatePickerAdapter.toView([PickerStyle.mixin]) },
            h,
          ),
      },
      Scene.given(openModel),
      anchored(),
      Scene.expect(Scene.selector('button.picker-trigger')).toExist(),
      Scene.expect(Scene.selector('.picker-panel')).toExist(),
    )
  })

  describe('DatePicker.update', () => {
    const day = (date: number) => Calendar.make(2026, 4, date)
    const click = (date: number) =>
      UpstreamDatePicker.Message.GotCalendarMessage({
        message: UiCalendar.Message.ClickedDay({ date: day(date) }),
      })
    // As an application folds it: the selection read fresh for each Message.
    const pick = (selection: CalendarAdapter.Selection, model: Model, date: number) =>
      DatePickerAdapter.update(selection)(model, click(date))

    it.each([
      ['a single day', 'Single', false],
      ['a range waiting for its end', 'Range', true],
      ['a multiple day', 'Multiple', true],
    ] as const)('%s', (name, mode, open) => {
      const result = pick(CalendarAdapter.empty(mode), openModel, 10)
      expect(result.model.popover.isOpen).toBe(open)
      expect(result.outMessage).toEqual(
        UpstreamDatePicker.OutMessage.SelectedDate({ date: day(10) }),
      )
    })

    it('closes with the range complete', () => {
      const start = CalendarAdapter.picked(CalendarAdapter.empty('Range'), day(10))
      const result = pick(start, openModel, 14)
      expect(result.model.popover.isOpen).toBe(false)
      expect(result.outMessage).toEqual(
        UpstreamDatePicker.OutMessage.SelectedDate({ date: day(14) }),
      )
    })
  })

  it('refuses a Behavior that takes over the trigger click', () => {
    const Steal = Behavior.forSlots(DatePickerSlots)<undefined, Message>({
      trigger: Behavior.slot({
        requires: { events: [Event.Click] },
        attributes: ({ h }: { readonly h: HtmlBuilder<Message> }) => [
          h.OnClick(UpstreamDatePicker.Message.Closed()),
        ],
      }),
    })
    expect(() => runPicker([Steal.mixin], () => {}, drawDefault)).toThrow(
      Diagnostics.DiagnosticError,
    )
  })
})
