/**
 * The marquee as markup and as a Model. The markup: a region with the
 * marquee's role description, named by its label; the content once for
 * assistive technology and the keys, its copies inert; enough copies to fill
 * the viewport and one more; the timing from what was measured; the pause
 * press saying what it will do. The Model: a size or a pause that changes
 * nothing keeps it.
 */
import { describe, expect, it } from 'vitest'
import { A11y, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import { Marquee, MarqueeSlots, Patterns } from '../src/index.js'
import { Marquee as Recipe } from '../src/recipes/marquee.js'
import { message, type TestMessage } from './fixture.js'

const { Message } = Marquee
const model = Marquee.init({ id: 'logos' })
const measured = (content: number, viewport: number) =>
  Marquee.update(
    Marquee.update(model, Message.MeasuredContent({ size: content })).model,
    Message.MeasuredViewport({ size: viewport }),
  ).model

type More = Partial<Marquee.MarqueeView<TestMessage>>
const style = Style.forSlots(MarqueeSlots)(Recipe({}))
const Shown = SlotView.forMessages<TestMessage>().define(MarqueeSlots, (more: More, _, h) =>
  Marquee.view(
    {
      model,
      label: 'Our customers',
      items: [h.span([], ['Acme']), h.a([h.Href('/globex')], ['Globex'])],
      onMessage: () => message('Clicked'),
      style,
      ...more,
    },
    h,
  ),
)
const drawn = (more: More = {}) => Inert.draw(Shown, more)
const rootOf = (more: More = {}) => Inert.byRole(drawn(more), 'region')[0]

describe('Marquee.view', () => {
  it('meets the marquee pattern', () => {
    expect(A11y.validate(Patterns.Marquee, MarqueeSlots)).toEqual([])
  })

  it('is a region described as a marquee and named by its label', () => {
    const root = rootOf()
    expect(Inert.value(root, 'aria-roledescription')).toBe('marquee')
    expect(Inert.value(root, 'aria-label')).toBe('Our customers')
    expect([Inert.value(root, 'data-side'), Inert.value(root, 'data-orientation')]).toEqual([
      'start',
      'horizontal',
    ])
    expect(Inert.value(rootOf({ side: 'bottom' }), 'data-orientation')).toBe('vertical')
  })

  it('draws the content once for reading and its copies inert', () => {
    const copies = Inert.bySlot(drawn(), 'content')
    expect(copies).toHaveLength(2)
    expect(
      copies.map(copy => [Inert.value(copy, 'inert'), Inert.value(copy, 'data-clone')]),
    ).toEqual([
      [undefined, undefined],
      ['', ''],
    ])
    expect(copies.map(copy => Inert.text(copy))).toEqual(['AcmeGlobex', 'AcmeGlobex'])
    // The items are the application's markup; around them, everything is in a Slot.
    expect(Inert.unslotted(drawn({ items: [] }))).toEqual([])
  })

  it('draws enough copies to fill the viewport and one more, never fewer than asked', () => {
    const count = (more: More) => Inert.bySlot(drawn(more), 'content').length
    expect(count({ model: measured(300, 1000) })).toBe(5)
    expect(count({ model: measured(300, 1000), autoFill: false })).toBe(2)
    expect(count({ model: measured(2000, 1000) })).toBe(2)
    expect(count({ model: measured(2000, 1000), repeat: 4 })).toBe(4)
  })

  it('times a round by the length measured and the speed, with the delay and the rounds', () => {
    const timing = (more: More) => Inert.style(rootOf(more))
    expect(timing({ model: measured(300, 1000), speed: 60 })['--fk-marquee-duration']).toBe('5s')
    expect(timing({})['--fk-marquee-duration']).toBeUndefined()
    const rounds = timing({ delay: 2, loopCount: 3 })
    expect([rounds['--fk-marquee-delay'], rounds['--fk-marquee-loop-count']]).toEqual(['2s', '3'])
    expect(timing({})['--fk-marquee-loop-count']).toBe('infinite')
  })

  it('pauses on interaction unless asked not to, and marks a pause it holds', () => {
    expect(Inert.value(rootOf(), 'data-pause-on-interaction')).toBe('')
    expect(
      Inert.value(rootOf({ pauseOnInteraction: false }), 'data-pause-on-interaction'),
    ).toBeUndefined()
    const paused = Marquee.update(model, Message.Paused()).model
    expect(Inert.value(rootOf({ model: paused }), 'data-paused')).toBe('')
    expect(Inert.value(rootOf(), 'data-paused')).toBeUndefined()
  })

  it('names its pause press by what it will do, and draws none when asked', () => {
    const [moving] = Inert.bySlot(drawn(), 'pause')
    expect(Inert.value(moving, 'aria-label')).toBe('Pause')
    const paused = Marquee.update(model, Message.Paused()).model
    const [held] = Inert.bySlot(
      drawn({ model: paused, pauseLabels: { pause: 'Hold', play: 'Go' } }),
      'pause',
    )
    expect(Inert.value(held, 'aria-label')).toBe('Go')
    expect(Inert.bySlot(drawn({ controls: false }), 'pause')).toEqual([])
  })

  it('reads only tokens the theme declares', () => {
    const theme = Theme.compose(
      Theme.tokens,
      Theme.oklch({ accent: { h: 260, c: 0.15, l: '55%' } }),
    )
    expect(Inert.missingTokens(drawn(), Style.stylesheet(Theme.root(theme)))).toEqual([])
  })
})

describe('Marquee.update', () => {
  it('takes what is measured, and its pause and play', () => {
    expect([measured(300, 1000).content, measured(300, 1000).viewport]).toEqual([300, 1000])
    const paused = Marquee.update(model, Message.Paused()).model
    expect(paused.paused).toBe(true)
    expect(Marquee.update(paused, Message.Resumed()).model.paused).toBe(false)
  })

  it('keeps its Model when nothing changes', () => {
    const sized = measured(300, 1000)
    expect(Marquee.update(sized, Message.MeasuredContent({ size: 300 })).model).toBe(sized)
    expect(Marquee.update(sized, Message.MeasuredViewport({ size: 1000 })).model).toBe(sized)
    expect(Marquee.update(sized, Message.Resumed()).model).toBe(sized)
    const paused = Marquee.update(sized, Message.Paused()).model
    expect(Marquee.update(paused, Message.Paused()).model).toBe(paused)
  })
})
