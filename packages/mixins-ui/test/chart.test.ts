/**
 * The chart as geometry and markup: round ticks the axis reaches, marks at
 * the value they stand for, bands and bars inside the plot, slices that
 * share out the ring; the lit point's tooltip and status; the keys and the
 * pointer through `update`; the legend, the colors and the data table.
 * Layout, the container query and real keys are in `chart.browser.test.ts`.
 */
import { Option } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { describe, expect, it } from 'vitest'
import * as Chart from '../src/chart.js'
import * as Scale from '../src/chart/scale.js'
import { ChartSlots, Message } from '../src/chart.js'
import { Chart as Recipe } from '../src/recipes/chart.js'
import { sends, type TestMessage } from './fixture.js'

describe('Scale.ticksOf', () => {
  it.each([
    [0, 305, [0, 50, 100, 150, 200, 250, 300, 350]],
    [0, 300, [0, 50, 100, 150, 200, 250, 300]],
    [-20, 80, [-20, 0, 20, 40, 60, 80]],
    [0, 0.3, [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]],
    [12, 18, [0, 5, 10, 15, 20]],
    [0, 0, [0, 0.2]],
    [-7, -2, [-7, -6, -5, -4, -3, -2, -1, 0]],
  ])('from %d to %d is %j', (low, high, ticks) => {
    expect(Scale.ticksOf(low, high)).toEqual(ticks)
  })

  it('runs evenly from at most the least value, through zero, to at least the greatest by less than a step', () => {
    for (const [low, high] of [
      [0, 1],
      [0, 7],
      [0, 999],
      [-3, 41],
      [0, 12345],
      [-0.4, 0.04],
      [3, 2e6],
    ] as const) {
      const ticks = Scale.ticksOf(low, high)
      const step = ticks[1]! - ticks[0]!
      ticks.slice(1).forEach((tick, at) => expect(tick - ticks[at]!).toBeCloseTo(step, 9))
      expect(ticks).toContain(0)
      expect(ticks[0]!).toBeLessThanOrEqual(Math.min(0, low))
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(high)
      expect(ticks.at(-1)! - high).toBeLessThan(step)
      expect(ticks.length).toBeGreaterThanOrEqual(3)
      expect(ticks.length).toBeLessThanOrEqual(12)
    }
  })
})

describe('Scale geometry', () => {
  it('puts the top tick at the top and the first at the bottom', () => {
    const ticks = [0, 50, 100, 150, 200]
    expect([200, 150, 0, 50].map(value => Scale.yOf(ticks, value))).toEqual([0, 25, 100, 75])
  })

  it('tiles the plot with bands, each bar inside its band and beside the last', () => {
    const count = 6
    const bands = Array.from({ length: count }, (_, at) => Scale.bandOf(count, at))
    expect(bands.reduce((sum, band) => sum + band.width, 0)).toBeCloseTo(100, 4)
    bands.forEach((band, at) => {
      expect(band.middle).toBeCloseTo(band.start + band.width / 2, 5)
      let end = band.start
      for (let series = 0; series < 3; series++) {
        const bar = Scale.barOf(count, at, series, 3)
        expect(bar.start).toBeGreaterThanOrEqual(end - 1e-5)
        end = bar.start + bar.width
        expect(end).toBeLessThanOrEqual(band.start + band.width + 1e-5)
      }
      // The group sits in the middle of its band.
      const first = Scale.barOf(count, at, 0, 3)
      expect((first.start + end) / 2).toBeCloseTo(band.middle, 4)
    })
  })

  it('draws a line through each value mid-band, and closes an area down to zero', () => {
    const ticks = [0, 50, 100]
    expect(Scale.lineOf(ticks, [100, 50, 0, 25])).toBe('M12.5 0L37.5 50L62.5 100L87.5 75')
    expect(Scale.areaOf(ticks, [100, 50])).toBe('M25 0L75 50L75 100L25 100Z')
    expect(Scale.areaOf([-50, 0, 50], [50])).toBe('M50 0L50 50L50 50Z')
  })

  it('shares the ring out by value from the top, and draws nothing for zero', () => {
    const [half, , quarter, other] = Scale.slicesOf([2, 0, 1, 1])
    expect(Scale.slicesOf([2, 0, 1, 1])[1]).toBe('')
    // A half from twelve o'clock to six, then a quarter to nine, then on to twelve.
    expect(half).toMatch(/^M0 -1A1 1 0 0 1 0 1L/)
    expect(quarter).toMatch(/^M0 1A1 1 0 0 1 -1 0L/)
    expect(other).toMatch(/^M-1 0A1 1 0 0 1 0 -1L/)
    // Past half the ring, the arc takes the long way round.
    expect(Scale.slicesOf([3, 1])[0]).toMatch(/^M0 -1A1 1 0 1 1 /)
    // A whole ring is two halves, since one arc cannot end where it starts.
    expect(Scale.slicesOf([5])[0]!.match(/A1 1/g)).toHaveLength(2)
  })
})

