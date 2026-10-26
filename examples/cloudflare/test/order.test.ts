// @vitest-environment node
/**
 * The drawn order of a created todo. Its overlay prepends it; Remote draws it
 * where `AllTodos`' body puts it: by title, binary as D1 compares it, then by
 * id. A character past U+FFFF sorts by code point, where JS `<` would put it
 * first.
 */
import { ConnectionChange, Remote } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { Data, initial } from '../src/app.js'
import { Todo } from '../src/domain.js'
import { AllTodos } from '../src/operations.js'

interface Row {
  readonly id: string
  readonly title: string
}

const list = AllTodos.ref({})

/** `rows` loaded as the whole list, and `added` shown as a pending create. */
const drawn = (rows: ReadonlyArray<Row>, added: Row): ReadonlyArray<string> => {
  const loaded = Data.reduce(
    initial('ada'),
    Remote.queryMessage(
      list,
      {
        edges: rows.map(row => ({ entity: 'Todo', id: row.id, key: `Todo:${row.id}` })),
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
        entities: rows.map(row => ({ entity: 'Todo', id: row.id, values: { ...row, done: 0 } })),
      },
      { entity: 'Todo', fields: ['id', 'title', 'done'] },
    ),
  )
  const creating = Data.overlay(loaded, 'create', [
    Remote.patch(Todo, added.id, { ...added, done: 0 }),
    ConnectionChange.prepend(list, Remote.ref(Todo, added.id)),
  ])
  return Data.visibleItems(creating.remote, list.identity).map(edge => edge.ref.id)
}

describe('a created todo', () => {
  const cases: ReadonlyArray<{
    readonly name: string
    readonly rows: ReadonlyArray<Row>
    readonly added: Row
    readonly ids: ReadonlyArray<string>
  }> = [
    {
      name: 'is the only row of an empty list',
      rows: [],
      added: { id: 'm', title: 'mmm' },
      ids: ['m'],
    },
    {
      name: 'lands between its neighbours',
      rows: [
        { id: 'a', title: 'asdf' },
        { id: 's', title: 'sdfg' },
      ],
      added: { id: 'm', title: 'mmm' },
      ids: ['a', 'm', 's'],
    },
    {
      name: 'sorts before a title it prefixes',
      rows: [{ id: 'long', title: 'ab' }],
      added: { id: 'short', title: 'a' },
      ids: ['short', 'long'],
    },
    {
      name: 'follows id among equal titles',
      rows: [{ id: 'b', title: 'Same' }],
      added: { id: 'a', title: 'Same' },
      ids: ['a', 'b'],
    },
    {
      // Folding case would put `a` first.
      name: 'sorts uppercase before lowercase',
      rows: [{ id: 'upper', title: 'B' }],
      added: { id: 'lower', title: 'a' },
      ids: ['upper', 'lower'],
    },
    {
      name: 'sorts a character past U+FFFF by code point',
      rows: [{ id: 'emoji', title: String.fromCodePoint(0x1f600) }],
      added: { id: 'private', title: String.fromCharCode(0xe000) },
      ids: ['private', 'emoji'],
    },
  ]

  it.each(cases)('$name', ({ rows, added, ids }) => {
    expect(drawn(rows, added)).toEqual(ids)
  })
})
