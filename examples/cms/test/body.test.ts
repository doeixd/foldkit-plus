/**
 * A post's body is Markdown text, read into a rich-text document for the site and the
 * preview. The seed's lightweight conventions (a blank line between parts, `## `,
 * `- `, a fence, backticks) are Markdown, so the published posts read as before, and
 * what the editor adds (bold, links, quotes, numbered lists) reads too.
 */
import * as RichText from 'foldkit-richtext'
import { print } from 'foldkit-richtext-markdown'
import { describe, expect, it } from 'vitest'
import { documentOf, readingTime } from '../src/content/markdownBody.js'

const FENCE = '```'

const kinds = (markdown: string) =>
  documentOf(markdown).children.map(block =>
    block.type === 'Node' ? block.kind : block.type === 'Heading' ? `h${block.level}` : block.type,
  )

describe('documentOf', () => {
  it.each([
    ['paragraphs, by a blank line', 'One.\n\nTwo.', ['Paragraph', 'Paragraph']],
    ['a heading', '## How it works\n\nText.', ['h2', 'Paragraph']],
    ['a list', '- one\n- two', ['List']],
    ['a numbered list and a quote', '1. one\n2. two\n\n> said', ['List', 'Quote']],
    [
      'code, blank lines and all',
      `Before.\n\n${FENCE}ts\na\n\nb\n${FENCE}\n\nAfter.`,
      ['Paragraph', 'CodeBlock', 'Paragraph'],
    ],
  ])('reads %s', (_, markdown, expected) => {
    expect(kinds(markdown)).toEqual(expected)
  })

  it('reads the marks an author adds', () => {
    const [paragraph] = documentOf(
      'A **bold** word, `code`, and [a link](https://example.com).',
    ).children
    const runs = paragraph?.type === 'Paragraph' ? paragraph.children : []
    const marks = runs.flatMap(run => run.marks.map(RichText.markName))
    expect(marks).toEqual(['Bold', 'Code', 'Link'])
  })

  it('gives the same text the same document, identities included', () => {
    expect(documentOf('One.\n\nTwo.')).toEqual(documentOf('One.\n\nTwo.'))
  })

  it('prints back to the text it read, so a save keeps what was written', () => {
    const text = '## Title\n\nA **bold** word.\n\n- one\n- two'
    // The printer ends its text with a newline.
    expect(print(documentOf(text)).markdown).toBe(text + '\n')
  })
})

describe('readingTime', () => {
  it('is at least a minute, and counts the words', () => {
    expect(readingTime('Short.')).toBe('1 min read')
    expect(readingTime(Array.from({ length: 700 }, () => 'word').join(' '))).toBe('3 min read')
  })
})
