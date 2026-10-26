import { Crud, Display } from 'foldkit-crud'
import { Entity } from 'foldkit-entity'
import { SlotView } from 'foldkit-mixins'
import { ListView } from 'foldkit-mixins-crud'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { Cms, type State } from '../src/index.js'

const state = (tag: State['_tag'], schedule: State['schedule'] = null): State => ({
  _tag: tag,
  schedule,
})
const at = '2026-03-02T10:00:00.000Z'

describe('Cms.Display.State', () => {
  const display = Cms.Display.State.of({})
  it('says the state, and what its schedule adds', () => {
    expect(Display.show(display, state('Published'))).toBe('Published')
    expect(Display.show(display, state('Changed', { at, overdue: false, error: null }))).toBe(
      'Changed, scheduled',
    )
    // A publish that did not happen is not dressed up as one that will.
    expect(Display.show(display, state('New', { at, overdue: true, error: 'slug taken' }))).toBe(
      'New, overdue',
    )
  })

  it('takes the application’s words', () => {
    const worded = Cms.Display.State.of({
      words: {
        Changed: 'Unpublished changes',
        overdue: 'late',
        withSchedule: '{state} ({schedule})',
      },
    })
    expect(Display.show(worded, state('Changed', { at, overdue: true, error: null }))).toBe(
      'Unpublished changes (late)',
    )
  })
})

describe('Cms.Display.Moment', () => {
  it('is the date and the time, with no clock', () => {
    expect(Display.show(Cms.Display.Moment.of({}), at)).toBe('Mar 2, 2026, 10:00 AM')
  })

  it.each([
    ['2026-03-05T10:00:00.000Z', '3 days ago'],
    ['2026-03-02T13:00:00.000Z', '3 hours ago'],
    ['2026-03-02T10:00:20.000Z', 'this minute'],
    ['2026-03-01T10:00:00.000Z', 'tomorrow'],
    ['2027-04-02T10:00:00.000Z', 'last year'],
  ])('reads relative to a clock at %s', (now, said) => {
    expect(Display.show(Cms.Display.Moment.of({ now: () => new Date(now) }), at)).toBe(said)
  })

  it('says what is no time as it is', () => {
    expect(Display.show(Cms.Display.Moment.of({}), 'soon')).toBe('soon')
  })
})

describe('the display renderers, beside the mixins’ own', () => {
  it('draw an entry’s state as a badge and its times as times, with nothing said in the list', () => {
    const Rows = Entity.select(Cms.Entities.Entry, { label: true, state: true, createdAt: true })
    const List = Crud.list('Entries', { query: Cms.Entries, selection: Rows })
    expect(List.columns.map(column => column.display.kind)).toEqual([
      'Text',
      'CmsState',
      'CmsMoment',
    ])

    const Table = ListView.forMessages<never>().define(List)
    const row = {
      id: Cms.newEntryId(),
      label: 'Hello',
      state: state('Changed', { at, overdue: true, error: null }),
      createdAt: at,
    }
    const root = Table(
      {
        page: {
          _tag: 'Ready',
          value: { items: [row], hasNext: false, hasPrevious: false },
        } as never,
        renderers: Cms.displayRenderers(),
      },
      SlotView.inertBuilder(),
    )

    const badge = Inert.all(root).find(node => node.data?.attrs?.['data-cms-state'] !== undefined)
    expect(badge?.data?.attrs).toEqual({
      'data-cms-state': 'Changed',
      'data-cms-schedule': 'overdue',
    })
    expect(Inert.text(badge)).toBe('Changed, overdue')
    const time = Inert.all(root).find(node => node.sel === 'time')
    expect(time?.data?.attrs?.['datetime']).toBe(at)
    expect(Inert.text(time)).toBe('Mar 2, 2026, 10:00 AM')
  })
})