const sales = {
  categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  series: [
    { name: 'Desktop', values: [186, 305, 237, 73, 209, 214] },
    { name: 'Mobile', values: [80, 200, 120, 190, 130, 140] },
  ],
}
const style = Style.forSlots(ChartSlots)(Recipe({}))
type More = Partial<Chart.CartesianChart<TestMessage>>
const message = (): TestMessage => ({ _tag: 'Clicked' })
const Bars = SlotView.forMessages<TestMessage>().define(ChartSlots, (more: More, _, h) =>
  Chart.view(
    {
      id: 'sales',
      label: 'Sales',
      kind: 'bar',
      model: Chart.init(),
      onMessage: message,
      style,
      ...sales,
      ...more,
    },
    h,
  ),
)
const drawn = (more: More = {}) => Inert.draw(Bars, more)
const lit = (point: number, keyed = false): Chart.Model => ({ point: Option.some(point), keyed })
const percent = (node: Parameters<typeof Inert.value>[0], key: string) =>
  Number(String(Inert.value(node, key)).replace('%', ''))

describe('Chart.view, bars', () => {
  it('labels the value axis with every tick, each down the plot where its value is', () => {
    const ticks = Inert.bySlot(drawn(), 'yTick')
    expect(ticks.map(Inert.text)).toEqual(['0', '50', '100', '150', '200', '250', '300', '350'])
    expect(ticks.map(tick => Inert.style(tick)['--_fk-chart-at'])).toEqual(
      [
        '100',
        '85.714286',
        '71.428571',
        '57.142857',
        '42.857143',
        '28.571429',
        '14.285714',
        '0',
      ].map(at => `${at}%`),
    )
    const grid = Inert.bySlot(drawn(), 'grid')
    expect(grid.map(line => Inert.value(line, 'y1'))).toEqual(
      ticks.map(tick => Inert.style(tick)['--_fk-chart-at']),
    )
    expect(grid.map(line => Inert.value(line, 'data-zero'))).toEqual([
      'true',
      ...Array(7).fill('false'),
    ])
  })

  it('draws each bar from zero to its value, in its series color', () => {
    const bars = Inert.bySlot(drawn(), 'bar')
    expect(bars).toHaveLength(12)
    // Feb's desktop, 305 of an axis to 350.
    const feb = bars[1]!
    expect(percent(feb, 'height')).toBeCloseTo((305 / 350) * 100, 4)
    expect(percent(feb, 'y') + percent(feb, 'height')).toBeCloseTo(100, 4)
    expect(bars.map(bar => Inert.value(bar, 'data-color'))).toEqual([
      ...Array(6).fill('1'),
      ...Array(6).fill('2'),
    ])
    for (const bar of bars) {
      expect(percent(bar, 'x')).toBeGreaterThanOrEqual(0)
      expect(percent(bar, 'x') + percent(bar, 'width')).toBeLessThanOrEqual(100)
    }
  })

  it('hangs a negative bar from zero', () => {
    const bars = Inert.bySlot(
      drawn({ categories: ['a', 'b'], series: [{ name: 'Net', values: [-20, 80] }] }),
      'bar',
    )
    // An axis from -20 to 80: zero is a fifth up from the bottom.
    expect(percent(bars[0]!, 'y')).toBeCloseTo(80, 4)
    expect(percent(bars[0]!, 'height')).toBeCloseTo(20, 4)
    expect(percent(bars[1]!, 'y')).toBeCloseTo(0, 4)
    expect(percent(bars[1]!, 'height')).toBeCloseTo(80, 4)
  })

  it('labels each category across its band, every other one minor', () => {
    const ticks = Inert.bySlot(drawn(), 'xTick')
    expect(ticks.map(Inert.text)).toEqual(sales.categories)
    expect(ticks.map(tick => Inert.style(tick)['--_fk-chart-at'])).toEqual(
      ['0', '16.666667', '33.333333', '50', '66.666667', '83.333333'].map(at => `${at}%`),
    )
    expect(ticks.map(tick => Inert.value(tick, 'data-minor'))).toEqual([
      'false',
      'true',
      'false',
      'true',
      'false',
      'true',
    ])
  })

  it('keeps a series its own color when it names one', () => {
    const bars = Inert.bySlot(
      drawn({ series: [{ name: 'Mobile', values: sales.series[1]!.values, color: 2 }] }),
      'bar',
    )
    expect(new Set(bars.map(bar => Inert.value(bar, 'data-color')))).toEqual(new Set(['2']))
  })

  it('refuses a sixth series, which no color is left for', () => {
    const six = Array.from({ length: 6 }, (_, at) => ({ name: `s${at}`, values: [1] }))
    expect(() => drawn({ categories: ['a'], series: six })).toThrow(/five colors/)
    expect(() => drawn({ categories: ['a'], series: six.slice(1) })).not.toThrow()
  })

  it('shows nothing lit, no tooltip and no cursor until a point is', () => {
    const chart = drawn()
    expect(Inert.bySlot(chart, 'tooltip')).toEqual([])
    expect(Inert.bySlot(chart, 'cursor')).toEqual([])
    expect(Inert.bySlot(chart, 'plot').map(plot => Inert.value(plot, 'data-pointed'))).toEqual([
      'false',
    ])
  })

  it('shows the lit category in the tooltip with each series value, and the cursor on its band', () => {
    const chart = drawn({ model: lit(1) })
    const [tooltip] = Inert.bySlot(chart, 'tooltip')
    expect(Inert.text(Inert.bySlot(tooltip, 'tooltipLabel')[0])).toBe('Feb')
    expect(
      Inert.bySlot(tooltip, 'tooltipRow').map(row => [
        Inert.text(Inert.bySlot(row, 'tooltipName')[0]),
        Inert.text(Inert.bySlot(row, 'tooltipValue')[0]),
      ]),
    ).toEqual([
      ['Desktop', '305'],
      ['Mobile', '200'],
    ])
    expect(Inert.style(tooltip)['--_fk-chart-at']).toBe('25%')
    expect(Inert.value(tooltip, 'data-side')).toBe('end')
    const [cursor] = Inert.bySlot(chart, 'cursor')
    expect([Inert.value(cursor, 'x'), Inert.value(cursor, 'width')]).toEqual([
      '16.666667%',
      '16.666667%',
    ])
    expect(Inert.bySlot(chart, 'bar').map(bar => Inert.value(bar, 'data-active'))).toEqual(
      [0, 1].flatMap(() => [false, true, false, false, false, false].map(String)),
    )
  })

  it('opens the tooltip toward the start past the middle', () => {
    expect(Inert.value(Inert.bySlot(drawn({ model: lit(4) }), 'tooltip')[0], 'data-side')).toBe(
      'start',
    )
  })

  it('says the lit point aloud only when the keys lit it', () => {
    const status = (model: Chart.Model) => Inert.text(Inert.bySlot(drawn({ model }), 'status')[0])
    expect(status(lit(2))).toBe('')
    expect(status(lit(2, true))).toBe('Mar: Desktop 237, Mobile 120')
    expect(Inert.value(Inert.bySlot(drawn(), 'status')[0], 'role')).toBe('status')
  })

  it('formats the values as told, on the axis and in the tooltip', () => {
    const chart = drawn({ model: lit(0), format: value => `$${value}` })
    expect(Inert.text(Inert.bySlot(chart, 'yTick').at(-1))).toBe('$350')
    expect(Inert.text(Inert.bySlot(chart, 'tooltipValue')[0])).toBe('$186')
  })

  it('treats a lit point past the data as none', () => {
    expect(Inert.bySlot(drawn({ model: lit(9) }), 'tooltip')).toEqual([])
  })

  it('draws a legend for two series or more, unless told', () => {
    expect(Inert.bySlot(drawn(), 'legendItem').map(Inert.text)).toEqual(['Desktop', 'Mobile'])
    const one = { series: [sales.series[0]!] }
    expect(Inert.bySlot(drawn(one), 'legend')).toEqual([])
    expect(Inert.bySlot(drawn({ ...one, legend: true }), 'legend')).toHaveLength(1)
    expect(Inert.bySlot(drawn({ legend: false }), 'legend')).toEqual([])
  })

  it('reads its data as a table, hidden unless shown, and hides the drawing', () => {
    const chart = drawn()
    const [table] = Inert.bySlot(chart, 'table')
    expect(Inert.value(table, 'data-shown')).toBe('false')
    expect(Inert.text(Inert.bySlot(table, 'tableCaption')[0])).toBe('Sales')
    expect(Inert.bySlot(table, 'tableRow').map(row => Inert.children(row).map(Inert.text))).toEqual(
      [
        ['Category', 'Desktop', 'Mobile'],
        ['Jan', '186', '80'],
        ['Feb', '305', '200'],
        ['Mar', '237', '120'],
        ['Apr', '73', '190'],
        ['May', '209', '130'],
        ['Jun', '214', '140'],
      ],
    )
    expect(Inert.value(Inert.bySlot(drawn({ table: 'shown' }), 'table')[0], 'data-shown')).toBe(
      'true',
    )
    for (const slot of ['canvas', 'yAxis', 'xAxis'])
      expect(Inert.value(Inert.bySlot(chart, slot)[0], 'aria-hidden')).toBe('true')
  })

  it('names the plot by its title and makes it a stop for the keys', () => {
    const chart = drawn()
    const [plot] = Inert.bySlot(chart, 'plot')
    const [title] = Inert.bySlot(chart, 'title')
    expect(Inert.value(plot, 'aria-labelledby')).toBe(Inert.value(title, 'id'))
    expect(Inert.text(title)).toBe('Sales')
    expect(Inert.value(plot, 'tabindex')).toBe(0)
  })

  it('draws nothing outside its slots, and reads only tokens the theme declares', () => {
    for (const kind of ['bar', 'line', 'area'] as const) {
      const chart = drawn({ kind, model: lit(1) })
      expect(Inert.unslotted(chart)).toEqual([])
      const theme = Theme.compose(
        Theme.tokens,
        Theme.oklch({ accent: { h: 260, c: 0.15, l: '55%' } }),
      )
      expect(Inert.missingTokens(chart, Style.stylesheet(Theme.root(theme)))).toEqual([])
    }
  })
})

