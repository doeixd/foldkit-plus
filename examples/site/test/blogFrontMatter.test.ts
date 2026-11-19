// @vitest-environment node
/** A post's front matter: a good file parses, and each kind of bad one fails naming its file. */
import { describe, expect, test } from 'vitest'

import { parse } from '../src/blog/frontMatter.js'

const FILE = 'docs/blog/2026-11-18-a-post.md'

const post = (...lines: ReadonlyArray<string>) => `---\n${lines.join('\n')}\n---\n\nBody.\n`

const GOOD = [
  'title: A post: with a colon',
  'description: One sentence.',
  'date: 2026-11-18',
  'author: Ada Lovelace',
  'tags: [release, mixins-ui]',
]

const without = (key: string) => GOOD.filter(line => !line.startsWith(`${key}:`))
const replacing = (key: string, line: string) =>
  GOOD.map(each => (each.startsWith(`${key}:`) ? line : each))

describe('front matter', () => {
  test('a good file parses to its keys and its body', () => {
    expect(parse(FILE, post(...GOOD, 'updated: 2026-11-20', 'image: /blog/og/card.png'))).toEqual({
      data: {
        title: 'A post: with a colon',
        description: 'One sentence.',
        date: '2026-11-18',
        author: 'Ada Lovelace',
        tags: ['release', 'mixins-ui'],
        updated: '2026-11-20',
        image: '/blog/og/card.png',
      },
      body: '\nBody.\n',
    })
  })

  test('quotes are dropped, an empty list is no tags, and Windows line endings read alike', () => {
    const parsed = parse(
      FILE,
      post(
        ...replacing('title', 'title: "Quoted: yes"').filter(l => !l.startsWith('tags:')),
        'tags: []',
      ).replaceAll('\n', '\r\n'),
    )
    expect(parsed.data.title).toBe('Quoted: yes')
    expect(parsed.data.tags).toEqual([])
  })

  test.each([
    ['no front matter at all', '# A title\n\nBody.\n', /starts with front matter/],
    ['front matter never closed', '---\ntitle: x\n', /never closed/],
    ['a missing title', post(...without('title')), /title/],
    ['a missing description', post(...without('description')), /description/],
    ['a missing date', post(...without('date')), /date/],
    ['a missing author', post(...without('author')), /author/],
    ['missing tags', post(...without('tags')), /tags/],
    ['an unknown key', post(...GOOD, 'draft: true'), /draft/],
    ['a key given twice', post(...GOOD, 'date: 2026-11-19'), /date is given twice/],
    ['a line that is no key', post(...GOOD, 'just words'), /line 7 is not "key: value"/],
    ['a date in words', post(...replacing('date', 'date: November 18')), /date/],
    ['a date that is not on the calendar', post(...replacing('date', 'date: 2026-02-30')), /date/],
    [
      'an update before the post',
      post(...GOOD, 'updated: 2026-11-01'),
      /updated 2026-11-01 is before date 2026-11-18/,
    ],
    ['an image that is not a png path', post(...GOOD, 'image: card.jpg'), /image/],
    ['a tag with a capital', post(...replacing('tags', 'tags: [Release]')), /tags/],
    ['tags as a plain value', post(...replacing('tags', 'tags: release')), /tags/],
    ['a list left open', post(...replacing('tags', 'tags: [release')), /closed by \]/],
    ['an empty description', post(...replacing('description', 'description: ')), /description/],
    [
      'a description of a paragraph',
      post(...replacing('description', `description: ${'word '.repeat(80)}`)),
      /description/,
    ],
  ])('fails for %s, naming the file', (_name, text, problem) => {
    expect(() => parse(FILE, text)).toThrow(problem)
    expect(() => parse(FILE, text)).toThrow(FILE)
  })
})
