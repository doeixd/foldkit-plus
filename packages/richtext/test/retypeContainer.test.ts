/**
 * Retyping the container around the caret's block in place: a list item becomes a task where it
 * stands, keeping its identity, its blocks, and its siblings, and the vocabulary decides which
 * kinds it may become.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const nodes = RichText.nodeRegistry(RichText.standardNodes)

const paragraph = (name: string, text: string) => ({
  type: 'Paragraph',
  id: name,
  children: [{ type: 'Text', id: `${name}-t`, text, marks: [] }],
})
const node = (kind: string, name: string, props: object, blocks: ReadonlyArray<unknown>) => ({
  type: 'Node',
  kind,
  id: name,
  props,
  children: [],
  blocks,
})

/** A list of three items, the middle one loose (two paragraphs) and holding a sub-list. */
const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      node('List', 'list', {}, [
        node('ListItem', 'one', {}, [paragraph('one-p', 'milk')]),
        node('ListItem', 'two', {}, [
          paragraph('two-p', 'eggs'),
          paragraph('two-q', 'free range'),
          node('List', 'sub', {}, [node('ListItem', 'sub-i', {}, [paragraph('sub-p', 'six')])]),
        ]),
        node('ListItem', 'three', {}, [paragraph('three-p', 'bread')]),
      ]),
      node('Quote', 'quote', {}, [paragraph('quote-p', 'said')]),
      paragraph('top', 'plain'),
    ],
  })

const caretIn = (block: string): RichText.Selection => {
  const at = { node: id(`${block}-t`), offset: 0, affinity: 'after' } as const
  return { type: 'Range', anchor: at, focus: at }
}
const task = { kind: 'TaskItem', props: { checked: true } }

const retype = (
  block: string,
  to: RichText.Container = task,
  options: RichText.RunOptions = { nodes },
) =>
  RichText.run(
    { document: document(), selection: caretIn(block) },
    { type: 'RetypeContainer', to },
    { mint: () => 'unused' },
    options,
  )

describe('retyping the container around the caret', () => {
  it('makes a list item a task where it stands, keeping its blocks and its siblings', () => {
    const result = retype('two-p')
    if (!result.ok) throw new Error(result.error)
    const [list] = result.state.document.children
    const before = document().children[0]
    if (list?.type !== 'Node' || before?.type !== 'Node') throw new Error('no list')
    expect(list.blocks?.map(block => block.id)).toEqual(['one', 'two', 'three'])
    expect(list.blocks?.[1]).toEqual({ ...before.blocks![1], kind: 'TaskItem', props: task.props })
    expect([list.blocks?.[0], list.blocks?.[2]]).toEqual([before.blocks?.[0], before.blocks?.[2]])
    expect(result.state.selection).toEqual(caretIn('two-p'))
  })

  it.each([
    ['in a nested list', 'sub-p', 'sub-i'],
    ['first in its list', 'one-p', 'one'],
    ['last in its list', 'three-p', 'three'],
  ])('retypes only the innermost container, %s', (_, block, item) => {
    const result = retype(block)
    if (!result.ok) throw new Error(result.error)
    const tasks: Array<string> = []
    const visit = (blocks: ReadonlyArray<RichText.Block>) => {
      for (const each of blocks) {
        if (each.type !== 'Node') continue
        if (each.kind === 'TaskItem') tasks.push(each.id)
        visit(each.blocks ?? [])
      }
    }
    visit(result.state.document.children)
    expect(tasks).toEqual([item])
  })

  it.each([
    ['from a block that is not its container’s first', 'two-q', task, 'InvalidInput'],
    ['with no container', 'top', task, 'InvalidInput'],
    ['to props the kind does not decode', 'two-p', { kind: 'TaskItem', props: {} }, 'InvalidInput'],
    ['to a kind that may not stand there', 'quote-p', task, 'UnexpectedChild'],
    ['to a kind its parent does not hold', 'two-p', { kind: 'Quote' }, 'UnexpectedChild'],
    ['to a kind that holds no blocks', 'quote-p', { kind: 'CodeBlock' }, 'UnexpectedChild'],
    ['to a kind that does not hold its blocks', 'quote-p', { kind: 'List' }, 'UnexpectedChild'],
  ] as const)('refuses %s', (_, block, to, error) => {
    expect(retype(block, to)).toEqual({ ok: false, error })
  })

  it('refuses a kind a block it holds may not stand in', () => {
    const figures = RichText.nodeRegistry([
      ...RichText.standardNodes,
      RichText.node('Figure', { children: RichText.blockContent }),
      RichText.node('Caption', { within: ['Figure'] }),
    ])
    const start = RichText.decodeDocument({
      version: 1,
      children: [
        node('Figure', 'figure', {}, [
          paragraph('figure-p', 'image'),
          {
            type: 'Node',
            kind: 'Caption',
            id: 'caption',
            props: {},
            children: [{ type: 'Text', id: 'caption-t', text: 'a cat', marks: [] }],
          },
        ]),
      ],
    })
    const run = (kind: string) =>
      RichText.run(
        { document: start, selection: caretIn('figure-p') },
        { type: 'RetypeContainer', to: { kind } },
        { mint: () => 'unused' },
        { nodes: figures },
      )
    expect(run('Quote')).toEqual({ ok: false, error: 'UnexpectedChild' })
    expect(run('Figure').ok).toBe(true)
  })
})
