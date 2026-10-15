/**
 * Progress as markup: a named progressbar whose value is its own, clamped
 * to its range, with the share done on the root for a ring to draw; and,
 * not known, no value at all, which is what indeterminate means.
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

  it('has no value while the end is not known', () => {
    const [bar] = Inert.byRole(drawn(Option.none()), 'progressbar')
    expect(Inert.value(bar, 'aria-valuenow')).toBeUndefined()
    expect(Inert.style(bar)['--fk-progress']).toBeUndefined()
    expect(Inert.value(bar, 'data-state')).toBe('indeterminate')
  })
})