describe('Chart.view, lines and areas', () => {
  it('draws one line per series through its values, and an area under it for an area', () => {
    const line = drawn({ kind: 'line' })
    expect(Inert.bySlot(line, 'bar')).toEqual([])
    expect(Inert.bySlot(line, 'area')).toEqual([])
    const ticks = Scale.ticksOf(0, 305)
    expect(Inert.bySlot(line, 'line').map(path => Inert.value(path, 'd'))).toEqual(
      sales.series.map(series => Scale.lineOf(ticks, series.values)),
    )
    const area = drawn({ kind: 'area' })
    expect(Inert.bySlot(area, 'area').map(path => Inert.value(path, 'd'))).toEqual(
      sales.series.map(series => Scale.areaOf(ticks, series.values)),
    )
    expect(Inert.value(Inert.bySlot(area, 'paths')[0], 'preserveAspectRatio')).toBe('none')
  })

  it('draws a dot on each line at the lit category', () => {
    const dots = Inert.bySlot(drawn({ kind: 'line', model: lit(1) }), 'dot')
    expect(dots.map(dot => [Inert.value(dot, 'cx'), percent(dot, 'cy')])).toEqual([
      ['25%', Scale.yOf(Scale.ticksOf(0, 305), 305)],
      ['25%', Scale.yOf(Scale.ticksOf(0, 305), 200)],
    ])
    expect(Inert.bySlot(drawn({ kind: 'line' }), 'dot')).toEqual([])
  })
})

