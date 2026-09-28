/**
 * A post's body as its author types it: parts separated by a blank line, a
 * heading, a list, a fenced code block that may hold blank lines of its own,
 * and code marked in a sentence.
 */
import { describe, expect, it } from 'vitest'
import { bodyOf, spansOf } from '../src/content/site.js'

const FENCE = '```'

describe('bodyOf', () => {
  it.each([
    [
      'paragraphs, by a blank line',
      'One.\n\nTwo\nlines.',
      [
        { _tag: 'Paragraph', text: 'One.' },
        { _tag: 'Paragraph', text: 'Two\nlines.' },
      ],
    ],
    [
      'a heading',
      '## How it works\n\nText.',
      [
        { _tag: 'Heading', text: 'How it works' },
        { _tag: 'Paragraph', text: 'Text.' },
      ],
    ],
    ['a list, every line marked', '- one\n- two', [{ _tag: 'List', items: ['one', 'two'] }]],
    [
      'a paragraph, when one line is not marked',
      '- one\ntwo',
      [{ _tag: 'Paragraph', text: '- one\ntwo' }],
    ],
    [
      'code, blank lines and all, with no paragraph around it',
      `Before.\n${FENCE}ts\nconst a = 1\n\nconst b = 2\n${FENCE}\nAfter.`,
      [
        { _tag: 'Paragraph', text: 'Before.' },
        { _tag: 'Code', text: 'const a = 1\n\nconst b = 2' },
        { _tag: 'Paragraph', text: 'After.' },
      ],
    ],
    [
      'an unclosed fence, to the end',
      `${FENCE}\nleft open\n\nstill code`,
      [{ _tag: 'Code', text: 'left open\n\nstill code' }],
    ],
  ])('reads %s', (_, body, parts) => {
    expect(bodyOf(body)).toEqual(parts)
  })
})

describe('spansOf', () => {
  it.each([
    [
      'code between backticks',
      'Call `update` once.',
      [
        { code: false, text: 'Call ' },
        { code: true, text: 'update' },
        { code: false, text: ' once.' },
      ],
    ],
    [
      'the last of an odd number of backticks as text',
      'A ` here and `code`.',
      [
        { code: false, text: 'A ' },
        { code: true, text: ' here and ' },
        { code: false, text: 'code`.' },
      ],
    ],
    ['a sentence with none', 'Plain.', [{ code: false, text: 'Plain.' }]],
  ])('reads %s', (_, text, spans) => {
    expect(spansOf(text)).toEqual(spans)
  })
})
