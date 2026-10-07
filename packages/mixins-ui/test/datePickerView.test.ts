// @vitest-environment jsdom
/**
 * The forked date picker view draws what upstream draws. Every battery
 * below runs the identical Scene program against `@foldkit/ui/datePicker`'s
 * view and the fork (default `toView`), so a fork that drifts in markup,
 * bundles, or event wiring fails here. Behavior is upstream's in both
 * scenes; only the view differs. Fork-only tests at the end prove the seam
 * and the day-select flow.
 */
import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Scene } from 'foldkit/test'
import type { HtmlBuilder } from 'foldkit/html'
import * as Calendar from 'foldkit/calendar'
import * as UiCalendar from '@foldkit/ui/calendar'
import * as Popover from '@foldkit/ui/popover'
import * as UpstreamDatePicker from '@foldkit/ui/datePicker'
import {
  view as forkView,
  defaultToView,
  type DatePickerRenderInfo,
} from '../src/datePickerView.js'

type Message = UpstreamDatePicker.Message
type Model = UpstreamDatePicker.Model

const today = Calendar.make(2026, 4, 13)
const id = 'picker'
const trigger = `#${id}-popover-button`
const panel = `#${id}-popover-panel`

const toCalendarView = (h: HtmlBuilder<Message>) => (attrs: UiCalendar.CalendarAttributes) => {
  if (attrs._tag !== 'Days') return h.div([], [])
  return h.div(attrs.root, [
    h.div(attrs.grid, [
      ...attrs.weeks.map(week =>
        h.div(
          week.attributes,
          week.cells.map(cell =>
            h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.label])]),
          ),
        ),
      ),
    ]),
  ])
}

const triggerContent =
  (h: HtmlBuilder<Message>) => (maybeDate: Option.Option<Calendar.CalendarDate>) =>
    h.span(
      [],
      [
        Option.match(maybeDate, {
          onNone: () => 'Pick a date',
          onSome: date => `${date.year}-${date.month}-${date.day}`,
        }),
      ],
    )

const inputsOf = (
  h: HtmlBuilder<Message>,
  overrides: Partial<UpstreamDatePicker.ViewInputs> = {},
) => ({
  anchor: { placement: 'bottom-start' } as const,
  maybeSelectedDate: Option.none() as Option.Option<Calendar.CalendarDate>,
  triggerContent: triggerContent(h),
  toCalendarView: toCalendarView(h),
  ...overrides,
})

type Step = Parameters<typeof Scene.scene<Model, Message, UpstreamDatePicker.OutMessage>>[1]

/** The same program against both views: upstream's, then the fork's. */
const runBoth = (
  initial: Model,
  overrides: Partial<UpstreamDatePicker.ViewInputs>,
  ...steps: Array<Step>
): void => {
  for (const view of [UpstreamDatePicker.view, forkView]) {
    Scene.scene<Model, Message, UpstreamDatePicker.OutMessage>(
      {
        update: UpstreamDatePicker.update,
        view: (current, h) => view(current, inputsOf(h, overrides), h),
      },
      Scene.given(initial),
      ...steps,
    )
  }
}

const closedModel = UpstreamDatePicker.init({ id, today })
const openModel = UpstreamDatePicker.update(closedModel, UpstreamDatePicker.Message.Opened()).model

/** The popover's anchor and backdrop Mounts appear with the open panel. */
const anchored = (): Step =>
  Scene.Mount.resolveAll(
    [Popover.AnchorPopover, Popover.Message.CompletedAnchorPopover()],
    [Popover.PortalPopoverBackdrop, Popover.Message.CompletedPortalPopoverBackdrop()],
  )

describe('date picker view parity (upstream view vs forked view)', () => {
  it('closed: collapsed trigger, no grid', () => {
    runBoth(
      closedModel,
      {},
      Scene.expect(Scene.selector(trigger)).toExist(),
      Scene.expect(Scene.selector(trigger)).toHaveAttr('type', 'button'),
      Scene.expect(Scene.selector(trigger)).toHaveAttr('aria-expanded', 'false'),
      Scene.expect(Scene.selector(trigger)).toHaveText('Pick a date'),
      Scene.expect(Scene.role('grid')).toBeAbsent(),
    )
  })

  it('open: panel, grid, controls', () => {
    runBoth(
      openModel,
      { backdropClassName: 'backdrop' },
      anchored(),
      Scene.expect(Scene.selector(panel)).toExist(),
      Scene.expect(Scene.role('grid')).toExist(),
      Scene.expect(Scene.selector(trigger)).toHaveAttr('aria-controls', `${id}-popover-panel`),
      Scene.expect(Scene.selector('.backdrop')).toExist(),
    )
  })

  it('selected date shows in the trigger and the hidden input', () => {
    const selected = Calendar.make(2026, 4, 5)
    runBoth(
      closedModel,
      { maybeSelectedDate: Option.some(selected), name: 'dob' },
      Scene.expect(Scene.selector(trigger)).toHaveText('2026-4-5'),
      Scene.expect(Scene.selector('input')).toHaveValue('2026-04-05'),
    )
  })

  it('trigger labeling follows ariaLabel', () => {
    runBoth(
      closedModel,
      { ariaLabel: 'Due date' },
      Scene.expect(Scene.selector(trigger)).toHaveAttr('aria-label', 'Due date'),
    )
  })
})

describe('forked date picker seam', () => {
  it('a custom toView receives the computed bundles', () => {
    let seen: DatePickerRenderInfo | undefined
    Scene.scene<Model, Message, UpstreamDatePicker.OutMessage>(
      {
        update: UpstreamDatePicker.update,
        view: (current, h) =>
          forkView(
            current,
            {
              ...inputsOf(h),
              toView: render => {
                seen = render
                return defaultToView(h)(render)
              },
            },
            h,
          ),
      },
      Scene.given(openModel),
      anchored(),
    )
    const render = seen!
    expect(render.isVisible).toBe(true)
    expect(render.trigger.length).toBeGreaterThan(0)
    expect(render.panel).toBeDefined()
    expect(render.backdrop).toBeDefined()
    expect(render.calendar).toBeDefined()
  })

  it('selecting a day commits the date', () => {
    Scene.scene<Model, Message, UpstreamDatePicker.OutMessage>(
      {
        update: UpstreamDatePicker.update,
        view: (current, h) => forkView(current, inputsOf(h), h),
      },
      Scene.given(openModel),
      anchored(),
      Scene.click(Scene.text('15')),
      Scene.expectOutMessage<UpstreamDatePicker.OutMessage>({
        _tag: 'SelectedDate',
        date: Calendar.make(2026, 4, 15),
      }),
      Scene.Command.resolve(Popover.FocusButton, Popover.Message.CompletedFocusButton()),
      Scene.Mount.expectEnded(Popover.AnchorPopover, Popover.PortalPopoverBackdrop),
    )
  })
})
