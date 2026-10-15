// @vitest-environment jsdom
/**
 * Carousel as markup: a named carousel group of slides each named "N of M",
 * previous and next that go one slide and are disabled at the ends unless
 * the carousel loops, a dot per slide, a status that says the current
 * slide; and `ShowSlide`, which scrolls the slide to the track's start once
 * the render has committed.
 */
import { Effect } from 'effect'
import type { Html } from 'foldkit/html'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Carousel, CarouselSlots, Patterns, Recipes } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(CarouselSlots)(Recipes.Carousel({}))
const slides = ['Dunes', 'Coast', 'Ridge'].map(name => h.p([], [name]))

/** Draws the carousel, with every index `onIndex` was asked for, in drawing order. */
const drawn = (
  index: number,
  more: { readonly loop?: boolean; readonly picker?: boolean; readonly count?: number } = {},
) => {
  const asked: Array<number> = []
  const html = Carousel.view(
    {
      id: 'trip',
      label: 'Trip photos',
      slides: slides.slice(0, more.count ?? slides.length),
      index,
      onIndex: to => {
        asked.push(to)
        return message('Clicked')
      },
      loop: more.loop,
      picker: more.picker,
      style,
    },
    h,
  )
  const buttons = Inert.byTag(html, 'button')
  const isStep = (button: (typeof buttons)[number]) =>
    ['Previous slide', 'Next slide'].includes(String(Inert.value(button, 'aria-label')))
  return {
    html,
    asked,
    previous: buttons[0],
    next: buttons.at(-1),
    dots: buttons.filter(button => !isStep(button)),
  }
}

const clickable = (button: Html | undefined) => typeof button?.data?.on?.['click'] === 'function'

describe('Carousel.view', () => {
  it('meets the carousel pattern', () => {
    expect(A11y.validate(Patterns.Carousel, CarouselSlots)).toEqual([])
  })

  it('is a named carousel group of slides, each a group named by its place', () => {
    const { html } = drawn(1)
    const [root] = Inert.byRole(html, 'group')
    expect(Inert.value(root, 'aria-roledescription')).toBe('carousel')
    expect(Inert.value(root, 'aria-label')).toBe('Trip photos')
    const shown = Inert.byRole(html, 'group').filter(
      group => Inert.value(group, 'aria-roledescription') === 'slide',
    )
    expect(shown.map(slide => Inert.value(slide, 'aria-label'))).toEqual([
      '1 of 3',
      '2 of 3',
      '3 of 3',
    ])
    expect(shown.map(slide => Inert.value(slide, 'id'))).toEqual(
      [0, 1, 2].map(index => Carousel.slideId('trip', index)),
    )
    expect(shown.map(slide => Inert.value(slide, 'data-current'))).toEqual([
      'false',
      'true',
      'false',
    ])
  })

  it('goes one slide either way, in the order the controls are drawn', () => {
    const { asked, previous, next, dots } = drawn(1)
    expect(Inert.value(previous, 'aria-label')).toBe('Previous slide')
    expect(Inert.value(next, 'aria-label')).toBe('Next slide')
    expect(Inert.value(next, 'aria-controls')).toBe('trip-track')
    expect(clickable(previous)).toBe(true)
    expect(clickable(next)).toBe(true)
    // Previous, the two dots not current, next.
    expect(asked).toEqual([0, 0, 2, 2])
    expect(dots.map(dot => Inert.value(dot, 'aria-current'))).toEqual([
      undefined,
      'true',
      undefined,
    ])
    expect(dots.map(clickable)).toEqual([true, false, true])
  })

  it('disables previous on the first slide and next on the last, keeping them focusable', () => {
    const first = drawn(0, { picker: false })
    expect(Inert.value(first.previous, 'aria-disabled')).toBe('true')
    expect(Inert.value(first.previous, 'disabled')).toBe(undefined)
    expect(clickable(first.previous)).toBe(false)
    expect(first.asked).toEqual([1])
    const last = drawn(2, { picker: false })
    expect(Inert.value(last.next, 'aria-disabled')).toBe('true')
    expect(clickable(last.next)).toBe(false)
    expect(last.asked).toEqual([1])
  })

  it('wraps at the ends when it loops', () => {
    expect(drawn(0, { loop: true, picker: false }).asked).toEqual([2, 1])
    expect(drawn(2, { loop: true, picker: false }).asked).toEqual([1, 0])
  })

  it('does not loop a single slide onto itself', () => {
    const one = drawn(0, { loop: true, picker: false, count: 1 })
    expect(one.asked).toEqual([])
    expect(Inert.value(one.next, 'aria-disabled')).toBe('true')
  })

  it('reads an index out of range as the nearest end', () => {
    const { html, next } = drawn(9)
    const [status] = Inert.byRole(html, 'status')
    expect(Inert.text(status)).toBe('3 of 3')
    expect(Inert.value(next, 'aria-disabled')).toBe('true')
  })

  it('says the current slide in a status region, empty with no slides', () => {
    expect(Inert.text(Inert.byRole(drawn(1).html, 'status')[0])).toBe('2 of 3')
    expect(Inert.text(Inert.byRole(drawn(0, { count: 0 }).html, 'status')[0])).toBe('')
  })

  it('draws the dots only when asked', () => {
    expect(drawn(1, { picker: false }).dots).toEqual([])
    const [picker] = Inert.byRole(drawn(1).html, 'group').filter(
      group => Inert.value(group, 'aria-label') === 'Choose a slide',
    )
    expect(Inert.byTag(picker, 'button')).toHaveLength(3)
  })
})

describe('Carousel recipe', () => {
  it('snaps one slide at a time, and scrolls smoothly only without reduced motion', () => {
    const sheet = style.css
    expect(sheet).toContain('scroll-snap-type:x mandatory')
    expect(sheet).toContain('scroll-snap-stop:always')
    expect(sheet).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\{[^}]*\{[^}]*scroll-behavior:smooth/,
    )
  })
})

describe('Carousel.ShowSlide', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it('scrolls the slide to the start once the render commits, not when built', async () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    )
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const running = Effect.runPromise(Carousel.ShowSlide({ id: 'trip', index: 2 }).effect)
    // Drawn after the Command started, as the render that marks it current is.
    const slide = document.createElement('div')
    slide.id = Carousel.slideId('trip', 2)
    const asked: Array<boolean | ScrollIntoViewOptions | undefined> = []
    slide.scrollIntoView = options => {
      asked.push(options)
    }
    document.body.append(slide)
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    expect(asked).toEqual([])
    frames[0]?.(0)
    expect(await running).toEqual(Carousel.Message.CompletedShowSlide())
    expect(asked).toEqual([{ block: 'nearest', inline: 'start' }])
  })
})
