/**
 * The Calendar on a real runtime, upstream's grid with this package's
 * options: the type (muted, smaller weekday names; tabular days; a medium
 * chosen day and a quiet fill for today), week numbers in a column of their
 * own, paging arrows that point the other way right to left, month and year
 * selects centered between them that move the month, other months' days left
 * blank, a hover preview of a range under the real pointer, two months
 * side by side that page together, and a day's detail as a line under its
 * number or as a dot.
 */
import * as UiCalendar from '@foldkit/ui/calendar'
import { Option, Schema } from 'effect'
import * as Dates from 'foldkit/calendar'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Calendar, CalendarSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const today = Dates.make(2026, 2, 11)

const Model = Schema.Struct({
  first: UiCalendar.Model,
  second: UiCalendar.Model,
  selection: Calendar.Selection,
  preview: Schema.Option(Dates.CalendarDate),
})
type Model = typeof Model.Type
type Message =
  | { readonly _tag: 'GotFirst'; readonly message: UiCalendar.Message }
  | { readonly _tag: 'GotSecond'; readonly message: UiCalendar.Message }
  | { readonly _tag: 'Previewed'; readonly date: Option.Option<Dates.CalendarDate> }
  | { readonly _tag: 'Showed'; readonly shown: Calendar.Shown }

interface Setup {
  readonly selection?: Calendar.Selection
  readonly weekNumbers?: boolean
  readonly dropdowns?: boolean
  readonly outside?: 'shown' | 'hidden'
  readonly two?: boolean
  readonly dir?: 'rtl'
  readonly width?: string
  /** The recipe's `detail` axis, with the 12th of each month given one. */
  readonly detail?: 'text' | 'dot'
}

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

const picked = (model: Model, out: UiCalendar.OutMessage | undefined): Calendar.Selection =>
  Option.match(Option.fromNullishOr(out), {
    onNone: () => model.selection,
    onSome: UiCalendar.OutMessage.match<Calendar.Selection>({
      SelectedDate: ({ date }) => Calendar.picked(model.selection, date),
      ChangedViewMonth: () => model.selection,
    }),
  })

const mount = (setup: Setup = {}) => {
  if (setup.dir !== undefined) document.documentElement.dir = setup.dir
  const style = Style.forSlots(CalendarSlots)(
    Recipes.Calendar({
      outside: setup.outside ?? 'shown',
      ...(setup.detail === undefined ? {} : { detail: setup.detail }),
    }),
  )
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'calendar-look'
  document.body.appendChild(container)
  const month = (
    model: Model,
    which: 'first' | 'second',
    h: HtmlBuilder<Message>,
    paging: Calendar.CalendarOptions<Message>['paging'],
  ) =>
    h.submodel({
      slotId: model[which].id,
      model: model[which],
      view: UiCalendar.view,
      viewInputs: Calendar.inputs(
        model.selection,
        [style.mixin, Calendar.readingKeys],
        { h },
        {
          weekNumbers: setup.weekNumbers === true,
          paging,
          detail:
            setup.detail === undefined
              ? undefined
              : date => Option.liftPredicate('$120', () => date.day === 12),
          preview: {
            date: model.preview,
            onPreview: (date): Message => ({ _tag: 'Previewed', date }),
          },
          ...(setup.dropdowns === true && which === 'first'
            ? {
                dropdowns: {
                  model: model.first,
                  onShow: (shown): Message => ({ _tag: 'Showed', shown }),
                },
              }
            : {}),
        },
      ),
      toParentMessage: (message: UiCalendar.Message): Message =>
        which === 'first' ? { _tag: 'GotFirst', message } : { _tag: 'GotSecond', message },
    })
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => {
        const first = UiCalendar.init({
          id: 'first',
          today,
          minDate: Dates.make(2025, 1, 1),
          maxDate: Dates.make(2027, 12, 31),
        })
        return {
          model: {
            first,
            second: Calendar.alongside(UiCalendar.init({ id: 'second', today }), first, 1),
            selection: setup.selection ?? Calendar.empty('Range'),
            preview: Option.none(),
          },
        }
      },
      update: (model: Model, message: Message) => {
        switch (message._tag) {
          case 'Previewed':
            return { model: { ...model, preview: message.date } }
          case 'Showed': {
            const first = Calendar.show(model.first, message.shown)
            return {
              model: { ...model, first, second: Calendar.alongside(model.second, first, 1) },
            }
          }
          case 'GotFirst': {
            const next = UiCalendar.update(model.first, message.message)
            return {
              model: {
                ...model,
                first: next.model,
                second: Calendar.alongside(model.second, next.model, 1),
                selection: picked(model, next.outMessage),
              },
              commands: mapMessages(next.commands ?? [], (inner): Message => ({
                _tag: 'GotFirst',
                message: inner,
              })),
            }
          }
          case 'GotSecond': {
            const next = UiCalendar.update(model.second, message.message)
            return {
              model: {
                ...model,
                second: next.model,
                first: Calendar.alongside(model.first, next.model, -1),
                selection: picked(model, next.outMessage),
              },
              commands: mapMessages(next.commands ?? [], (inner): Message => ({
                _tag: 'GotSecond',
                message: inner,
              })),
            }
          }
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [
            h.Style({
              display: 'flex',
              gap: '2rem',
              padding: '2rem',
              alignItems: 'start',
              ...(setup.width === undefined ? {} : { inlineSize: setup.width }),
            }),
          ],
          setup.two === true
            ? [month(model, 'first', h, 'previous'), month(model, 'second', h, 'next')]
            : [month(model, 'first', h, 'both')],
        ),
    }),
  )
}

