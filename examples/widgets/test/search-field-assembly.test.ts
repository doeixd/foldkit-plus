import { Assembly, Behavior, SlotView } from 'foldkit-mixins'
import { SearchFieldSlots } from 'foldkit-mixins-ui'
import { expect, test } from 'vitest'
import { initial } from '../src/search-field/app.js'
import { searchInspection } from '../src/search-field/demo.js'
import { SearchMessage, type SearchModel } from '../src/search-field/child.js'

test('the description names the field, its recipe and its pattern with nothing missing', () => {
  const description = searchInspection()
  expect(description.conflicts).toEqual([])
  expect(description.links).toEqual([{ kind: 'bundle', name: 'Search' }])
  const [field] = description.parts
  expect(field?.name).toBe('SearchField')
  expect(field?.slots.map(slot => slot.name)).toEqual(['root', 'input', 'clear'])
  expect(field?.patternDiagnostics).toEqual([])
  expect(field?.obligations.map(item => item.slot)).toEqual(['input', 'clear'])
  expect(Assembly.textOf(description)).toContain('SearchField')
})

test('a second click owner on the clear button is named beside the first', () => {
  const Once = Behavior.forSlots(SearchFieldSlots)<SearchModel, SearchMessage>(
    {
      clear: Behavior.slot({
        attributes: ({ h }) => [h.OnClick(SearchMessage.Cleared())],
      }),
    },
    { name: 'Once' },
  )
  const Twice = Behavior.forSlots(SearchFieldSlots)<SearchModel, SearchMessage>(
    {
      clear: Behavior.slot({
        attributes: ({ h }) => [h.OnClick(SearchMessage.Cleared())],
      }),
    },
    { name: 'Twice' },
  )
  const page = SlotView.forMessages<SearchMessage>()
    .define(SearchFieldSlots, (_model: SearchModel, slots, h) => h.button(slots.clear.attrs(), []))
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
      orders: [0, 1],
      contributors: ['Once', 'Twice'],
    },
  ])
  expect(Assembly.textOf(description)).toContain('conflict clear click Once#0 Twice#1')
})