type DonutMore = Partial<Chart.DonutChart<TestMessage>>
const Donut = SlotView.forMessages<TestMessage>().define(ChartSlots, (more: DonutMore, _, h) =>
  Chart.view(
    {
      id: 'browsers',
      label: 'Visitors by browser',
      kind: 'donut',
      slices: [
        { name: 'Chrome', value: 275 },
        { name: 'Safari', value: 200 },
        { name: 'Firefox', value: 125 },
      ],
      model: Chart.init(),
      onMessage: message,
      style,
      ...more,
    },
    h,
  ),
)

describe('Chart.view, a donut', () => {
  it('draws a slice per part sized by its share, in order and in color', () => {
    const donut = Inert.draw(Donut, {})
    const slices = Inert.bySlot(donut, 'slice')
    expect(slices.map(slice => Inert.value(slice, 'd'))).toEqual(Scale.slicesOf([275, 200, 125]))
    expect(slices.map(slice => Inert.value(slice, 'data-color'))).toEqual(['1', '2', '3'])
    expect(Inert.bySlot(donut, 'legendItem').map(Inert.text)).toEqual([
      'Chrome',
      'Safari',
      'Firefox',
    ])
  })

  it('says the total in its hole, or the lit slice', () => {
    const center = (model: Chart.Model) =>
      ['centerValue', 'centerLabel'].map(slot =>
        Inert.text(Inert.bySlot(Inert.draw(Donut, { model }), slot)[0]),
      )
    expect(center(Chart.init())).toEqual(['600', 'Total'])
    expect(center(lit(1))).toEqual(['200', 'Safari'])
  })

  it('reads as a table of each part and its value', () => {
    const [table] = Inert.bySlot(Inert.draw(Donut, { valueLabel: 'Visitors' }), 'table')
    expect(Inert.bySlot(table, 'tableRow').map(row => Inert.children(row).map(Inert.text))).toEqual(
      [
        ['', 'Visitors'],
        ['Chrome', '275'],
        ['Safari', '200'],
        ['Firefox', '125'],
      ],
    )
  })

  it('draws nothing outside its slots', () => {
    expect(Inert.unslotted(Inert.draw(Donut, { model: lit(0) }))).toEqual([])
  })
})

