/**
 * `textBlockAt`: the style of the block a selection starts in, in the shape `RetypeBlock`
 * takes, which is what a style picker presses.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const at = (node: string, offset: number): RichText.Position => ({
  node: id(node),
  offset,
  affinity: 'after',
})
const range = (from: RichText.Position, to: RichText.Position): RichText.Selection => ({
  type: 'Range',
  anchor: from,
  focus: to,
})
const text = (run: string, value: string) => ({ type: 'Text', id: run, text: value, marks: [] })

const document = RichText.decodeDocument({
  version: 1,
  children: [
    { type: 'Heading', id: 'h', level: 2, children: [text('h-t', 'title')] },
    { type: 'Paragraph', id: 'p', children: [text('p-t', 'body')] },
    {
      type: 'Node',
      kind: 'List',
      id: 'l',
      props: {},
      children: [],
      blocks: [
        {
          type: 'Node',
          kind: 'ListItem',
          id: 'li',
          props: {},
          children: [],
          blocks: [{ type: 'Paragraph', id: 'lp', children: [text('lp-t', 'item')] }],
        },
      ],
    },
    { type: 'Node', kind: 'CodeBlock', id: 'c', props: {}, children: [text('c-t', 'x')] },
  ],
})

describe('the text style a selection starts in', () => {
  it.each<[string, RichText.Selection | null, RichText.TextBlock | undefined]>([
    ['a caret in a heading', range(at('h-t', 1), at('h-t', 1)), { type: 'Heading', level: 2 }],
    ['a caret in a paragraph', range(at('p-t', 1), at('p-t', 1)), { type: 'Paragraph' }],
    [
      'a paragraph nested in a list item',
      range(at('lp-t', 0), at('lp-t', 0)),
      { type: 'Paragraph' },
    ],
    [
      'a range dragged backwards from the paragraph into the heading',
      range(at('p-t', 2), at('h-t', 1)),
      { type: 'Heading', level: 2 },
    ],
    ['a code block, which a retype does not reach', range(at('c-t', 0), at('c-t', 0)), undefined],
    ['a node selection', { type: 'Node', node: id('p') }, undefined],
    ['no selection', null, undefined],
    ['a position that resolves to nothing', range(at('gone', 0), at('gone', 0)), undefined],
  ])('%s', (_, selection, expected) => {
    expect(RichText.textBlockAt(document, selection)).toEqual(expected)
  })
})
