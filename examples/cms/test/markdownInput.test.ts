// @vitest-environment jsdom
/**
 * The body's form control keeps Markdown text as its value: a text given to the form is read
 * into the editor's document, and the form's value is that document printed again.
 */
import { describe, expect, it } from 'vitest'
import { PostForm } from '../src/content/domain.js'

const valueAfterFill = (body: string) => {
  const filled = PostForm.fill(PostForm.initial, { body }).model
  return PostForm.partial(filled)['body']
}

describe('the body control', () => {
  it.each([
    ['a paragraph', 'Words.'],
    ['a heading, bold and a list', '## Title\n\nA **bold** word.\n\n- one\n- two'],
    ['a link and code', 'See [the docs](https://example.com) and `update`.'],
    ['a numbered list and a quote', '1. one\n2. two\n\n> said'],
  ])('keeps %s as the Markdown it was given', (_, markdown) => {
    expect(valueAfterFill(markdown)).toBe(markdown)
  })

  // A fill that throws fails the form's fill, so stored text the parser dislikes must still read.
  it.each([
    ['an unclosed fence', '```ts\nconst a = 1'],
    ['raw HTML', '<div onclick="x()">hi</div>\n\n<script>alert(1)</script>'],
    ['a link with an unsafe address', '[x](javascript:alert(1))'],
    ['a footnote and a hard break', 'a[^1]  \nb\n\n[^1]: note'],
    ['deep nesting', '> '.repeat(50) + 'deep'],
    ['a control character and a lone surrogate', 'a' + String.fromCharCode(0, 0xd83d) + 'b'],
  ])('reads %s without throwing', (_, markdown) => {
    expect(() => PostForm.fill(PostForm.initial, { body: markdown })).not.toThrow()
  })

  it('is the empty text for a blank body, which a plain field would hold too', () => {
    expect(valueAfterFill('')).toBe('')
  })

  it('shows the editor a document it can put a caret in, even for no text', () => {
    const filled = PostForm.fill(PostForm.initial, { body: '' }).model
    const draft = PostForm.control('body').field(filled).value
    expect(draft.document.children).toHaveLength(1)
  })
})
