/**
 * Indentation in code: Tab and Shift+Tab at a caret and over lines, and Enter keeping the line's
 * indentation. Code is the standard `CodeBlock`, which declares `lineBreaks`.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const code = (text: string) =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Node',
        kind: 'CodeBlock',
        id: 'code',
        props: {},
        children: [{ type: 'Text', id: 't', text, marks: [] }],
      },
    ],
  })
const range = (from: number, to: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id('t'), offset: from, affinity: 'after' },
  focus: { node: id('t'), offset: to, affinity: 'after' },
})
const nodes = RichText.nodeRegistry(RichText.standardNodes)
const run = (text: string, selection: RichText.Selection, command: RichText.Command) => {
  let next = 0
  const result = RichText.run(
    { document: code(text), selection },
    command,
    { mint: () => `n${next++}` },
    { nodes },
  )
  if (!result.ok) throw new Error(result.error)
  const block = result.state.document.children[0]!
  const offset = (end: 'anchor' | 'focus') =>
    result.state.selection?.type === 'Range' ? result.state.selection[end].offset : undefined
  return {
    text: block.children.map(each => each.text).join(''),
    at: [offset('anchor'), offset('focus')],
  }
}

describe('Tab in code', () => {
  it('at a caret, indents where the caret is, and the caret goes after it', () => {
    expect(run('ab', range(1, 1), { type: 'Indent' })).toEqual({ text: 'a  b', at: [3, 3] })
  })

  it('moves a caret that leans before its offset, as a browser reports a line’s start', () => {
    const leaning: RichText.Selection = {
      type: 'Range',
      anchor: { node: id('t'), offset: 0, affinity: 'before' },
      focus: { node: id('t'), offset: 0, affinity: 'before' },
    }
    expect(run('ab', leaning, { type: 'Indent' })).toEqual({ text: '  ab', at: [2, 2] })
  })

  it('over a range, indents the start of every line it covers', () => {
    // Lines `one`, `two`, `three`; the range runs from inside `one` to inside `two`.
    expect(run('one\ntwo\nthree', range(1, 5), { type: 'Indent' }).text).toBe('  one\n  two\nthree')
  })

  it('leaves a line the range only reaches the start of', () => {
    expect(run('one\ntwo', range(0, 4), { type: 'Indent' }).text).toBe('  one\ntwo')
  })
})

describe('Shift+Tab in code', () => {
  it.each([
    ['a caret’s line, by a level', '    x', range(4, 4), '  x'],
    ['what is there, when less than a level', ' x', range(2, 2), 'x'],
    ['a tab', '\tx', range(1, 1), 'x'],
    ['nothing from a line with no indentation', 'x', range(1, 1), 'x'],
    ['every line a range covers', '  a\n  b\nc', range(2, 6), 'a\nb\nc'],
  ])('outdents %s', (_, text, selection, expected) => {
    expect(run(text, selection, { type: 'Outdent' }).text).toBe(expected)
  })
})

describe('Enter in code', () => {
  it('starts the new line as indented as the one it broke', () => {
    expect(run('  if (x) {', range(10, 10), { type: 'SplitBlock' })).toEqual({
      text: '  if (x) {\n  ',
      at: [13, 13],
    })
  })

  it('carries only the indentation before the caret', () => {
    expect(run('    ab', range(2, 2), { type: 'SplitBlock' }).text).toBe('  \n    ab')
  })
})

it('takes Tab in code', () => {
  expect(RichText.takesTab(code('x'), range(0, 0), nodes)).toBe(true)
  expect(RichText.takesTab(code('x'), range(0, 0))).toBe(false)
})
