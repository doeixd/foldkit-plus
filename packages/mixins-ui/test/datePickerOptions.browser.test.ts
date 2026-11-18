/// <reference types="@vitest/browser-playwright" />
/**
 * `DatePicker.view` on a real runtime over the state `DatePicker.init` makes,
 * one test for each reference date picker that is a call with options (the
 * note's rows 24 to 30, numbered as there): the trigger shows the selection,
 * a real press opens the panel and picks, the popover closes by the `closes`
 * rule, and the value is submitted under `name`. A popover's opening,
 * closing and focus are the browser's to show.
 */
import { Option } from 'effect'
import * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Calendar, CalendarSlots, DatePicker, DatePickerSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(DatePickerSlots)(Recipes.DatePicker({}))
const calendarStyle = Style.forSlots(CalendarSlots)(Recipes.Calendar({}))
const today = Dates.make(2026, 2, 11)
const feb = (date: number) => Dates.make(2026, 2, date)

const written = (date: Dates.CalendarDate) => `${date.year}-${date.month}-${date.day}`
/** The trigger's text: a day, both ends of a range, or a prompt. */
const face = (selection: Calendar.Selection): string =>
  Option.match(Calendar.rangeOf(selection), {
    onSome: ({ start, end }) => `${written(start)} to ${written(end)}`,
    onNone: () =>
      Option.match(Calendar.firstDate(selection), {
        onNone: () => 'Pick a date',
        onSome: written,
      }),
  })

type Args = Omit<DatePicker.Args, 'id' | 'today'>
type Options<Message> = Partial<
  Omit<DatePicker.DatePickerView<Message>, 'model' | 'onMessage' | 'label'>
>

let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

type Message = DatePicker.Message
type Draw = (options: DatePicker.DatePickerView<Message>, h: HtmlBuilder<Message>) => Html

const mount = (
  args: Args = {},
  options: (h: HtmlBuilder<Message>) => Options<Message> = () => ({}),
  draw: Draw = DatePicker.view,
) => {
  const view = (model: DatePicker.Model, h: HtmlBuilder<Message>): Html =>
    h.div(
      [h.Style({ padding: '2rem' })],
      [
        draw(
          {
            model,
            onMessage: message => message,
            label: 'Due',
            trigger: face,
            name: 'due',
            style,
            calendarStyle,
            ...options(h),
          },
          h,
        ),
      ],
    )
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    calendarStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'date-picker-options-browser'
  document.body.append(container)
  handle = Runtime.embed(
    Runtime.makeElement({
      Model: DatePicker.Model,
      container,
      init: () => ({ model: DatePicker.init({ id: 'due', today, ...args }) }),
      update: (model: DatePicker.Model, message: Message) => {
        const { model: next, commands } = DatePicker.fold(model, message)
        return commands === undefined ? { model: next } : { model: next, commands }
      },
      view,
    }),
  )
}

const trigger = () => {
  const found = document.querySelector<HTMLElement>('button[aria-label="Due"]')
  if (found === null) throw new Error('no trigger')
  return found
}
const grid = () => document.querySelector<HTMLElement>('[role="grid"]')
const day = (date: Dates.CalendarDate) => {
  const found = document.querySelector<HTMLElement>(
    `[id$="-cell-${date.year}-${date.month}-${date.day}"] button`,
  )
  if (found === null) throw new Error(`no day ${written(date)}`)
  return found
}
const worded = (text: string) => {
  const found = [...document.querySelectorAll<HTMLElement>('button')].find(
    button => button.textContent === text,
  )
  if (found === undefined) throw new Error(`no button reads ${text}`)
  return found
}
const submitted = () =>
  [...document.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="due"]')].map(
    input => input.value,
  )
const ready = () =>
  vi.waitFor(() => expect(document.querySelector('button[aria-label="Due"]')).not.toBeNull())
const open = async () => {
  await ready()
  await userEvent.click(trigger())
  await vi.waitFor(() => expect(grid()).not.toBeNull())
}
const closed = () => vi.waitFor(() => expect(grid()).toBeNull())

test('24 date picker: the trigger shows the selection, a press picks, closes and submits', async () => {
  mount()
  await ready()
  expect(trigger().textContent).toBe('Pick a date')
  expect(grid()).toBeNull()
  expect(submitted()).toEqual([''])
  await open()
  await userEvent.click(day(feb(14)))
  await closed()
  expect(trigger().textContent).toBe('2026-2-14')
  expect(submitted()).toEqual(['2026-02-14'])
  // The reader is back where they were: on the trigger.
  await vi.waitFor(() => expect(document.activeElement).toBe(trigger()))
})

test('25 range date picker: open until the range has both ends, which the trigger then shows', async () => {
  mount({ selection: Calendar.empty('Range') })
  await open()
  await userEvent.click(day(feb(14)))
  await vi.waitFor(() => expect(trigger().textContent).toBe('2026-2-14'))
  expect(grid()).not.toBeNull()
  await userEvent.click(day(feb(10)))
  await closed()
  expect(trigger().textContent).toBe('2026-2-10 to 2026-2-14')
  expect(submitted()).toEqual(['2026-02-10', '2026-02-14'])
})