describe('Chart.update', () => {
  const at = (model: Chart.Model, message: Chart.Message) => Chart.update(model, message).model

  it('lights what the pointer is over, unsaid, and clears it as the pointer leaves', () => {
    expect(at(Chart.init(), Message.Pointed({ point: 2 }))).toEqual(lit(2))
    expect(at(lit(2), Message.Left())).toEqual(Chart.init())
  })

  it('keeps a keyed point when the pointer leaves', () => {
    const model = lit(2, true)
    expect(at(model, Message.Left())).toBe(model)
  })

  it.each([
    ['next', 2, 3],
    ['previous', 2, 1],
    ['first', 2, 0],
    ['last', 2, 5],
    ['next', 5, 5],
    ['previous', 0, 0],
  ] as const)('steps %s from %d to %d of six, said aloud', (step, from, to) => {
    expect(at(lit(from), Message.Stepped({ step, count: 6 }))).toEqual(lit(to, true))
  })

  it('begins the arrows at an end from nothing lit', () => {
    expect(at(Chart.init(), Message.Stepped({ step: 'next', count: 6 }))).toEqual(lit(0, true))
    expect(at(Chart.init(), Message.Stepped({ step: 'previous', count: 6 }))).toEqual(lit(5, true))
  })

  it('brings a point past shrunk data back to the last', () => {
    expect(at(lit(9, true), Message.Stepped({ step: 'previous', count: 6 }))).toEqual(lit(5, true))
  })

  it('lights the first point on focus, said aloud, unless one is lit', () => {
    expect(at(Chart.init(), Message.Focused({ count: 6 }))).toEqual(lit(0, true))
    const model = lit(3)
    expect(at(model, Message.Focused({ count: 6 }))).toBe(model)
  })

  it('returns the same Model when nothing changes', () => {
    const none = Chart.init()
    const model = lit(5, true)
    expect(at(model, Message.Stepped({ step: 'next', count: 6 }))).toBe(model)
    expect(at(model, Message.Stepped({ step: 'last', count: 6 }))).toBe(model)
    expect(at(none, Message.Stepped({ step: 'next', count: 0 }))).toBe(none)
    expect(at(none, Message.Focused({ count: 0 }))).toBe(none)
    expect(at(none, Message.Cleared())).toBe(none)
    expect(at(none, Message.Left())).toBe(none)
    const pointed = lit(2)
    expect(at(pointed, Message.Pointed({ point: 2 }))).toBe(pointed)
  })

  it('clears on Escape and on blur', () => {
    expect(at(lit(2, true), Message.Cleared())).toEqual({ point: Option.none(), keyed: true })
  })
})

describe('Chart.view sends', () => {
  const plotOf = (h: HtmlBuilder<Chart.Message>) =>
    Chart.view(
      { id: 's', label: 'Sales', kind: 'bar', model: Chart.init(), onMessage: m => m, ...sales },
      h,
    )

  // Focus and blur are sent from a real focus, in the browser test.
  it('the keys as steps through the categories, and Escape as a clear', () => {
    const plot = Scene.role('group', { name: 'Sales' })
    sends(
      plotOf,
      Scene.keydown(plot, 'ArrowRight'),
      Scene.expectOutMessage(Message.Stepped({ step: 'next', count: 6 })),
      Scene.keydown(plot, 'ArrowUp'),
      Scene.expectOutMessage(Message.Stepped({ step: 'previous', count: 6 })),
      Scene.keydown(plot, 'Home'),
      Scene.expectOutMessage(Message.Stepped({ step: 'first', count: 6 })),
      Scene.keydown(plot, 'End'),
      Scene.expectOutMessage(Message.Stepped({ step: 'last', count: 6 })),
      Scene.keydown(plot, 'Escape'),
      Scene.expectOutMessage(Message.Cleared()),
    )
  })

  it('a band the pointer enters as its point', () => {
    sends(
      plotOf,
      Scene.hover(Scene.selector('rect[x="50%"]')),
      Scene.expectOutMessage(Message.Pointed({ point: 3 })),
    )
  })
})
