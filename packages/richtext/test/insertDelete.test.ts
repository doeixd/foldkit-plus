/**
 * Inserting a block beside another and deleting one by identity: what an insert menu, a
 * block handle's Duplicate and its Delete send.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const paragraph = (name: string) => ({
  type: 'Paragraph',
  id: name,
  children: [{ type: 'Text', id: `${name}-t`, text: name, marks: [] }],
})
const node = (kind: string, name: string, blocks: ReadonlyArray<unknown>) => ({
  type: 'Node',
  kind,
  id: name,
  props: {},
  children: [],
  blocks,
})

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      paragraph('a'),
      paragraph('b'),
      node('List', 'l', [
        node('ListItem', 'i1', [paragraph('p1')]),
        node('ListItem', 'i2', [paragraph('p2')]),
      ]),
    ],
  } as never)

const caretIn = (run: string, offset = 0): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(run), offset, affinity: 'after' },
  focus: { node: id(run), offset, affinity: 'after' },
})

const mintFrom = () => {
  let next = 0
  return { mint: () => `n${next++}` }
}
const vocabulary = { nodes: RichText.nodeRegistry(RichText.standardNodes) }

const shape = (blocks: ReadonlyArray<RichText.Block>): string =>
  blocks
    .map(block =>
      block.type === 'Node' && block.blocks !== undefined
        ? `${block.id}[${shape(block.blocks)}]`
        : block.id,
    )
    .join(' ')
const ok = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

describe('InsertBlock', () => {
  const insert = (block: unknown, to: RichText.Beside, selection = caretIn('a-t', 1)) =>
    RichText.run(
      { document: document(), selection },
      { type: 'InsertBlock', block: block as RichText.Block, to },
      mintFrom(),
      vocabulary,
    )

  it('lands after the block it names, under fresh identities, with the caret at its start', () => {
    const state = ok(insert(paragraph('a'), { after: id('a') }))
    expect(shape(state.document.children)).toBe('a n0 b l[i1[p1] i2[p2]]')
    expect(state.selection).toEqual(caretIn('n1'))
  })

  it('lands before one, inside a container, and keeps what it holds', () => {
    const state = ok(insert(node('ListItem', 'x', [paragraph('y')]), { before: id('i2') }))
    expect(shape(state.document.children)).toBe('a b l[i1[p1] n0[n1] i2[p2]]')
    expect(state.selection).toEqual(caretIn('n2'))
  })

  it('leaves the caret where it was when the block holds no text', () => {
    const image = {
      type: 'Node',
      kind: 'Image',
      id: 'img',
      props: { src: 'https://example.com/a.png' },
      children: [],
    }
    const state = ok(insert(image, { after: id('b') }))
    expect(shape(state.document.children)).toBe('a b n0 l[i1[p1] i2[p2]]')
    expect(state.selection).toEqual(caretIn('a-t', 1))
  })

  it('refuses a kind its container does not accept', () => {
    const result = insert(paragraph('z'), { after: id('i1') })
    expect(result.ok).toBe(false)
  })

  it('without a place, goes after the caret’s block', () => {
    const state = ok(
      RichText.run(
        { document: document(), selection: caretIn('p1-t', 1) },
        { type: 'InsertBlock', block: paragraph('z') as never },
        mintFrom(),
        vocabulary,
      ),
    )
    expect(shape(state.document.children)).toBe('a b l[i1[p1 n0] i2[p2]]')
  })

  it('without a place, goes before the caret’s block when it is empty', () => {
    const blank = RichText.decodeDocument({
      version: 1,
      children: [
        paragraph('a'),
        {
          type: 'Paragraph',
          id: 'e',
          children: [{ type: 'Text', id: 'e-t', text: '', marks: [] }],
        },
      ],
    } as never)
    const state = ok(
      RichText.run(
        { document: blank, selection: caretIn('e-t') },
        { type: 'InsertBlock', block: paragraph('z') as never },
        mintFrom(),
      ),
    )
    expect(shape(state.document.children)).toBe('a n0 e')
  })

  it('without a place or a caret, is refused', () => {
    const result = RichText.run(
      { document: document(), selection: null },
      { type: 'InsertBlock', block: paragraph('z') as never },
      mintFrom(),
    )
    expect(result).toEqual({ ok: false, error: 'InvalidSelection' })
  })

  it('refuses a place that names no block', () => {
    expect(insert(paragraph('z'), { after: id('nowhere') }).ok).toBe(false)
  })
})

describe('DeleteBlock', () => {
  const remove = (node: string, selection: RichText.Selection | null = caretIn('a-t', 1)) =>
    RichText.run(
      { document: document(), selection },
      { type: 'DeleteBlock', node: id(node) },
      mintFrom(),
      vocabulary,
    )

  it('removes the block and keeps a caret elsewhere where it was', () => {
    const state = ok(remove('b'))
    expect(shape(state.document.children)).toBe('a l[i1[p1] i2[p2]]')
    expect(state.selection).toEqual(caretIn('a-t', 1))
  })

  it('moves a caret inside it to the start of the text after it', () => {
    expect(ok(remove('a')).selection).toEqual(caretIn('b-t'))
  })

  it('moves a caret in the last text to the end of the text before it', () => {
    const state = ok(remove('l', caretIn('p2-t')))
    expect(shape(state.document.children)).toBe('a b')
    expect(state.selection).toEqual(caretIn('b-t', 1))
  })

  it('takes the containers it leaves empty with it', () => {
    const state = ok(remove('p1'))
    expect(shape(state.document.children)).toBe('a b l[i2[p2]]')
  })

  it('leaves an empty paragraph in a document it would empty', () => {
    const lone = RichText.decodeDocument({ version: 1, children: [paragraph('a')] } as never)
    const state = ok(
      RichText.run(
        { document: lone, selection: caretIn('a-t') },
        { type: 'DeleteBlock', node: id('a') },
        mintFrom(),
      ),
    )
    expect(state.document.children).toEqual([
      { type: 'Paragraph', id: 'n1', children: [{ type: 'Text', id: 'n0', text: '', marks: [] }] },
    ])
    expect(state.selection).toEqual(caretIn('n0'))
  })

  it('refuses an identity the document does not hold', () => {
    expect(remove('nowhere').ok).toBe(false)
  })
})
