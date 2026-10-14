/**
 * The inline Markdown markers, closed as they are typed: what each matches and refuses, and the
 * text it leaves, marked, with the next typing plain.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { markdownInlineRules } from '../src/input.js'

/** The text before the caret once `typed` is typed after `before`, as the editor reads a rule. */
const ruled = (before: string, typed: string) =>
  RichText.resolveInputRules(markdownInlineRules, {
    textBefore: before,
    text: typed,
    insertion: { type: 'InsertText', text: typed },
  })

/** Types the last character of `text` after the rest, and returns the runs and stored marks. */
const typedOut = (text: string) => {
  const before = text.slice(0, -1)
  let next = 0
  const document = RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 't', text: before, marks: [] }],
      },
    ],
  })
  const caret = {
    node: RichText.NodeId.make('t'),
    offset: before.length,
    affinity: 'after',
  } as const
  const { action, storedMarks } = ruled(before, text.slice(-1))
  const result = RichText.runAction(
    { document, selection: { type: 'Range', anchor: caret, focus: caret } },
    action,
    { mint: () => `m${next++}` },
    { marks: RichText.markRegistry(RichText.standardMarks) },
  )
  if (!result.ok) throw new Error(result.error)
  return {
    runs: result.state.document.children[0]!.children.map(run => [
      run.text,
      run.marks.map(RichText.markName).join(','),
    ]),
    storedMarks,
  }
}

describe('the inline Markdown markers', () => {
  it.each([
    ['**bold**', 'Bold'],
    ['*italic*', 'Italic'],
    ['_italic_', 'Italic'],
    ['`code`', 'Code'],
    ['~~struck~~', 'Strikethrough'],
  ])('turn %s into marked text as the marker closes, and end the mark there', (marked, mark) => {
    const word = marked.replace(/[*_`~]/g, '')
    expect(typedOut(`see ${marked}`)).toEqual({
      runs: [
        ['see ', ''],
        [word, mark],
      ],
      storedMarks: [],
    })
  })

  it('takes the whole marker for bold, never two italic ones', () => {
    expect(typedOut('**a b**').runs).toEqual([['a b', 'Bold']])
  })

  it('counts what it removes in graphemes, so an emoji inside is not over-deleted', () => {
    expect(typedOut('ok *🙂 fine*').runs).toEqual([
      ['ok ', ''],
      ['🙂 fine', 'Italic'],
    ])
  })

  it.each([
    ['an empty marker', '**', '*'],
    ['content starting with a space', '* a', '*'],
    ['content ending with a space', '*a ', '*'],
    ['a marker inside a word', 'snake_case', '_'],
    ['a product', '2*3', '*'],
    ['content holding the delimiter', '*a*b', '*'],
    ['no opening marker', 'plain', '*'],
  ])('leaves %s as text', (_, before, typed) => {
    expect(ruled(before, typed)).toEqual({ action: [{ type: 'InsertText', text: typed }] })
  })
})
