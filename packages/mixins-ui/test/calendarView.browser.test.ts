/**
 * `Calendar.view` on a real runtime, with the shipped recipe: where the
 * frame puts the presets, the two months, the today button, the aside and
 * the footer; where `paging: 'end'` puts the buttons; and the month's name
 * beside the year select. Layout is the browser's to say, so each claim is a
 * measured box, and each press a real one.
 */
import * as Dates from 'foldkit/calendar'
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
const style = Style.forSlots(CalendarSlots)(Recipes.Calendar({}))

type Options = Omit<Calendar.CalendarView<Calendar.Message>, 'model' | 'onMessage' | 'label'>

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (
  args: Partial<Calendar.Args>,
  options: (h: HtmlBuilder<Calendar.Message>) => Options,
) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'app'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: Calendar.Model,
      container,
      init: () => ({ model: Calendar.init({ id: 'trip', today, ...args }) }),
      update: (model: Calendar.Model, message: Calendar.Message) => {
        const { model: next, commands } = Calendar.update(model, message)
        return commands === undefined ? { model: next } : { model: next, commands }
      },
      view: (model: Calendar.Model, h: HtmlBuilder<Calendar.Message>) =>
        h.div(
          [h.Style({ padding: '2rem' })],
          [
            Calendar.view(
              { model, onMessage: message => message, label: 'Trip', style, ...options(h) },
              h,
            ),
          ],
        ),
    }),
  )
}

const one = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector)
  if (found === null) throw new Error(`nothing matches ${selector}`)
  return found
}
const box = (selector: string) => one(selector).getBoundingClientRect()
/** The button holding exactly `text`. */
const worded = (text: string) => {
  const found = [...document.querySelectorAll<HTMLElement>('button')].find(
    button => button.textContent === text,
  )
  if (found === undefined) throw new Error(`no button reads ${text}`)
  return found
}
const named = (name: string) => `[aria-label="${name}"]`
const ready = () => vi.waitFor(() => expect(document.querySelector('[role="grid"]')).toBeTruthy())
const day = (date: Dates.CalendarDate, id = 'trip') =>
  `#${id}-cell-${date.year}-${date.month}-${date.day}`

test('the frame lays presets, two months and the aside in a row, today under the months, the footer under all', async () => {
  const handle = mount({ months: 2, selection: Calendar.empty('Range') }, h => ({
    presets: [{ label: 'Next 3 days', selection: Calendar.nextDays(Dates.make(2026, 4, 6), 3) }],
    today: { label: 'This month' },
    aside: h.p([h.Id('aside')], ['09:30']),
    footer: h.p([h.Id('footer')], ['Times are local']),
  }))
  try {
    await ready()
    const second = Calendar.secondId('trip')
    const presets = box(named('Presets'))
    const first = box('#trip')
    const other = box(`#${second}`)
    const aside = box('#aside')
    const footer = box('#footer')
    expect(presets.right).toBeLessThanOrEqual(first.left)
    expect(first.right).toBeLessThanOrEqual(other.left)
    expect(Math.abs(first.top - other.top)).toBeLessThan(1)
    expect(other.right).toBeLessThanOrEqual(aside.left)
    expect(footer.top).toBeGreaterThanOrEqual(Math.max(first.bottom, other.bottom, aside.bottom))
    expect(footer.left).toBeCloseTo(presets.left, 0)
    const todayButton = worded('This month')
    const todayBox = todayButton.getBoundingClientRect()
    expect(todayBox.top).toBeGreaterThanOrEqual(Math.max(first.bottom, other.bottom))
    expect(todayBox.bottom).toBeLessThanOrEqual(footer.top)
    expect(todayBox.left).toBeCloseTo(first.left, 0)

    // A preset in another month turns both months to it, and a press on today's button turns back.
    await userEvent.click(worded('Next 3 days'))
    await vi.waitFor(() => {
      expect(one(day(Dates.make(2026, 4, 6))).hasAttribute('data-range-start')).toBe(true)
      expect(document.querySelector(day(Dates.make(2026, 5, 20), second))).toBeTruthy()
    })
    await userEvent.click(todayButton)
    await vi.waitFor(() => {
      expect(one(day(today)).hasAttribute('data-outside-month')).toBe(false)
      expect(document.querySelector(day(Dates.make(2026, 3, 20), second))).toBeTruthy()
    })
  } finally {
    handle.dispose()
  }
})

test('`paging: end` starts the row with the caption and ends it with both buttons', async () => {
  const handle = mount({}, () => ({ paging: 'end' }))
  try {
    await ready()
    const header = box('[data-paging="end"]')
    const caption = box(named('Switch to month picker'))
    const previous = box(named('Previous month'))
    const next = box(named('Next month'))
    expect(caption.left).toBeCloseTo(header.left, 0)
    expect(previous.left).toBeGreaterThanOrEqual(caption.right)
    expect(next.left).toBeGreaterThanOrEqual(previous.right)
    expect(next.right).toBeCloseTo(header.right, 0)
    // The buttons stand together, the space between caption and buttons, not between the buttons.
    expect(next.left - previous.right).toBeLessThan(previous.left - caption.right)
  } finally {
    handle.dispose()
  }
})

test('the default paging keeps the caption in the middle, a button at each end', async () => {
  const handle = mount({}, () => ({}))
  try {
    await ready()
    const header = box('#trip > div')
    const caption = box(named('Switch to month picker'))
    expect(box(named('Previous month')).left).toBeCloseTo(header.left, 0)
    expect(box(named('Next month')).right).toBeCloseTo(header.right, 0)
    expect((caption.left + caption.right) / 2).toBeCloseTo((header.left + header.right) / 2, 0)
  } finally {
    handle.dispose()
  }
})

test('the month’s name stands against the year select, the pair in the middle', async () => {
  const handle = mount({}, () => ({ caption: { dropdowns: { month: 'label' } } }))
  try {
    await ready()
    const header = box('#trip > div')
    const month = box('[data-beside-select]')
    const year = box(named('Year'))
    expect(one('[data-beside-select]').textContent).toBe('February')
    expect(year.left - month.right).toBeGreaterThanOrEqual(0)
    expect(year.left - month.right).toBeLessThan(12)
    expect((month.left + year.right) / 2).toBeCloseTo((header.left + header.right) / 2, 0)
    await userEvent.selectOptions(one(named('Year')), '2027')
    await vi.waitFor(() =>
      expect(document.querySelector(day(Dates.make(2027, 2, 11)))).toBeTruthy(),
    )
  } finally {
    handle.dispose()
  }
})