/** The pixels of `text` drawn alone in `direction`, which the bidi algorithm reads as a paragraph would. */
const inkOf = (text: string, direction: string) => {
  const canvas = document.createElement('canvas')
  canvas.width = 40
  canvas.height = 40
  const context = canvas.getContext('2d')!
  context.direction = direction === 'rtl' ? 'rtl' : 'ltr'
  context.font = '32px sans-serif'
  context.textAlign = 'center'
  context.fillText(text, 20, 30)
  return context.getImageData(0, 0, 40, 40).data.join(',')
}

const dayOf = (id: string, date: number, month = 2) =>
  document.querySelector<HTMLElement>(`#${id}-cell-2026-${month}-${date} button`)!
const ready = () => vi.waitFor(() => expect(dayOf('first', 11)).toBeTruthy())
// A spot away from every control: earlier tests may have left the pointer over a day.
const park = () => userEvent.hover(document.body, { position: { x: 1200, y: 800 } })

test('weekday names are smaller and muted, days tabular, a chosen day medium, today filled', async () => {
  const handle = mount({ selection: Calendar.day(Dates.make(2026, 2, 16)) })
  try {
    await ready()
    await park()
    const weekday = document.querySelector<HTMLElement>('[role="columnheader"]')!
    const plain = getComputedStyle(dayOf('first', 12))
    expect(parseFloat(getComputedStyle(weekday).fontSize)).toBeLessThan(parseFloat(plain.fontSize))
    expect(getComputedStyle(weekday).color).not.toBe(plain.color)
    expect(getComputedStyle(weekday).fontWeight).toBe('400')
    expect(plain.fontVariantNumeric).toBe('tabular-nums')
    expect(plain.fontWeight).toBe('400')
    expect(getComputedStyle(dayOf('first', 16)).fontWeight).toBe('500')
    const now = getComputedStyle(dayOf('first', 11))
    expect(now.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(now.backgroundColor).not.toBe(getComputedStyle(dayOf('first', 16)).backgroundColor)
  } finally {
    handle.dispose()
  }
})

test('week numbers stand in a column of their own, level with their weeks', async () => {
  const handle = mount({ weekNumbers: true })
  try {
    await ready()
    const row = dayOf('first', 1).closest('[role="row"]')!
    const number = row.firstElementChild!
    expect(number.textContent).toBe('6')
    const first = dayOf('first', 1).getBoundingClientRect()
    const box = number.getBoundingClientRect()
    expect(box.right).toBeLessThanOrEqual(first.left + 0.5)
    expect(box.top).toBeCloseTo(first.top, 0)
    // The weekday names keep over their days, the header row's first cell over the numbers.
    const sunday = document.querySelector<HTMLElement>('[role="columnheader"]')!
    expect(sunday.getBoundingClientRect().left).toBeCloseTo(first.left, 0)
  } finally {
    handle.dispose()
  }
})

test.each(['ltr', 'rtl'] as const)(
  '%s: the paging arrows sit at the ends, the bidi algorithm left to point them',
  async dir => {
    const handle = mount(dir === 'rtl' ? { dir } : {})
    try {
      await ready()
      const previous = document.querySelector<HTMLElement>('[aria-label="Previous month"]')!
      const next = document.querySelector<HTMLElement>('[aria-label="Next month"]')!
      const before = previous.getBoundingClientRect().left < next.getBoundingClientRect().left
      expect(before).toBe(dir === 'ltr')
      // The bidi algorithm mirrors the arrow right to left; a flip on top would undo it.
      expect(getComputedStyle(previous).scale).toBe('none')
      expect(getComputedStyle(previous).transform).toBe('none')
      expect(previous.textContent).toBe('‹')
      // Drawn in the button's direction, its arrow is the other one's right to left.
      const pointing = inkOf('‹', getComputedStyle(previous).direction)
      expect(pointing === inkOf('›', 'ltr')).toBe(dir === 'rtl')
    } finally {
      handle.dispose()
    }
  },
)

test('month and year selects sit centered between the arrows, and move the month', async () => {
  const handle = mount({ dropdowns: true })
  try {
    await ready()
    const [month, year] = Array.from(document.querySelectorAll('select'))
    const previous = document
      .querySelector('[aria-label="Previous month"]')!
      .getBoundingClientRect()
    const next = document.querySelector('[aria-label="Next month"]')!.getBoundingClientRect()
    const left = month!.getBoundingClientRect().left - previous.right
    const right = next.left - year!.getBoundingClientRect().right
    expect(left).toBeGreaterThan(0)
    expect(left).toBeCloseTo(right, 0)
    await userEvent.selectOptions(month!, '5')
    await vi.waitFor(() => expect(dayOf('first', 20, 5)).toBeTruthy())
    await userEvent.selectOptions(year!, '2027')
    await vi.waitFor(() =>
      expect(document.querySelector('#first-cell-2027-5-20 button')).toBeTruthy(),
    )
  } finally {
    handle.dispose()
  }
})

test('other months’ days can be left blank, and the grid keeps its height', async () => {
  const shown = mount()
  await ready()
  const outsideDay = () => document.querySelector<HTMLElement>('[data-outside-month]')!
  const height = document.querySelector('[role="grid"]')!.getBoundingClientRect().height
  expect(getComputedStyle(outsideDay()).visibility).toBe('visible')
  shown.dispose()
  document.body.replaceChildren()
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  const hidden = mount({ outside: 'hidden' })
  try {
    await ready()
    expect(getComputedStyle(outsideDay()).visibility).toBe('hidden')
    expect(document.querySelector('[role="grid"]')!.getBoundingClientRect().height).toBeCloseTo(
      height,
      0,
    )
  } finally {
    hidden.dispose()
  }
})

test('the pointer previews a range from its start, and leaving the grid clears it', async () => {
  const handle = mount()
  try {
    await ready()
    await park()
    await userEvent.click(dayOf('first', 10))
    await userEvent.hover(dayOf('first', 13))
    const band = (date: number) =>
      getComputedStyle(dayOf('first', date).parentElement!, '::before').backgroundColor
    await vi.waitFor(() => expect(band(12)).not.toBe('rgba(0, 0, 0, 0)'))
    expect(band(14)).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(dayOf('first', 13)).boxShadow).not.toBe('none')
    await park()
    await vi.waitFor(() => expect(band(12)).toBe('rgba(0, 0, 0, 0)'))
    // The end picked, the range draws its own band, with no preview over it.
    await userEvent.click(dayOf('first', 13))
    await vi.waitFor(() =>
      expect(dayOf('first', 13).parentElement!.hasAttribute('data-range-end')).toBe(true),
    )
    expect(document.querySelectorAll('[data-preview]')).toHaveLength(0)
  } finally {
    handle.dispose()
  }
})

