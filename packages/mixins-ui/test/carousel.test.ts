// @vitest-environment jsdom
/**
 * Carousel as markup: a named carousel group of slides each named "N of M",
 * previous and next that go one place and are disabled at the ends unless
 * the carousel loops, a dot or thumbnail per place the track can rest, the
 * rotation button first when it rotates, a status that says the current
 * slide; its `update`, which keeps the index and the rotation; and
 * `ShowSlide`, which scrolls the slide to the track's start once the render
 * has committed.
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

type Sent = Carousel.Message

interface Drawn {
  readonly loop?: boolean
  readonly picker?: boolean
  readonly count?: number
  readonly perView?: number
  readonly thumbnails?: boolean
  readonly model?: Partial<Carousel.Model>
}

/** Draws the carousel at `index`, with every Message its handlers were built with, in drawing order. */
const drawn = (index: number, more: Drawn = {}) => {
  const sent: Array<Sent> = []
  const shown = slides.slice(0, more.count ?? slides.length)
  const html = Carousel.view(
    {
      label: 'Trip photos',
      model: { ...Carousel.init({ id: 'trip', index }), ...more.model },
      slides: shown,
      onMessage: got => {
        sent.push(got)
        return message('Clicked')
      },
      loop: more.loop,
      picker: more.picker,
      perView: more.perView,
      thumbnails: more.thumbnails === true ? shown.map(() => h.span([], ['thumb'])) : undefined,
      style,
    },
    h,
  )
  const buttons = Inert.byTag(html, 'button')
  const labelled = (label: string) =>
    buttons.find(button => Inert.value(button, 'aria-label') === label)
  const chosen = sent.flatMap(message => (message._tag === 'Chose' ? [message.index] : []))
  return {
    html,
    sent,
    chosen,
    buttons,
    previous: labelled('Previous slide'),
    next: labelled('Next slide'),
    picks: buttons.filter(button => Inert.value(button, 'aria-controls') !== 'trip-track'),
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
    const { chosen, previous, next, picks } = drawn(1)
    expect(Inert.value(next, 'aria-controls')).toBe('trip-track')
    expect(clickable(previous)).toBe(true)
    expect(clickable(next)).toBe(true)
    // Previous, the two dots not current, next.
    expect(chosen).toEqual([0, 0, 2, 2])
    expect(picks.map(dot => Inert.value(dot, 'aria-current'))).toEqual([
      undefined,
      'true',
      undefined,
    ])
    // The APG's grouped picker: the current slide's button is disabled.
    expect(picks.map(dot => Inert.value(dot, 'aria-disabled'))).toEqual([
      undefined,
      'true',
      undefined,
    ])
    expect(picks.map(clickable)).toEqual([true, false, true])
  })

  it('disables previous on the first slide and next on the last, keeping them focusable', () => {
    const first = drawn(0, { picker: false })
    expect(Inert.value(first.previous, 'aria-disabled')).toBe('true')
    expect(Inert.value(first.previous, 'disabled')).toBe(undefined)
    expect(clickable(first.previous)).toBe(false)
    expect(first.chosen).toEqual([1])
    const last = drawn(2, { picker: false })
    expect(Inert.value(last.next, 'aria-disabled')).toBe('true')
    expect(clickable(last.next)).toBe(false)
    expect(last.chosen).toEqual([1])
  })

  it('wraps at the ends when it loops', () => {
    expect(drawn(0, { loop: true, picker: false }).chosen).toEqual([2, 1])
    expect(drawn(2, { loop: true, picker: false }).chosen).toEqual([1, 0])
  })

  it('does not loop a single slide onto itself', () => {
    const one = drawn(0, { loop: true, picker: false, count: 1 })
    expect(one.chosen).toEqual([])
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

  it('draws the picker only when asked', () => {
    expect(drawn(1, { picker: false }).picks).toEqual([])
    const [picker] = Inert.byRole(drawn(1).html, 'group').filter(
      group => Inert.value(group, 'aria-label') === 'Choose a slide',
    )
    expect(Inert.byTag(picker, 'button')).toHaveLength(3)
  })

  it('with several per view, has a place per resting point and marks every slide shown', () => {
    const { html, picks, next } = drawn(1, { perView: 2 })
    // Three slides two at a time rest at the first or the second.
    expect(picks.map(pick => Inert.value(pick, 'aria-label'))).toEqual(['1 of 3', '2 of 3'])
    expect(Inert.value(next, 'aria-disabled')).toBe('true')
    const shown = Inert.byRole(html, 'group').filter(
      group => Inert.value(group, 'aria-roledescription') === 'slide',
    )
    expect(shown.map(slide => Inert.value(slide, 'data-current'))).toEqual([
      'false',
      'true',
      'true',
    ])
    const [root] = Inert.byRole(html, 'group')
    expect(Inert.style(root)['--fk-carousel-per-view']).toBe('2')
  })

  it('draws thumbnails in place of dots, each holding its copy', () => {
    const { picks } = drawn(0, { thumbnails: true })
    expect(picks.map(pick => Inert.text(pick))).toEqual(['thumb', 'thumb', 'thumb'])
    expect(picks.map(clickable)).toEqual([false, true, true])
  })

  it('draws no rotation button unless it rotates, and then first', () => {
    expect(drawn(0).buttons.map(button => Inert.value(button, 'aria-label'))).not.toContain(
      'Stop slide rotation',
    )
    const rotating = drawn(0, { model: { rotation: 'Rotating' } })
    expect(Inert.value(rotating.buttons[0], 'aria-label')).toBe('Stop slide rotation')
    expect(Inert.value(rotating.buttons[0], 'aria-controls')).toBe('trip-track')
    expect(rotating.sent.map(message => message._tag)).toContain('StoppedRotation')
    const stopped = drawn(0, { model: { rotation: 'Stopped' } })
    expect(Inert.value(stopped.buttons[0], 'aria-label')).toBe('Start slide rotation')
    expect(stopped.sent.map(message => message._tag)).toContain('StartedRotation')
  })

  it('quiets the status while it rotates, as the APG has it', () => {
    const live = (more: Drawn) =>
      Inert.value(Inert.byRole(drawn(0, more).html, 'status')[0], 'aria-live')
    expect(live({})).toBe('polite')
    expect(live({ model: { rotation: 'Stopped' } })).toBe('polite')
    expect(live({ model: { rotation: 'Rotating' } })).toBe('off')
  })

  it('says how its rotation stands, and which wait the current dot fills over', () => {
    const state = (model: Partial<Carousel.Model>) => {
      const { html, picks } = drawn(0, { model })
      return [
        Inert.value(Inert.byRole(html, 'group')[0], 'data-rotation'),
        Inert.value(picks[0], 'data-turn'),
      ]
    }
    expect(state({ rotation: 'Rotating', counting: true, turn: 3 })).toEqual(['rotating', 'odd'])
    expect(state({ rotation: 'Rotating', counting: true, turn: 4 })).toEqual(['rotating', 'even'])
    expect(state({ rotation: 'Rotating', hovered: true, turn: 4 })).toEqual(['paused', 'even'])
    expect(state({ rotation: 'Rotating', counting: false })).toEqual(['stopped', 'even'])
    expect(state({ rotation: 'Stopped', counting: true })).toEqual(['stopped', 'even'])
  })
})

