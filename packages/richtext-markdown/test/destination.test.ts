/**
 * A link's `href` and an image's `src` through `print` and back. The Markdown a URL is written
 * in has its own escapes (a backslash before punctuation, character references, angle brackets
 * for what a bare destination cannot hold), so every URL the model holds has to read back as
 * the same string.
 */
import { fromMarkdown } from 'mdast-util-from-markdown'
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { parse, print } from '../src/index.js'

const BS = String.fromCharCode(92)
const LONE_HIGH = String.fromCharCode(0xd83d)
const LONE_LOW = String.fromCharCode(0xde00)

const decode = (children: ReadonlyArray<unknown>) =>
  RichText.decodeDocument({ version: 1, children } as never)
const text = (id: string, value: string, marks: ReadonlyArray<RichText.RunMark> = []) => ({
  type: 'Text',
  id,
  text: value,
  marks,
})
const paragraph = (id: string, runs: ReadonlyArray<unknown>) => ({
  type: 'Paragraph',
  id,
  children: runs,
})
const node = (
  kind: string,
  id: string,
  props: Record<string, unknown> = {},
  blocks?: ReadonlyArray<unknown>,
) => ({
  type: 'Node',
  kind,
  id,
  props,
  children: [],
  ...(blocks === undefined ? {} : { blocks }),
})

const linked = (href: string): RichText.RunMark => ({ name: 'Link', props: { href } })

/** A link between two code spans, so a backtick in the URL has spans on both sides to meet. */
const linkDocument = (href: string) =>
  decode([
    paragraph('p', [
      text('a', 'one', ['Code']),
      text('b', ' see '),
      text('c', 'label', [linked(href)]),
      text('d', ' end '),
      text('e', 'two', ['Code']),
    ]),
  ])
const imageDocument = (src: string) => decode([node('Image', 'i', { src, alt: 'alt' })])
const cellDocument = (href: string) =>
  decode([
    node('Table', 'tb', {}, [
      node('TableRow', 'r1', { header: true }, [
        node('TableCell', 'c1', {}, [paragraph('p1', [text('t1', 'head')])]),
      ]),
      node('TableRow', 'r2', {}, [
        node('TableCell', 'c2', {}, [paragraph('p2', [text('t2', 'label', [linked(href)])])]),
      ]),
    ]),
  ])

const reading = () => {
  let n = 0
  return { mint: () => `read-${n++}` }
}

/** Every link `href` and image `src` a document holds, in order. */
const urls = (blocks: ReadonlyArray<RichText.Block>): ReadonlyArray<string> =>
  blocks.flatMap(block => {
    if (block.type === 'Unknown') return []
    const own = block.children.flatMap(run =>
      run.marks.flatMap(mark => {
        const href = RichText.markProps(mark)?.href
        return RichText.markName(mark) === 'Link' && typeof href === 'string'
          ? [`link ${href}`]
          : []
      }),
    )
    const image =
      block.type === 'Node' && block.kind === 'Image' ? [`image ${String(block.props.src)}`] : []
    return [...image, ...own, ...(block.type === 'Node' ? urls(block.blocks ?? []) : [])]
  })

/** What a CommonMark parser itself reads the first link or image's destination as. */
const destinationOf = (markdown: string): string | undefined => {
  const find = (candidate: {
    type: string
    children?: ReadonlyArray<unknown>
  }): string | undefined => {
    if ('url' in candidate && typeof candidate.url === 'string') return candidate.url
    for (const child of candidate.children ?? []) {
      const found = find(child as { type: string; children?: ReadonlyArray<unknown> })
      if (found !== undefined) return found
    }
    return undefined
  }
  return find(fromMarkdown(markdown))
}

/** The same URL back out of each place the model holds one, or the first that differs. */
const roundTrips = (url: string): ReadonlyArray<string> => {
  const failures: Array<string> = []
  for (const [place, build, expected] of [
    ['link', linkDocument, `link ${url}`],
    ['image', imageDocument, `image ${url}`],
    ['table cell', cellDocument, `link ${url}`],
  ] as const) {
    const document = build(url)
    const printed = print(document).markdown
    const back = parse(printed, reading()).document
    if (urls(back.children).join('\n') !== expected)
      failures.push(
        `${place}: ${JSON.stringify(printed)} reads as ${JSON.stringify(urls(back.children))}`,
      )
    else if (print(back).markdown !== printed)
      failures.push(
        `${place}: ${JSON.stringify(printed)} prints again as ${JSON.stringify(print(back).markdown)}`,
      )
  }
  return failures
}

