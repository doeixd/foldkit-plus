/**
 * Typing at a mark's edge: a mark that does not extend past it stops there, at the outer edge of
 * a block (where there is no neighbouring run to type into) as inside one, and in a nested block
 * as at the top level.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const marks = RichText.markRegistry([...RichText.standardMarks, RichText.FootnoteRef])
const reference = { name: 'FootnoteRef', props: { label: '1' } }

const paragraph = (children: ReadonlyArray<unknown>) => ({ type: 'Paragraph', id: 'p', children })
const run = (runId: string, text: string, runMarks: ReadonlyArray<unknown> = []) => ({
  type: 'Text',
  id: runId,
  text,
  marks: runMarks,
})
const typed = (
  children: ReadonlyArray<unknown>,
  at: { readonly node: string; readonly offset: number; readonly affinity: 'before' | 'after' },
  wrap: (block: unknown) => unknown = block => block,
) => {
  const document = RichText.decodeDocument({ version: 1, children: [wrap(paragraph(children))] })
  const position = { ...at, node: id(at.node) }
  let n = 0
  const result = RichText.run(
    { document, selection: { type: 'Range', anchor: position, focus: position } },
    { type: 'InsertText', text: 'x' },
    { mint: () => `new-${n++}` },
    { marks },
  )
  if (!result.ok) throw new Error(result.error)
  const runs: Array<[string, number]> = []
  RichText.eachBlock(result.state.document.children, block => {
    for (const each of block.children) runs.push([each.text, each.marks.length])
  })
  return runs
}

describe('typing at the outer edge of a block', () => {
  it.each(['before', 'after'] as const)(
    'after a reference ending it leaves the reference (%s)',
    affinity => {
      expect(
        typed([run('a', 'Claim '), run('r', '1', [reference])], { node: 'r', offset: 1, affinity }),
      ).toEqual([
        ['Claim ', 0],
        ['1', 1],
        ['x', 0],
      ])
    },
  )

  it('before inline code starting it leaves the code', () => {
    expect(
      typed([run('c', 'code', ['Code']), run('b', ' tail')], {
        node: 'c',
        offset: 0,
        affinity: 'before',
      }),
    ).toEqual([
      ['x', 0],
      ['code', 1],
      [' tail', 0],
    ])
  })

  it('after bold ending it keeps bold, which extends', () => {
    expect(
      typed([run('a', 'plain '), run('b', 'bold', ['Bold'])], {
        node: 'b',
        offset: 4,
        affinity: 'after',
      }),
    ).toEqual([
      ['plain ', 0],
      ['boldx', 1],
    ])
  })

  it('keeps a mark the vocabulary does not declare, which was already there', () => {
    expect(
      typed([run('r', '1', ['Glow', reference])], { node: 'r', offset: 1, affinity: 'after' }),
    ).toEqual([
      ['1', 2],
      ['x', 1],
    ])
  })

  it('inside a run changes nothing', () => {
    expect(
      typed([run('r', '12', [reference])], { node: 'r', offset: 1, affinity: 'after' }),
    ).toEqual([['1x2', 1]])
  })
})

it('leaves a reference inside a list item, where the neighbouring run takes the text', () => {
  const inItem = (block: unknown) => ({
    type: 'Node',
    kind: 'List',
    id: 'list',
    props: {},
    children: [],
    blocks: [
      { type: 'Node', kind: 'ListItem', id: 'item', props: {}, children: [], blocks: [block] },
    ],
  })
  expect(
    typed(
      [run('r', '1', [reference]), run('b', ' after')],
      { node: 'r', offset: 1, affinity: 'after' },
      inItem,
    ),
  ).toEqual([
    ['1', 1],
    ['x after', 0],
  ])
})