describe('Carousel.update', () => {
  const update = Carousel.update({ count: 3 })
  const at = (model: Partial<Carousel.Model> = {}): Carousel.Model => ({
    ...Carousel.init({ id: 'trip' }),
    ...model,
  })
  const rotating = at({ rotation: 'Rotating' })
  const tags = (result: ReturnType<typeof update>) =>
    (result.commands ?? []).map(command => command.name)

  it('a choice moves the index and scrolls to it', () => {
    const result = update(at(), Carousel.Message.Chose({ index: 2 }))
    expect(result.model.index).toBe(2)
    expect(tags(result)).toEqual(['Carousel.ShowSlide'])
  })

  it('choosing the slide shown scrolls back to it and changes nothing else', () => {
    const model = at({ index: 1 })
    const result = update(model, Carousel.Message.Chose({ index: 1 }))
    expect(result.model).toBe(model)
    expect(tags(result)).toEqual(['Carousel.ShowSlide'])
  })

  it('a choice past the end is the end', () => {
    expect(update(at(), Carousel.Message.Chose({ index: 7 })).model.index).toBe(2)
    expect(
      Carousel.update({ count: 3, perView: 2 })(at(), Carousel.Message.Chose({ index: 2 })).model
        .index,
    ).toBe(1)
  })

  it('a swipe that settles on another slide moves the index without scrolling again', () => {
    const result = update(at(), Carousel.Message.Settled({ index: 1 }))
    expect(result.model.index).toBe(1)
    expect(tags(result)).toEqual([])
  })

  it('settling where it already was changes nothing', () => {
    const model = at({ index: 1 })
    expect(update(model, Carousel.Message.Settled({ index: 1 })).model).toBe(model)
  })

  it('a rotating carousel that settles begins its wait, once', () => {
    const begun = update(rotating, Carousel.Message.Settled({ index: 0 }))
    expect(begun.model.counting).toBe(true)
    expect(begun.model.turn).toBe(1)
    expect(tags(begun)).toEqual(['Carousel.Wait'])
    expect(update(begun.model, Carousel.Message.Settled({ index: 0 })).model).toBe(begun.model)
  })

  it('a wait that ends moves on, scrolls and begins the next', () => {
    const counting = at({ rotation: 'Rotating', counting: true, turn: 4, index: 1 })
    const result = update(counting, Carousel.Message.Elapsed({ turn: 4 }))
    expect(result.model.index).toBe(2)
    expect(result.model.turn).toBe(5)
    expect(tags(result)).toEqual(['Carousel.ShowSlide', 'Carousel.Wait'])
  })

  it('a stale wait changes nothing', () => {
    const counting = at({ rotation: 'Rotating', counting: true, turn: 4 })
    expect(update(counting, Carousel.Message.Elapsed({ turn: 3 })).model).toBe(counting)
    const paused = at({ rotation: 'Rotating', counting: false, turn: 4 })
    expect(update(paused, Carousel.Message.Elapsed({ turn: 4 })).model).toBe(paused)
  })

  it('rotating past the last goes to the first when it loops, and stops when it does not', () => {
    const last = at({ rotation: 'Rotating', counting: true, turn: 1, index: 2 })
    expect(
      Carousel.update({ count: 3, loop: true })(last, Carousel.Message.Elapsed({ turn: 1 })).model
        .index,
    ).toBe(0)
    const ended = update(last, Carousel.Message.Elapsed({ turn: 1 })).model
    expect(ended.index).toBe(2)
    expect(ended.rotation).toBe('Stopped')
  })

  it('a pointer over it pauses it, and leaving begins a new wait', () => {
    const counting = at({ rotation: 'Rotating', counting: true, turn: 2 })
    const over = update(counting, Carousel.Message.PointerEntered()).model
    expect(over.hovered).toBe(true)
    expect(update(over, Carousel.Message.Elapsed({ turn: 2 })).model).toBe(over)
    expect(update(over, Carousel.Message.PointerEntered()).model).toBe(over)
    // Nor does a swipe under it begin one.
    expect(update(over, Carousel.Message.Settled({ index: 0 })).model).toBe(over)
    expect(tags(update(over, Carousel.Message.Settled({ index: 1 })))).toEqual([])
    const left = update(over, Carousel.Message.PointerLeft())
    expect(left.model.turn).toBe(3)
    expect(tags(left)).toEqual(['Carousel.Wait'])
    const idle = at()
    expect(update(idle, Carousel.Message.PointerLeft()).model).toBe(idle)
  })

  it('focus by the keys stops it; focus under the pointer only pauses', () => {
    const counting = at({ rotation: 'Rotating', counting: true })
    expect(update(counting, Carousel.Message.FocusEntered()).model.rotation).toBe('Stopped')
    const over = at({ rotation: 'Rotating', hovered: true })
    expect(update(over, Carousel.Message.FocusEntered()).model).toBe(over)
  })

  it('the rotation button stops and starts it, and does nothing without rotation', () => {
    const stopped = update(rotating, Carousel.Message.StoppedRotation()).model
    expect(stopped.rotation).toBe('Stopped')
    const started = update(stopped, Carousel.Message.StartedRotation())
    expect(started.model.rotation).toBe('Rotating')
    expect(tags(started)).toEqual(['Carousel.Wait'])
    const none = at()
    expect(update(none, Carousel.Message.StartedRotation()).model).toBe(none)
    expect(update(none, Carousel.Message.StoppedRotation()).model).toBe(none)
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

  it('scrolls the slide to the start, and its thumbnail into view, once the render commits', async () => {
    const frames: Array<FrameRequestCallback> = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      frames.push(callback),
    )
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const running = Effect.runPromise(Carousel.ShowSlide({ id: 'trip', index: 2 }).effect)
    // Drawn after the Command started, as the render that marks it current is.
    const asked: Array<readonly [string, boolean | ScrollIntoViewOptions | undefined]> = []
    for (const id of [Carousel.slideId('trip', 2), 'trip-pick-2']) {
      const element = document.createElement('div')
      element.id = id
      element.scrollIntoView = options => {
        asked.push([id, options])
      }
      document.body.append(element)
    }
    await vi.waitFor(() => expect(frames).toHaveLength(1))
    expect(asked).toEqual([])
    frames[0]?.(0)
    expect(await running).toEqual(Carousel.Message.CompletedShowSlide())
    expect(asked).toEqual([
      ['trip-slide-2', { block: 'nearest', inline: 'start' }],
      ['trip-pick-2', { block: 'nearest', inline: 'nearest' }],
    ])
  })
})
