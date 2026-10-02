import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

/**
 * `apply` remembers every block that passed validation, nested ones included, so an edit
 * inside a container re-validates only the path to it. These cases change a container
 * around children already remembered, and check that `apply` still decides exactly what the
 * full schema decides.
 */

const decodeState = Schema.decodeUnknownSync(RichText.EditorState, { onExcessProperty: 'error' })
const accepts = (state: unknown): boolean => RichText.apply(state as RichText.EditorState, []).ok

const item = (n: number): Record<PropertyKey, unknown> => ({
  type: 'Node',
  kind: 'ListItem',
  id: `li${n}`,
  props: {},
  children: [],
  blocks: [
    {
      type: 'Paragraph',
      id: `p${n}`,
      children: [{ type: 'Text', id: `t${n}`, text: 'x', marks: [] }],
    },
  ],
})
const list = (id: string, blocks: ReadonlyArray<unknown>): Record<PropertyKey, unknown> => ({
  type: 'Node',
  kind: 'List',
  id,
  props: {},
  children: [],
  blocks,
})
const state = (...children: ReadonlyArray<unknown>) => ({
  document: { version: 1, children },
  selection: null,
})

/** Items that have passed validation inside a list, so the cache holds each of them. */
const cachedItems = () => {
  const items = [item(1), item(2)]
  expect(accepts(state(list('list', items)))).toBe(true)
  return items
}

const withExtra = (block: Record<PropertyKey, unknown>, key: PropertyKey, enumerable: boolean) =>
  Object.defineProperty({ ...block }, key, { value: 1, enumerable })

describe('validation cache', () => {
  it.each<[string, (items: ReadonlyArray<Record<PropertyKey, unknown>>) => unknown]>([
    [
      'an invalid block beside cached ones',
      items => state(list('list', [...items, { type: 'Paragraph', id: '', children: [] }])),
    ],
    [
      'an invalid run deep under a new item',
      items =>
        state(
          list('list', [
            ...items,
            {
              ...item(3),
              blocks: [
                {
                  type: 'Paragraph',
                  id: 'p3',
                  children: [{ type: 'Text', id: 't3', text: 1, marks: [] }],
                },
              ],
            },
          ]),
        ),
    ],
    ['a cached item held twice', items => state(list('list', [...items, items[0]]))],
    ['a cached item in two containers', items => state(list('a', items), list('b', [items[1]]))],
    [
      'a new block reusing a cached id',
      items => state(list('list', [...items, { ...item(3), id: 'li1' }])),
    ],
    ['a container reusing a nested id', items => state(list('p1', items))],
    [
      'cached items under a paragraph',
      items => state({ type: 'Paragraph', id: 'q', children: [], blocks: items }),
    ],
    [
      'a new container with runs and cached blocks',
      items =>
        state({
          ...list('list', items),
          children: [{ type: 'Text', id: 'r', text: '', marks: [] }],
        }),
    ],
    [
      'a new container with an excess key',
      items => state(withExtra(list('list', items), 'extra', true)),
    ],
    ['a new container with no kind', items => state({ ...list('list', items), kind: '' })],
  ])('rejects %s, as the schema does', (_, make) => {
    const input = make(cachedItems())
    expect(() => decodeState(input)).toThrow()
    expect(accepts(input)).toBe(false)
  })

  it.each<[string, (items: ReadonlyArray<Record<PropertyKey, unknown>>) => unknown]>([
    ['cached items in a new container', items => state(list('other', items))],
    ['cached items nested one level deeper', items => state(list('outer', [list('inner', items)]))],
    [
      'cached items under hidden blocks',
      items =>
        state(
          Object.defineProperty({ ...list('list', []) }, 'blocks', {
            value: items,
            enumerable: false,
          }),
        ),
    ],
    // Since Effect 4.0.0 a non-enumerable own key is not an excess property: JSON and a
    // spread never carry one, so the decoder skips it, and `apply` must agree.
    [
      'a new container with a hidden excess key',
      items => state(withExtra(list('list', items), 'extra', false)),
    ],
    [
      'a new container with a hidden symbol key',
      items => state(withExtra(list('list', items), Symbol('extra'), false)),
    ],
  ])('accepts %s, as the schema does', (_, make) => {
    const input = make(cachedItems())
    expect(() => decodeState(input)).not.toThrow()
    expect(accepts(input)).toBe(true)
  })

  it('does not decode a nested block again once it has passed', () => {
    let reads = 0
    const watched = new Proxy(item(1), {
      ownKeys: target => {
        reads += 1
        return Reflect.ownKeys(target)
      },
    })
    expect(accepts(state(list('list', [watched])))).toBe(true)
    const afterFirst = reads
    expect(afterFirst).toBeGreaterThan(0)
    expect(accepts(state(list('list', [watched, item(2)])))).toBe(true)
    expect(reads).toBe(afterFirst)
  })
})