const URL_CASES: ReadonlyArray<readonly [string, string]> = [
  ['a plain path', '/a/b'],
  ['an absolute URL', 'https://example.com/a?b=c#d'],
  ['a backslash alone', `/a${BS}`],
  ['a backslash before punctuation', `/a${BS}*b`],
  ['a backslash before a letter', `/a${BS}b`],
  ['two backslashes', `/a${BS}${BS}b`],
  ['two backslashes at the end', `/a${BS}${BS}`],
  ['a backslash before a parenthesis', `/a${BS}(b`],
  ['a backslash before an angle bracket', `/a${BS}<b${BS}>`],
  ['a backslash before a space', `/a${BS} b`],
  ['a backslash before a reference', `/a${BS}&amp;b`],
  ['a backslash before an ampersand', `/a${BS}&b`],
  ['a reference', '/a?x=1&amp;y=2'],
  ['a named reference', '/a&copy;b'],
  ['a decimal reference', '/a&#35;b'],
  ['a hexadecimal reference', '/a&#x26;b'],
  ['an upper-case hexadecimal reference', '/a&#X26;b'],
  ['a reference to a reference', '/a&amp;amp;b'],
  ['a reference after an ampersand', '/a&&amp;b'],
  ['a reference of no code point', '/a&#0;b'],
  ['a reference too long to be one', '/a&#99999999;b'],
  ['a query string', '/a?x=1&y=2'],
  ['a name that is no reference', '/a&foo;b'],
  ['a reference without its semicolon', '/a&copy b'],
  ['a reference without its semicolon, bare', '/a&copy'],
  ['a trailing ampersand', '/a&'],
  ['an ampersand and a hash', '/a&#'],
  ['an ampersand and a semicolon', '/a&;'],
  ['a less-than sign', '/a<b'],
  ['a greater-than sign', '/a>b'],
  ['only angle brackets', '<>'],
  ['an angle-bracketed URL', '<https://example.com>'],
  ['a leading less-than sign', '<a'],
  ['a space', '/a b'],
  ['spaces and a title-like tail', '/a "b c"'],
  ['a balanced pair of parentheses', '/a(b)c'],
  ['nested parentheses', '/a((b))c'],
  ['an unbalanced opening parenthesis', '/a(b'],
  ['an unbalanced closing parenthesis', '/a)b'],
  ['a closing parenthesis first', '/)('],
  ['a double quote', '/a"b'],
  ['a single quote', "/a'b"],
  ['a quoted URL', '"/a"'],
  ['a percent escape', '/a%20b'],
  ['a bare percent', '/a%'],
  ['a malformed percent escape', '/a%zz'],
  ['a fragment', '#frag'],
  ['a hash alone', '#'],
  ['letters beyond ASCII', '/é/ü'],
  ['an emoji', '/😀'],
  ['a lone high surrogate', `/a${LONE_HIGH}`],
  ['a lone low surrogate', `${LONE_LOW}/b`],
  ['square brackets', '/a[b]c'],
  ['a link inside the URL', '/a](b)'],
  ['a bracket and a quote', '/a"](b "c'],
  ['emphasis characters', '/a*b*_c_~d~'],
  ['a backtick', '/a`b'],
  ['a pipe', '/a|b'],
  ['a bang', '/a!b'],
  ['a protocol-relative URL', '//example.com/a'],
  ['a mailto URL', 'mailto:a@b.c?subject=x&amp;y'],
  ['a telephone URL', 'tel:+1-555-0100'],
]

