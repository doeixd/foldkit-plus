/**
 * A carousel on a real page: each slide fills the track, and Next, through
 * `update` and `ShowSlide`, scrolls the track until the next slide starts
 * where the track does; a swipe the track comes to rest from moves the dot;
 * several slides share the track; and a rotating carousel moves by itself,
 * holds while the pointer rests on it, and stops for focus from the keys.
 */
import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
// From the modules themselves, so another component's breakage cannot fail this file.
import * as Carousel from '../src/carousel.js'
import { CarouselSlots } from '../src/carousel.js'
import { Carousel as CarouselRecipe } from '../src/recipes/carousel.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(CarouselSlots)(CarouselRecipe({}))

const Model = Schema.Struct({ carousel: Carousel.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Got: { message: Carousel.Message } })
type Message = typeof Message.Type

const PLACES = ['Dunes', 'Coast', 'Ridge', 'Valley']

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const element = (selector: string): HTMLElement => {
  const found = document.querySelector(selector)
  if (!(found instanceof HTMLElement)) throw new Error(`no ${selector}`)
  return found
}

const mount = (
  carousel: Carousel.Model,
  more: { readonly perView?: number; readonly loop?: boolean } = {},
) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  // Somewhere to rest the pointer away from the carousel.
  const away = document.createElement('div')
  away.id = 'away'
  away.style.cssText = 'height: 40px'
  document.body.appendChild(away)
  const container = document.createElement('div')
  container.id = 'carousel-browser'
  document.body.appendChild(container)
  const update = Carousel.update({ count: PLACES.length, ...more })
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { carousel } }),
      update: (model: Model, message: Message) =>
        Message.match(message, {
          Got: ({ message: inner }) => {
            const next = update(model.carousel, inner)
            return {
              model:
                next.model === model.carousel
                  ? model
                  : modifyFields(model, { carousel: () => next.model }),
              commands: Command.mapMessages(next.commands ?? [], got =>
                Message.Got({ message: got }),
              ),
            }
          },
        }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ width: '320px' })],
          [
            Carousel.view(
              {
                label: 'Trip photos',
                model: model.carousel,
                slides: PLACES.map(name =>
                  h.p([h.Style({ height: '120px', margin: '0' })], [name]),
                ),
                onMessage: message => Message.Got({ message }),
                style,
                ...more,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const current = () => element('[aria-current="true"]').getAttribute('aria-label')
const offset = (slide: number) =>
  element(`#trip-slide-${slide}`).getBoundingClientRect().left -
  element('#trip-track').getBoundingClientRect().left

test('Next scrolls the next slide to the start of the track', async () => {
  const handle = mount(Carousel.init({ id: 'trip' }))
  try {
    await vi.waitFor(() => element('#trip-slide-3'))
    const track = element('#trip-track')
    expect(element('#trip-slide-0').getBoundingClientRect().width).toBeCloseTo(track.clientWidth, 0)
    expect(offset(1)).toBeGreaterThanOrEqual(track.clientWidth)
    element('[aria-label="Next slide"]').click()
    await vi.waitFor(() => expect(Math.abs(offset(1))).toBeLessThan(1))
    expect(current()).toBe('2 of 4')
    expect(element('[role="status"]').textContent).toBe('2 of 4')
  } finally {
    handle.dispose()
  }
})

test('a swipe the track comes to rest from moves the dot to the slide shown', async () => {
  const handle = mount(Carousel.init({ id: 'trip' }))
  try {
    await vi.waitFor(() => element('#trip-slide-3'))
    const track = element('#trip-track')
    // Past the third slide's start: the snap carries it back there.
    track.scrollTo({ left: track.clientWidth * 2 + 30, behavior: 'instant' })
    await vi.waitFor(() => expect(current()).toBe('3 of 4'))
    expect(element('[role="status"]').textContent).toBe('3 of 4')
  } finally {
    handle.dispose()
  }
})

test('starts where its Model says, drawn there at once', async () => {
  const handle = mount(Carousel.init({ id: 'trip', slide: 2 }))
  try {
    await vi.waitFor(() => element('#trip-slide-3'))
    await vi.waitFor(() => expect(Math.abs(offset(2))).toBeLessThan(1))
    expect(current()).toBe('3 of 4')
  } finally {
    handle.dispose()
  }
})

test('two per view share the track, a gap between them, and rest at three places', async () => {
  const handle = mount(Carousel.init({ id: 'trip' }), { perView: 2 })
  try {
    await vi.waitFor(() => element('#trip-slide-3'))
    const track = element('#trip-track')
    const gap = parseFloat(getComputedStyle(track).columnGap)
    expect(gap).toBeGreaterThan(0)
    const width = element('#trip-slide-0').getBoundingClientRect().width
    expect(width).toBeCloseTo((track.clientWidth - gap) / 2, 0)
    expect(offset(1)).toBeCloseTo(width + gap, 0)
    expect(document.querySelectorAll('[aria-label="Choose a slide"] button')).toHaveLength(3)
  } finally {
    handle.dispose()
  }
})

test('rotating, it moves on by itself and its dot fills; the pointer holds both', async () => {
  const handle = mount(Carousel.init({ id: 'trip', autoplay: true, delay: 400 }), { loop: true })
  try {
    await vi.waitFor(() => element('#trip-slide-3'))
    await userEvent.hover(element('#away'))
    const root = element('#trip')
    await vi.waitFor(() => expect(root.dataset['rotation']).toBe('rotating'))
    const fill = () => getComputedStyle(element('[aria-current="true"]'), '::before')
    expect(fill().animationName).not.toBe('none')
    await vi.waitFor(() => expect(current()).toBe('2 of 4'), { timeout: 3000 })
    // A new wait, under the other name, fills again.
    expect(fill().animationName).not.toBe('none')
    await userEvent.hover(element('#trip-track'))
    await vi.waitFor(() => expect(root.dataset['rotation']).toBe('paused'))
    expect(fill().animationPlayState).toBe('paused')
    const held = current()
    await new Promise(resolve => setTimeout(resolve, 900))
    expect(current()).toBe(held)
    await userEvent.hover(element('#away'))
    await vi.waitFor(() => expect(current()).not.toBe(held), { timeout: 3000 })
  } finally {
    handle.dispose()
  }
})

test('a finger holds it while down, and a tap leaves it rotating', async () => {
  const handle = mount(Carousel.init({ id: 'trip', autoplay: true, delay: 60_000 }), { loop: true })
  try {
    await vi.waitFor(() => element('#trip-slide-3'))
    await userEvent.hover(element('#away'))
    const root = element('#trip')
    await vi.waitFor(() => expect(root.dataset['rotation']).toBe('rotating'))
    const touch = { bubbles: true, pointerType: 'touch', pointerId: 2, isPrimary: true }
    element('#trip-track').dispatchEvent(new PointerEvent('pointerdown', touch))
    await vi.waitFor(() => expect(root.dataset['rotation']).toBe('paused'))
    // Lifted: a touch pointer leaves, and the browser's emulated mouse enters after it.
    root.dispatchEvent(new PointerEvent('pointerleave', { ...touch, bubbles: false }))
    root.dispatchEvent(new MouseEvent('mouseenter'))
    await vi.waitFor(() => expect(root.dataset['rotation']).toBe('rotating'))
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(root.dataset['rotation']).toBe('rotating')
  } finally {
    handle.dispose()
  }
})

test('focus arriving by the keys stops it, and its button starts it again', async () => {
  const handle = mount(Carousel.init({ id: 'trip', autoplay: true, delay: 60_000 }))
  try {
    await vi.waitFor(() => element('#trip-slide-3'))
    await userEvent.hover(element('#away'))
    const rotation = () => element('#trip > button')
    expect(rotation().getAttribute('aria-label')).toBe('Stop slide rotation')
    element('#away').tabIndex = 0
    element('#away').focus()
    await userEvent.tab()
    // The rotation button is the first stop inside it.
    expect(document.activeElement).toBe(rotation())
    await vi.waitFor(() =>
      expect(rotation().getAttribute('aria-label')).toBe('Start slide rotation'),
    )
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() =>
      expect(rotation().getAttribute('aria-label')).toBe('Stop slide rotation'),
    )
    expect(element('#trip').dataset['rotation']).toBe('rotating')
  } finally {
    handle.dispose()
  }
})
