import { Option, Schema } from 'effect'
import { Path } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import { describe, expect, it } from 'vitest'
import * as Sheet from '../src/sheet.js'
import * as WindowList from '../src/windowList.js'

const PageModel = Schema.Struct({
  filters: Sheet.Model,
  results: WindowList.Model,
  note: Schema.String,
})
type PageModel = typeof PageModel.Type

const PageMachine = Machine.compose({
  state: PageModel,
  transitions: {},
  children: {
    Filters: Machine.lift(Path.from(PageModel).filters, Sheet.machine),
    Results: Machine.lift(Path.from(PageModel).results, WindowList.machine),
  },
})

describe('Sheet.machine and WindowList.machine (Bout 3.3)', () => {
  it('lifts Sheet.machine and WindowList.machine with exact path footprints', () => {
    expect(PageMachine.footprints.FiltersSnappedTo.writes).toEqual([['filters', 'at']])
    expect(PageMachine.footprints.FiltersGrabbed.writes).toEqual([['filters', 'drag']])
    expect(PageMachine.footprints.ResultsPlaced.writes).toEqual([
      ['results', 'viewport'],
      ['results', 'from'],
      ['results', 'placed'],
    ])
    expect(PageMachine.footprints.ResultsCompletedReveal.writes).toEqual([])
  })

  it('dispatches lifted transitions and keeps identity on no-ops', () => {
    const start: PageModel = {
      filters: Sheet.init({ id: 'filters', points: [0.5, 1] }),
      results: WindowList.init({ id: 'results', estimatedHeight: 40 }),
      note: '',
    }

    const [m1] = PageMachine.update(start, {
      _tag: 'FiltersSnappedTo',
      input: { at: 1 },
    })
    expect(m1.filters.at).toBe(1)

    // Snapping to the same point keeps identity.
    const [m1Noop] = PageMachine.update(m1, {
      _tag: 'FiltersSnappedTo',
      input: { at: 1 },
    })
    expect(m1Noop).toBe(m1)

    const [m2] = PageMachine.update(m1, {
      _tag: 'ResultsPlaced',
      input: { top: 120, height: 800 },
    })
    expect(m2.results.viewport).toEqual({ top: 120, height: 800 })
    expect(m2.results.placed).toBe(true)

    // Same Placed again keeps identity.
    const [m2Noop] = PageMachine.update(m2, {
      _tag: 'ResultsPlaced',
      input: { top: 120, height: 800 },
    })
    expect(m2Noop).toBe(m2)

    const [m3] = PageMachine.update(m2, {
      _tag: 'ResultsFocused',
      input: { key: Option.some('row-1') },
    })
    expect(m3.results.held).toEqual(Option.some('row-1'))

    const [m4, emitted] = PageMachine.update(m3, {
      _tag: 'ResultsFound',
      input: { index: 5 },
    })
    expect(m4).toBe(m3)
    expect(emitted).toEqual([{ _tag: 'Reveal', id: 'results', index: 5, align: 'center' }])
  })
})
