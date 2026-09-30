/**
 * An editor's History, drawn in a real runtime: which revision is marked Live,
 * which offer Restore, and who is named as having published each.
 */
import { Option, Schema } from 'effect'
import { Cms, type RevisionRow, type State } from 'foldkit-cms'
import { SlotView } from 'foldkit-mixins'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it } from 'vitest'
import { AdminSlots } from '../src/styles/adminStyle.js'

const Message = defineMessageUnion({ RestoreAsked: { revision: Schema.Number } })
type Message = typeof Message.Type
const Model = Schema.Struct({ restored: Schema.Array(Schema.Number) })
type Model = typeof Model.Type

// Newest first, as the server lists them.
const revisions: ReadonlyArray<RevisionRow> = [
  { n: 2, publishedAt: '2026-09-27T12:00:00.000Z', publishedBy: 'edda' },
  { n: 1, publishedAt: '2026-09-24T12:00:00.000Z', publishedBy: 'someone@else' },
]

const History = SlotView.define(AdminSlots, (state: State, slots, h: HtmlBuilder<Message>) =>
  Cms.historyCard(
    slots,
    h,
    { _tag: 'Ready', revisions },
    {
      state: Option.some(state),
      restore: revision => Message.RestoreAsked({ revision }),
      authorName: name => (name === 'edda' ? 'Edda' : name),
    },
  ),
)

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

/** Draws the History of an entry in `state`, and resolves with what each Restore press asked for. */
const mount = async (state: State) => {
  const container = document.createElement('div')
  container.id = 'history-test'
  document.body.appendChild(container)
  let model: Model = { restored: [] }
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model }),
      update: (current: Model, message: Message) => {
        model = { restored: [...current.restored, message.revision] }
        return { model }
      },
      view: (_: Model, h: HtmlBuilder<Message>) => History(state, h),
    }),
  )
  dispose = () => handle.dispose()
  await expect.poll(() => document.querySelectorAll('#history li').length).toBe(2)
  return { restored: () => model.restored }
}

const rows = () =>
  Array.from(document.querySelectorAll('#history li'), row => ({
    live: row.hasAttribute('data-live'),
    text: row.textContent ?? '',
    restore: row.querySelector('button')?.getAttribute('aria-label') ?? '',
  }))

it('marks the newest Live while it is on the site, with nothing to restore it over', async () => {
  const { restored } = await mount({ _tag: 'Published', schedule: null })
  const [newest, oldest] = rows()
  expect(newest).toMatchObject({ live: true, restore: '' })
  expect(newest?.text).toMatch(/^Revision 2Live/)
  expect(oldest).toMatchObject({ live: false, restore: 'Restore revision 1' })
  document.querySelector<HTMLButtonElement>('[aria-label="Restore revision 1"]')?.click()
  await expect.poll(restored).toEqual([1])
})

it('offers the live revision back while a draft sits over it', async () => {
  const { restored } = await mount({ _tag: 'Changed', schedule: null })
  expect(rows().map(row => [row.live, row.restore])).toEqual([
    [true, 'Restore revision 2'],
    [false, 'Restore revision 1'],
  ])
  document.querySelector<HTMLButtonElement>('[aria-label="Restore revision 2"]')?.click()
  await expect.poll(restored).toEqual([2])
})

it('marks nothing Live once the entry is off the site', async () => {
  await mount({ _tag: 'Unpublished', schedule: null })
  expect(rows().map(row => [row.live, row.restore])).toEqual([
    [false, 'Restore revision 2'],
    [false, 'Restore revision 1'],
  ])
})

it('names a chair as the studio does, and anyone else as they were recorded', async () => {
  await mount({ _tag: 'Published', schedule: null })
  const byWhom = Array.from(document.querySelectorAll('#history time'), time =>
    time.parentElement?.textContent?.split(' · ').at(-1),
  )
  expect(byWhom).toEqual(['Edda', 'someone@else'])
  expect(document.querySelector('#history time')?.getAttribute('datetime')).toBe(
    '2026-09-27T12:00:00.000Z',
  )
})