test('two months side by side page together, each with one arrow', async () => {
  const handle = mount({ two: true })
  try {
    await ready()
    await vi.waitFor(() => expect(dayOf('second', 11, 3)).toBeTruthy())
    expect(document.querySelectorAll('[aria-label="Previous month"]')).toHaveLength(1)
    expect(document.querySelectorAll('[aria-label="Next month"]')).toHaveLength(1)
    await userEvent.click(document.querySelector<HTMLElement>('[aria-label="Next month"]')!)
    await vi.waitFor(() => expect(dayOf('second', 11, 4)).toBeTruthy())
    expect(dayOf('first', 11, 3)).toBeTruthy()
    await userEvent.click(document.querySelector<HTMLElement>('[aria-label="Previous month"]')!)
    await vi.waitFor(() => expect(dayOf('first', 11, 2)).toBeTruthy())
    expect(dayOf('second', 11, 3)).toBeTruthy()
  } finally {
    handle.dispose()
  }
})

test('a month narrower than seven cells shrinks its days, which stay round', async () => {
  const handle = mount({ width: '15rem' })
  try {
    await ready()
    const room = document.body.firstElementChild!
    const edge =
      room.getBoundingClientRect().right - parseFloat(getComputedStyle(room).paddingRight)
    const grid = document.querySelector<HTMLElement>('[role="grid"]')!.getBoundingClientRect()
    const box = dayOf('first', 11).getBoundingClientRect()
    expect(grid.right).toBeLessThanOrEqual(edge + 0.5)
    expect(box.width * 7).toBeLessThanOrEqual(grid.width + 0.5)
    expect(box.height).toBeCloseTo(box.width, 0)
  } finally {
    handle.dispose()
  }
})