describe('a URL read back from what print wrote', () => {
  it.each(URL_CASES)('%s', (_, url) => {
    expect(roundTrips(url)).toEqual([])
  })

  it('keeps the spelling a URL that already read back was printed in', () => {
    const printed = (url: string) => print(linkDocument(url)).markdown
    expect(printed('/a/b')).toBe('`one` see [label](/a/b) end `two`\n')
    expect(printed('/a b')).toBe('`one` see [label](</a b>) end `two`\n')
    expect(printed('/a(b)')).toBe('`one` see [label](</a(b)>) end `two`\n')
    expect(printed(`/a${BS}b`)).toBe(`\`one\` see [label](/a${BS}b) end \`two\`\n`)
    expect(printed('/a?x=1&y=2')).toBe('`one` see [label](/a?x=1&y=2) end `two`\n')
    expect(printed('/a&foo;b')).toBe('`one` see [label](/a&foo;b) end `two`\n')
  })

  it('writes a backslash before punctuation, or at the end, as an escape', () => {
    const printed = (url: string) => print(imageDocument(url)).markdown
    expect(printed(`/a${BS}*`)).toBe(`![alt](/a${BS}${BS}*)\n`)
    expect(printed(`/a${BS}`)).toBe(`![alt](/a${BS}${BS})\n`)
    // The first of two is before punctuation, so it is escaped; the second is before a letter.
    expect(printed(`/a${BS}${BS}b`)).toBe(`![alt](/a${BS}${BS}${BS}b)\n`)
    expect(printed(`/a ${BS}`)).toBe(`![alt](</a ${BS}${BS}>)\n`)
  })

  it('writes an ampersand that begins a reference as an escape, in either form', () => {
    const printed = (url: string) => print(imageDocument(url)).markdown
    expect(printed('/a&amp;b')).toBe(`![alt](/a${BS}&amp;b)\n`)
    expect(printed('/a b&#35;')).toBe(`![alt](</a b${BS}&#35;>)\n`)
    expect(printed('/a?b=1&c=2')).toBe('![alt](/a?b=1&c=2)\n')
  })

  it('writes a control character, which no destination can hold, as a percent escape', () => {
    const printed = (url: string) => print(imageDocument(url)).markdown
    expect(printed('/a\nb')).toBe('![alt](/a%0Ab)\n')
    expect(printed('/a\r\nb')).toBe('![alt](/a%0D%0Ab)\n')
    expect(printed('/a\tb')).toBe('![alt](/a%09b)\n')
    expect(printed('/a\u0000b\u007Fc\u001Fd')).toBe('![alt](/a%00b%7Fc%1Fd)\n')
    expect(printed(`/a${BS}\n`)).toBe(`![alt](/a${BS}${BS}%0A)\n`)
    // The percent escape is the URL's own, so what reads back is the escaped form, whole.
    expect(urls(parse(printed('/a\nb'), reading()).document.children)).toEqual(['image /a%0Ab'])
  })

  it('reads the URL of the four texts the issue reported back unchanged', () => {
    for (const input of [
      `[search](https://example.com/?q=${BS}${BS}*)\n`,
      `[folder](<https://example.com/dir${BS}${BS}>)\n`,
      `![diagram](<https://example.com/dir${BS}${BS}>)\n`,
      '<https://example.com/?a=1&amp;b=2>\n',
    ]) {
      const first = parse(input, reading()).document
      const printed = print(first).markdown
      const second = parse(printed, reading()).document
      expect(urls(second.children)).toEqual(urls(first.children))
      expect(urls(first.children)).toHaveLength(1)
      expect(print(second).markdown).toBe(printed)
    }
  })
})

describe('a URL print writes without judging it', () => {
  it.each([
    ['a javascript URL', 'javascript:alert(1)'],
    ['a data URL', 'data:text/html,<b>&amp;</b>'],
  ])('%s is written as the parser reads it, and parse refuses it as UnsafeUrl', (_, url) => {
    const printed = print(linkDocument(url))
    expect(printed.diagnostics).toEqual([])
    expect(destinationOf(printed.markdown)).toBe(url)
    const back = parse(printed.markdown, reading())
    expect(urls(back.document.children)).toEqual([])
    expect(back.diagnostics).toEqual([{ code: 'UnsafeUrl', detail: 'link' }])
  })
})

describe('a title', () => {
  it('is no part of the model: it is dropped on reading, and never written', () => {
    for (const input of [
      '[a](/x "t")',
      "[a](/x 't')",
      '[a](/x (t))',
      '[a](</x y> "t&amp;")',
      `[a](/x "t${BS}"u")`,
    ]) {
      const document = parse(input, reading()).document
      expect(urls(document.children)).toEqual([input.includes('<') ? 'link /x y' : 'link /x'])
      const printed = print(document).markdown
      expect(printed).not.toContain('"')
      expect(printed).not.toContain("'")
      expect(urls(parse(printed, reading()).document.children)).toEqual(urls(document.children))
    }
  })
})

/** A small seeded generator, so a failing walk names the case that fails. */
const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const PIECES: ReadonlyArray<string> = [
  BS,
  BS,
  BS + BS,
  '&',
  '&',
  '&amp;',
  '&copy;',
  '&#35;',
  '&#x26;',
  '&lt',
  ';',
  '#',
  'amp',
  'x',
  '(',
  ')',
  '<',
  '>',
  '"',
  "'",
  '%',
  '%20',
  ' ',
  ' ',
  '\t',
  '[',
  ']',
  '*',
  '_',
  '`',
  '|',
  '~',
  '!',
  '/',
  '?',
  '=',
  'a',
  'b',
  'é',
  '😀',
  LONE_HIGH,
  LONE_LOW,
]

const SEEDS = 4000

describe('every URL a walk over the awkward characters builds', () => {
  it(`reads back as itself, from ${SEEDS} seeds`, () => {
    const failures: Array<string> = []
    let tried = 0
    for (let seed = 1; seed <= SEEDS; seed++) {
      const random = mulberry32(seed)
      const length = 1 + Math.floor(random() * 8)
      let url = ''
      for (let i = 0; i < length; i++) url += PIECES[Math.floor(random() * PIECES.length)]
      // What `parse` would have stored: it removes controls, trims, and refuses a scheme.
      if (RichText.safeUrl(url) !== url) continue
      tried += 1
      for (const failure of roundTrips(url))
        failures.push(`seed ${seed} ${JSON.stringify(url)} ${failure}`)
    }
    expect(tried).toBeGreaterThan(SEEDS / 2)
    expect(failures.slice(0, 5)).toEqual([])
    // Each seed parses and prints three documents, which a loaded runner takes a while over.
  }, 120_000)
})