test('26 date picker, year view: the heading opens the months inside the panel', async () => {
  mount()
  await open()
  await userEvent.click(
    document.querySelector<HTMLElement>('[aria-label="Switch to month picker"]')!,
  )
  await vi.waitFor(() =>
    expect(document.querySelector('[role="grid"][aria-label="Month picker, 2026"]')).not.toBeNull(),
  )
  // A month picked there goes back to its days, the popover still open.
  await userEvent.click(worded('May'))
  await vi.waitFor(() => expect(grid()?.getAttribute('aria-label')).toBe('Calendar, May 2026'))
})

test('28 and 29 presets: a press takes the preset whole and closes the popover', async () => {
  const lastWeek = Calendar.lastDays(today, 7)
  mount({ selection: Calendar.empty('Range') }, () => ({
    presets: [
      { label: 'Last 7 days', selection: lastWeek },
      { label: 'Tomorrow', selection: Calendar.day(feb(12)) },
    ],
  }))
  await open()
  // The presets stand in the panel, before the month.
  const presets = document.querySelector<HTMLElement>('[aria-label="Presets"]')!
  expect(presets.getBoundingClientRect().right).toBeLessThanOrEqual(
    grid()!.getBoundingClientRect().left,
  )
  await userEvent.click(worded('Last 7 days'))
  await closed()
  expect(trigger().textContent).toBe('2026-2-5 to 2026-2-11')
  await open()
  expect(worded('Last 7 days').getAttribute('aria-pressed')).toBe('true')
  await userEvent.click(worded('Tomorrow'))
  await closed()
  expect(trigger().textContent).toBe('2026-2-12')
})

test('27 and 30 a second widget in the panel: `manual` leaves it open for every pick', async () => {
  mount({ closes: 'manual' }, h => ({
    aside: h.p([h.Id('times')], ['09:30']),
    footer: h.p([h.Id('zone')], ['Times are local']),
    today: { label: 'Today', selects: true },
  }))
  await open()
  const month = grid()!.getBoundingClientRect()
  expect(document.getElementById('times')!.getBoundingClientRect().left).toBeGreaterThanOrEqual(
    month.right,
  )
  expect(document.getElementById('zone')!.getBoundingClientRect().top).toBeGreaterThanOrEqual(
    month.bottom,
  )
  await userEvent.click(day(feb(14)))
  await vi.waitFor(() => expect(trigger().textContent).toBe('2026-2-14'))
  expect(grid()).not.toBeNull()
  await userEvent.click(worded('Today'))
  await vi.waitFor(() => expect(trigger().textContent).toBe('2026-2-11'))
  expect(grid()).not.toBeNull()
  await userEvent.keyboard('{Escape}')
  await closed()
  expect(trigger().textContent).toBe('2026-2-11')
})

test('an animated picker’s panel fades in and out, as the Popover’s does', async () => {
  await cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  })
  mount({ animated: true })
  await open()
  const panel = grid()!.closest<HTMLElement>('[data-placement]')!
  await userEvent.keyboard('{Escape}')
  // Leaving: still drawn, its opacity transitioning to nothing.
  await vi.waitFor(() => expect(panel.hasAttribute('data-leave')).toBe(true))
  expect(panel.isConnected).toBe(true)
  expect(getComputedStyle(panel).transitionProperty).toContain('opacity')
  await closed()
})

test('a disabled picker does not open, and the calendar’s options and words reach the panel', async () => {
  mount({}, () => ({ disabled: true }))
  await ready()
  trigger().click()
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  expect(grid()).toBeNull()
  handle?.dispose()
  document.body.replaceChildren()
  mount({}, () => ({
    weekNumbers: true,
    caption: { dropdowns: {} },
    paging: 'none',
    words: { month: 'Mois', daysGrid: 'Calendrier, {month}' },
  }))
  await open()
  expect(grid()!.getAttribute('aria-label')).toBe('Calendrier, February 2026')
  expect(document.querySelector('[aria-label="Previous month"]')).toBeNull()
  expect(grid()!.textContent).toContain('#')
  await userEvent.selectOptions(document.querySelector<HTMLElement>('[aria-label="Mois"]')!, '5')
  await vi.waitFor(() => expect(grid()!.getAttribute('aria-label')).toBe('Calendrier, May 2026'))
})

test('the application’s own DatePicker draws its base, a preset and the call', async () => {
  const Pickers = DatePicker.configure({
    base: { style, calendarStyle, words: { presets: 'Shortcuts' } },
    presets: {
      quick: { presets: [{ label: 'Tomorrow', selection: Calendar.day(feb(12)) }] },
    },
  })
  mount(
    {},
    () => ({}),
    (options, h) => Pickers.view({ ...options, preset: 'quick' }, h),
  )
  await open()
  expect(document.querySelector('[aria-label="Shortcuts"]')).not.toBeNull()
  await userEvent.click(worded('Tomorrow'))
  await closed()
  expect(trigger().textContent).toBe('2026-2-12')
})
