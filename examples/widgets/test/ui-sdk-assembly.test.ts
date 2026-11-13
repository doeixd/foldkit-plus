import { Assembly, Behavior, SlotView } from 'foldkit-mixins'
import { expect, test } from 'vitest'
import {
  initial,
  Message,
  searchInspection,
  searchInspectionView,
  SearchMessage,
  SearchModel,
  SearchSlots,
} from '../src/ui-sdk-search-field.js'

const h = SlotView.inertBuilder<Message>()

test('the search description is what the inspection view draws', () => {
  const description = searchInspection()
  const text = searchInspectionView(description, h)
  const drawn = JSON.stringify(text)
  expect(description.conflicts).toEqual([])
  expect(description.attachments.map(attachment => attachment.name)).toEqual(['ClearLabel'])
  expect(description.parts[0]?.name).toBe('Input')
  expect(description.parts[0]?.attachments.map(attachment => attachment.name)).toEqual([
    'SearchInput',
    'Keyboard',
  ])
  expect(description.parts[0]?.attachments[1]?.slots[0]?.events).toBe('unknown')
  expect(description.parts[0]?.obligations.map(item => item.slot)).toEqual([
    'input',
    'label',
    'description',
  ])
  expect(description.parts[0]?.patternDiagnostics).toEqual([])
  expect(description.links).toEqual([{ kind: 'bundle', name: 'Search' }])
  expect(drawn).toContain('ClearLabel')
  expect(drawn).toContain('Keyboard')
  expect(drawn).not.toContain('Clear search')
})

test('resolving the same field names the keydown claim and still not the label text', () => {
  const description = searchInspection(initial.first)
  expect(description.parts[0]?.attachments[1]?.slots[0]).toMatchObject({
    slot: 'input',
    reads: 'unknown',
    events: ['keydown'],
  })
  expect(JSON.stringify(description)).not.toContain('Clear search')
  expect(JSON.stringify(searchInspectionView(description, h))).toContain('keydown')
})

test('a second click owner is named beside the first in the description the view draws', () => {
  const Once = Behavior.forSlots(SearchSlots)<SearchModel, SearchMessage>(
    {
      clear: Behavior.slot({
        attributes: ({ h: builder }) => [builder.OnClick(SearchMessage.Cleared())],
      }),
    },
    { name: 'Once' },
  )
  const Twice = Behavior.forSlots(SearchSlots)<SearchModel, SearchMessage>(
    {
      clear: Behavior.slot({
        attributes: ({ h: builder }) => [builder.OnClick(SearchMessage.Cleared())],
      }),
    },
    { name: 'Twice' },
  )
  const page = SlotView.forMessages<SearchMessage>()
    .define(SearchSlots, (_model: SearchModel, slots, builder) =>
      builder.button(slots.clear.attrs(), ['Clear']),
    )
    .pipe(Behavior.attach(Once), Behavior.attach(Twice))
  const description = Assembly.describe({
    name: 'Search',
    view: page,
    behaviors: [Once, Twice],
    input: initial.first,
  })
  expect(description.conflicts).toEqual([
    {
      code: 'mixins:event-conflict',
      slot: 'clear',
      name: 'click',
      contributors: ['Once', 'Twice'],
    },
  ])
  expect(JSON.stringify(searchInspectionView(description, h))).toContain(
    'conflict clear click Once Twice',
  )
})
