/**
 * The shared cell marks: `GridMarkStyle` has a rule for each mark by name,
 * and `GridLegend` draws a swatch per mark that the same rules paint, so the
 * legend cannot drift from the cells.
 */
import { Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { GridLegend, GridLegendStyle, GridMarkStyle, GridMarks } from 'foldkit-mixins-data-grid'
import { describe, expect, test } from 'vitest'

// Written out, not read from `GridMarks`, so renaming a mark is a failure here.
const names = ['pending', 'saved', 'refused', 'replaced', 'peer'] as const

describe('GridMarkStyle', () => {
  test.each(names)('styles the %s mark by its name', name => {
    expect(Style.stylesheet(GridMarkStyle)).toContain(`[data-mark="${name}"]`)
  })

  test('outlines every mark where colours are forced, which drops box shadows', () => {
    expect(Style.stylesheet(GridMarkStyle)).toMatch(
      /@media \(forced-colors: active\)\{[^}]*\[data-mark\]\{outline:/,
    )
  })

  test('takes a peer colour from the application when it gives one', () => {
    expect(Style.stylesheet(GridMarkStyle)).toContain('var(--fk-grid-peer,')
  })
})

describe('GridLegend', () => {
  const Legend = GridLegend<never>().pipe(Style.attach(GridLegendStyle))

  test('draws each mark, in order, as a swatch the marks rules paint, with its words', () => {
    const list = Inert.draw(Legend, {})
    expect(Inert.value(list, 'aria-label')).toBe('What the marks on a cell mean')
    const items = Inert.children(list)
    expect(items.map(item => Inert.text(item))).toEqual([
      'Not sent yet',
      'Saved, not yet in the table',
      'Not saved',
      'Replaced by another device',
      'Another device is here',
    ])
    const swatches = items.map(item => Inert.children(item)[0]!)
    expect(swatches.map(swatch => Inert.value(swatch, 'data-mark'))).toEqual([...names])
    expect(swatches.map(swatch => Inert.value(swatch, 'aria-hidden'))).toEqual(
      names.map(() => 'true'),
    )
  })

  test('draws only the marks it is given, in their order, with the words it is given', () => {
    const list = Inert.draw(Legend, {
      marks: ['refused', 'pending'],
      words: {
        label: 'Legend',
        marks: {
          pending: 'Queued',
          saved: 'Saved',
          refused: 'Refused',
          replaced: 'Replaced',
          peer: 'Peer',
        },
      },
    })
    expect(Inert.value(list, 'aria-label')).toBe('Legend')
    expect(Inert.children(list).map(item => Inert.text(item))).toEqual(['Refused', 'Queued'])
  })

  test.each(names)('paints the %s swatch with the rule the cells use', name => {
    expect(Style.stylesheet(GridLegendStyle)).toContain(`[data-mark="${name}"]`)
  })

  test('lists every mark there is', () => {
    expect([...GridMarks]).toEqual([...names])
  })
})
