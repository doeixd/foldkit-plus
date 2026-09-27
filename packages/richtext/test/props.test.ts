/** Setting a node block's props: a task item's `checked`, by the item's identity. */
import type { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const standard = RichText.nodeRegistry(RichText.standardNodes)

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Node',
        kind: 'List',
        id: 'l',
        props: { ordered: false },
        children: [],
        blocks: [
          {
            type: 'Node',
            kind: 'TaskItem',
            id: 't',
            props: { checked: false },
            children: [],
            blocks: [
              {
                type: 'Paragraph',
                id: 'p',
                children: [{ type: 'Text', id: 'a', text: 'milk', marks: [] }],
              },
            ],
          },
        ],
      },
    ],
  })
const state = (): RichText.EditorState => ({ document: document(), selection: null })
const propsOf = (result: RichText.TransactionResult, path: RichText.BlockPath) => {
  if (!result.ok) throw new Error(result.error)
  const block = RichText.blockAtPath(result.state.document, path)
  return block?.type === 'Node' ? block.props : undefined
}

describe('the SetProps operation', () => {
  it('sets the props it names and keeps the others', () => {
    const start: RichText.EditorState = {
      document: RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Node',
            kind: 'Image',
            id: 'i',
            props: { src: '/a.png', alt: 'a' },
            children: [],
          },
        ],
      }),
      selection: null,
    }
    const result = RichText.apply(start, [RichText.Edit.setProps(id('i'), { alt: 'b' })])
    expect(propsOf(result, [0])).toEqual({ src: '/a.png', alt: 'b' })
    expect(result.ok && result.changeSet.dirtyNodes.has(id('i'))).toBe(true)
  })

  it('leaves the state as it was when the props already have those values', () => {
    const start = state()
    const result = RichText.apply(start, [RichText.Edit.setProps(id('t'), { checked: false })])
    expect(result.ok && result.state).toBe(start)
  })

  it.each([
    ['a text block', 'p', 'InvalidRange'],
    ['a block that is not there', 'gone', 'MissingNode'],
  ] as const)('refuses %s', (_, node, error) => {
    expect(RichText.apply(state(), [RichText.Edit.setProps(id(node), { checked: true })])).toEqual({
      ok: false,
      error,
    })
  })
})

describe('the SetProps command', () => {
  const setProps = (node: string, props: Schema.JsonObject) =>
    RichText.run(
      state(),
      { type: 'SetProps', node: id(node), props },
      { mint: () => 'unused' },
      { nodes: standard },
    )

  it('ticks a task item', () => {
    expect(propsOf(setProps('t', { checked: true }), [0, 0])).toEqual({ checked: true })
  })

  it.each([
    ['props the kind does not declare that way', 't', { checked: 'yes' }],
    ['a prop the kind does not declare', 't', { due: 'today' }],
    ['a text block', 'p', { checked: true }],
    ['a block that is not there', 'gone', { checked: true }],
  ] as const)('refuses %s', (_, node, props) => {
    expect(setProps(node, props)).toEqual({ ok: false, error: 'InvalidInput' })
  })
})
