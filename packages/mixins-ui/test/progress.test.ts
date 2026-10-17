/**
 * Progress as markup: a named progressbar whose value is its own, clamped
 * to its range, with the share done on the root for a ring to draw; and,
 * not known, no value at all, which is what indeterminate means. A stacked
 * bar's value is its parts' sum, each part as wide as its share; a value
 * shown is said once, by the bar; a buffer and segments ride on the track.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Progress, ProgressSlots, Recipes } from '../src/index.js'
import { h } from './fixture.js'

const style = Style.forSlots(ProgressSlots)(Recipes.Progress({ shape: 'ring' }))
const drawn = (value: Option.Option<number>) =>
  Progress.view({ id: 'upload', label: 'Uploading', value, min: 0, max: 200, style }, h)

describe('Progress.view', () => {
  it('meets the progress pattern', () => {
    expect(A11y.validate(Patterns.Progress, ProgressSlots)).toEqual([])
  })

  it('names the bar by its label and carries its value and share', () => {
    const [bar] = Inert.byRole(drawn(Option.some(50)), 'progressbar')
    const [label] = Inert.byTag(drawn(Option.some(50)), 'span')
    expect(Inert.value(bar, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    expect(Inert.value(bar, 'aria-valuenow')).toBe('50')
    expect(Inert.value(bar, 'aria-valuemax')).toBe('200')
    expect(Inert.style(bar)['--fk-progress']).toBe('0.25')
  })

  it('clamps a value past the end, and calls it complete', () => {
    const [bar] = Inert.byRole(drawn(Option.some(500)), 'progressbar')
    expect(Inert.value(bar, 'aria-valuenow')).toBe('200')
    expect(Inert.style(bar)['--fk-progress']).toBe('1')
    expect(Inert.value(bar, 'data-state')).toBe('complete')
  })

  it('measures the share from its own start', () => {
    const share = (value: number, min: number, max: number) => {
      const [bar] = Inert.byRole(
        Progress.view({ id: 'step', label: 'Step', value: Option.some(value), min, max }, h),
        'progressbar',
      )
      return Inert.style(bar)['--fk-progress']
    }
    expect(share(150, 100, 200)).toBe('0.5')
    // A range of no width is complete, as upstream calls it.
    expect(share(100, 100, 100)).toBe('1')
  })

  it('draws the ring by the share the view writes', () => {
    expect(style.css).toContain('calc(var(--fk-progress, 0) * 1turn)')
  })

  it('has no value while the end is not known', () => {
    const [bar] = Inert.byRole(drawn(Option.none()), 'progressbar')
    expect(Inert.value(bar, 'aria-valuenow')).toBeUndefined()
    expect(Inert.style(bar)['--fk-progress']).toBeUndefined()
    expect(Inert.value(bar, 'data-state')).toBe('indeterminate')
  })
})

const bar = (options: Partial<Progress.ProgressView<never>>) =>
  Progress.view({ id: 'disk', label: 'Disk', value: Option.some(25), ...options }, h)

describe('Progress sections', () => {
  const parts = [
    { label: 'Photos', value: 30, tone: 'success' as const },
    { label: 'Mail', value: 20 },
  ]

  it('takes the parts’ sum as its value, and reads each part aloud', () => {
    const [root] = Inert.byRole(bar({ value: parts }), 'progressbar')
    expect(Inert.value(root, 'aria-valuenow')).toBe('50')
    expect(Inert.value(root, 'aria-valuetext')).toBe('Photos 30, Mail 20')
    expect(Inert.style(root)['--fk-progress']).toBe('0.5')
  })

  it('draws each part as wide as its share, in its tone, in place of one fill', () => {
    const drawn = bar({ value: parts, min: 0, max: 200 })
    const sections = Inert.all(drawn).filter(node => Inert.value(node, 'data-tone') !== undefined)
    expect(sections.map(node => Inert.style(node)['inline-size'])).toEqual(['15%', '10%'])
    expect(sections.map(node => Inert.value(node, 'data-tone'))).toEqual(['success', 'accent'])
    // The track holds the parts alone.
    const [track] = Inert.children(Inert.byRole(drawn, 'progressbar')[0]).slice(1)
    expect(Inert.children(track)).toHaveLength(2)
  })

  it('cuts the parts where the range ends', () => {
    const drawn = bar({
      value: [
        { label: 'A', value: 80 },
        { label: 'B', value: 50 },
      ],
    })
    const sections = Inert.all(drawn).filter(node => Inert.value(node, 'data-tone') !== undefined)
    expect(sections.map(node => Inert.style(node)['inline-size'])).toEqual(['80%', '20%'])
  })

  it('measures from its own start', () => {
    const [root] = Inert.byRole(
      bar({ value: [{ label: 'A', value: 10 }], min: 100, max: 120 }),
      'progressbar',
    )
    expect(Inert.value(root, 'aria-valuenow')).toBe('110')
  })
})

describe('Progress value shown', () => {
  const shown = (options: Partial<Progress.ProgressView<never>>) =>
    Inert.all(bar({ showValue: true, ...options })).filter(
      node => node.sel === 'span' && Inert.value(node, 'aria-hidden') === 'true',
    )

  it('shows the share as a percentage, hidden from a screen reader the bar already tells', () => {
    expect(shown({}).map(Inert.text)).toEqual(['25%'])
  })

  it('shows what `valueText` says, as the bar reads it', () => {
    const [text] = shown({
      value: Option.some(120),
      max: 200,
      valueText: (v, m) => `${v} of ${m} MB`,
    })
    expect(Inert.text(text)).toBe('120 of 200 MB')
    const [past] = shown({ value: Option.some(900), max: 200, valueText: (v, m) => `${v} of ${m}` })
    expect(Inert.text(past)).toBe('200 of 200')
  })

  it('shows nothing while the end is unknown, or unasked', () => {
    expect(shown({ value: Option.none() })).toEqual([])
    expect(Inert.all(bar({})).filter(node => Inert.value(node, 'aria-hidden') === 'true')).toEqual(
      [],
    )
  })
})

describe('Progress buffer and segments', () => {
  it('draws the buffer at its share, behind the fill', () => {
    const drawn = bar({ buffer: 60 })
    const [, track] = Inert.children(Inert.byRole(drawn, 'progressbar')[0])
    const [buffer, fill] = Inert.children(track)
    expect(Inert.style(buffer)['inline-size']).toBe('60%')
    expect(Inert.style(fill)['width']).toBe('25%')
  })

  it('tells the track how many steps to cut', () => {
    const [root] = Inert.byRole(bar({ segments: 4 }), 'progressbar')
    expect(Inert.value(root, 'data-segmented')).toBe('')
    expect(Inert.style(root)['--fk-progress-segments']).toBe('4')
    expect(Inert.style(root)['--fk-progress']).toBe('0.25')
  })
})