test('a detail stands under its day’s number, in a taller cell, and stays inside it', async () => {
  const handle = mount({ detail: 'text' })
  try {
    await ready()
    const button = dayOf('first', 12)
    const detail = button.querySelector('span')!
    const box = button.getBoundingClientRect()
    const line = detail.getBoundingClientRect()
    expect(detail.textContent).toBe('$120')
    // Under the number, not beside it: the number takes the line above, both centered.
    const number = document.createRange()
    number.selectNodeContents(button.firstChild!)
    const digits = number.getBoundingClientRect()
    expect(digits.bottom).toBeLessThanOrEqual(line.top + 0.5)
    expect(digits.left + digits.width / 2).toBeCloseTo(line.left + line.width / 2, 0)
    expect(line.left).toBeGreaterThanOrEqual(box.left)
    expect(line.right).toBeLessThanOrEqual(box.right + 0.5)
    expect(line.bottom).toBeLessThanOrEqual(box.bottom + 0.5)
    // Every day is as tall, so the rows do not jump where a day has none.
    expect(dayOf('first', 13).getBoundingClientRect().height).toBeCloseTo(box.height, 0)
    expect(box.height).toBeGreaterThan(box.width)
  } finally {
    handle.dispose()
  }
})

test('a detail drawn as a dot is a small mark centered under the number, its words unseen', async () => {
  const handle = mount({ detail: 'dot' })
  try {
    await ready()
    const button = dayOf('first', 12)
    const dot = button.querySelector('span')!
    const box = button.getBoundingClientRect()
    const mark = dot.getBoundingClientRect()
    expect(mark.width).toBeLessThan(8)
    expect(mark.height).toBeCloseTo(mark.width, 0)
    expect(mark.left + mark.width / 2).toBeCloseTo(box.left + box.width / 2, 0)
    expect(mark.top).toBeGreaterThan(box.top + box.height / 2)
    expect(mark.bottom).toBeLessThanOrEqual(box.bottom)
    expect(getComputedStyle(dot).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    // Its words take no room, so none spill out of the dot.
    expect(dot.scrollWidth).toBeLessThanOrEqual(dot.clientWidth)
    // The day stays round, as one without a dot.
    expect(box.height).toBeCloseTo(box.width, 0)
  } finally {
    handle.dispose()
  }
})
