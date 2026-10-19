/**
 * The timer in a real browser, on the real clock: a countdown started by its
 * press counts down a second at a time to done; the press that goes on stays
 * one element under the focus as it turns from Start to Pause to Resume, and
 * reset keeps the focus as it is held; a paused time is drawn apart from a
 * running one, and the progress bar fills to what is counted.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import * as Timer from '../src/timer.js'
import { TimerSlots } from '../src/timer.js'
import { Timer as Recipe } from '../src/recipes/timer.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(TimerSlots)(Recipe({ progress: 'bar' }))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (duration: number) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'timer-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: Timer.Model,
      container,
      init: () => ({ model: Timer.init({ id: 'egg', countdown: true, duration }) }),
      update: Timer.update,
      view: (model: Timer.Model, h: HtmlBuilder<Timer.Message>) =>
        h.div(
          [h.Style({ padding: '2rem' })],
          [
            Timer.view(
              { model, label: 'Egg', units: ['minutes', 'seconds'], onMessage: m => m, style },
              h,
            ),
          ],
        ),
    }),
  )
}

const timer = () => document.querySelector<HTMLElement>('[role="timer"]')
const root = () => timer()!.parentElement!
const press = (action: string) => document.querySelector<HTMLElement>(`[data-action="${action}"]`)

test('a countdown counts down a second at a time to done', async () => {
  const handle = mount(2000)
  try {
    await vi.waitFor(() => expect(timer()?.textContent).toBe('00:02'))
    await userEvent.click(press('start')!)
    const seen = new Set<string>()
    await vi.waitFor(
      () => {
        seen.add(timer()!.textContent ?? '')
        expect(root().dataset['state']).toBe('done')
      },
      { timeout: 4000, interval: 50 },
    )
    expect([...seen]).toEqual(expect.arrayContaining(['00:01', '00:00']))
    expect(timer()!.textContent).toBe('00:00')
    expect(press('restart')).not.toBeNull()
  } finally {
    handle.dispose()
  }
})

test('the press that goes on keeps the focus as it turns, and so does a reset held', async () => {
  const handle = mount(60_000)
  try {
    await vi.waitFor(() => expect(press('start')).not.toBeNull())
    const primary = press('start')!
    primary.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(primary.dataset['action']).toBe('pause'))
    expect(document.activeElement).toBe(primary)
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(primary.textContent).toBe('Resume'))
    expect(document.activeElement).toBe(primary)
    const reset = press('reset')!
    reset.focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(reset.getAttribute('aria-disabled')).toBe('true'))
    expect(document.activeElement).toBe(reset)
    expect(timer()!.textContent).toBe('01:00')
  } finally {
    handle.dispose()
  }
})

test('a paused time is drawn apart from a running one, and the bar fills to what is counted', async () => {
  const handle = mount(1000)
  try {
    await vi.waitFor(() => expect(press('start')).not.toBeNull())
    const resting = getComputedStyle(timer()!).color
    await userEvent.click(press('start')!)
    await vi.waitFor(() => expect(root().dataset['state']).toBe('running'))
    const running = getComputedStyle(timer()!).color
    await userEvent.click(press('pause')!)
    await vi.waitFor(() => expect(root().dataset['state']).toBe('paused'))
    expect(getComputedStyle(timer()!).color).not.toBe(running)
    expect(running).toBe(resting)
    const bar = Number.parseFloat(getComputedStyle(root(), '::after').inlineSize)
    expect(bar).toBeLessThan(root().getBoundingClientRect().width)
    await userEvent.click(press('resume')!)
    await vi.waitFor(() => expect(root().dataset['state']).toBe('done'), { timeout: 3000 })
    await vi.waitFor(() =>
      expect(Number.parseFloat(getComputedStyle(root(), '::after').inlineSize)).toBeCloseTo(
        root().getBoundingClientRect().width,
        0,
      ),
    )
  } finally {
    handle.dispose()
  }
})
