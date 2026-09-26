/**
 * Setting and clearing a mark with props, which is what editing a link needs: `SetMark`
 * replaces an `href` a toggle could only remove, and at a caret both act on the mark's
 * extent (`markExtent`), so a link is edited without selecting it first.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const link = (href: string) => ({ name: 'Link', props: { href } })

/** `see ` · `the ` `docs` linked to /a (the second also bold) · `now` linked to /b · ` end`. */
const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'see ', marks: [] },
          { type: 'Text', id: 'b', text: 'the ', marks: [link('/a')] },
          { type: 'Text', id: 'c', text: 'docs', marks: [link('/a'), 'Bold'] },
          { type: 'Text', id: 'f', text: 'now', marks: [link('/b')] },
          { type: 'Text', id: 'd', text: ' end', marks: [] },
        ],
      },
    ],
  })

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
const caret = (node: string, offset: number) => range(at(node, offset), at(node, offset))
const marks = RichText.markRegistry(RichText.standardMarks)

const run = (selection: RichText.Selection, command: RichText.Command) => {
  let n = 0
  const result = RichText.run(
    { document: document(), selection },
    command,
    { mint: () => `new-${++n}` },
    { marks },
  )
  if (!result.ok) throw new Error(result.error)
  return result.state
}

/** Each run as `text[marks]`, the way a link edit shows. */
const runs = (state: RichText.EditorState) =>
  state.document.children[0]!.children.map(
    each =>
      `${each.text}[${each.marks
        .map(mark => (typeof mark === 'string' ? mark : `${mark.name} ${String(mark.props?.href)}`))
        .join(', ')}]`,
  )

describe('the extent of a mark around a caret', () => {
  it('spans the adjacent runs carrying the same mark with the same props', () => {
    expect(RichText.markExtent(document(), at('c', 2), 'Link')).toEqual({
      mark: link('/a'),
      selection: range(at('b', 0), { node: id('c'), offset: 4, affinity: 'before' }),
    })
  })

  it('stops at a run whose mark of that name has other props', () => {
    expect(RichText.markExtent(document(), at('f', 1), 'Link')?.selection).toEqual(
      range(at('f', 0), { node: id('f'), offset: 3, affinity: 'before' }),
    )
  })

  it('stops at a run without the mark, and is nothing outside one', () => {
    expect(RichText.markExtent(document(), at('c', 1), 'Bold')?.selection).toEqual(
      range(at('c', 0), { node: id('c'), offset: 4, affinity: 'before' }),
    )
    expect(RichText.markExtent(document(), at('a', 1), 'Link')).toBeUndefined()
    expect(RichText.markExtent(document(), at('missing', 0), 'Link')).toBeUndefined()
  })
})

describe('setting a mark', () => {
  it('replaces the props of the link around a caret, and only that link', () => {
    const state = run(caret('b', 1), { type: 'SetMark', mark: link('/z') })
    expect(runs(state)).toEqual([
      'see []',
      'the [Link /z]',
      'docs[Link /z, Bold]',
      'now[Link /b]',
      ' end[]',
    ])
    expect(state.selection).toEqual(caret('b', 1))
  })

  it('puts the mark on exactly the range, even where every run already has one', () => {
    const state = run(range(at('a', 2), at('f', 3)), { type: 'SetMark', mark: link('/z') })
    expect(runs(state)).toEqual([
      'se[]',
      // Normalizing merges the runs whose marks are now the same.
      'e the [Link /z]',
      'docs[Link /z, Bold]',
      'now[Link /z]',
      ' end[]',
    ])
  })

  it('does nothing at a caret outside the mark', () => {
    const before = document()
    const state = run(caret('a', 1), { type: 'SetMark', mark: link('/z') })
    expect(state.document).toEqual(before)
  })

  it('refuses a mark the vocabulary does not declare', () => {
    const result = RichText.run(
      { document: document(), selection: caret('b', 1) },
      { type: 'SetMark', mark: link('/z') },
      { mint: () => 'x' },
    )
    expect(result).toMatchObject({ ok: false, error: 'InvalidInput' })
  })
})

describe('clearing a mark', () => {
  it('takes the link around a caret off every run it spans', () => {
    const state = run(caret('c', 3), { type: 'ClearMark', mark: 'Link' })
    expect(runs(state)).toEqual(['see the []', 'docs[Bold]', 'now[Link /b]', ' end[]'])
  })

  it('takes the mark off a range, whatever its props', () => {
    const state = run(range(at('c', 2), at('f', 3)), { type: 'ClearMark', mark: 'Link' })
    expect(runs(state)).toEqual([
      'see []',
      'the [Link /a]',
      'do[Link /a, Bold]',
      'cs[Bold]',
      'now end[]',
    ])
  })

  it('leaves a toggle at a caret doing nothing, as before', () => {
    expect(run(caret('c', 3), { type: 'ToggleMark', mark: 'Link' }).document).toEqual(document())
  })
})
