/**
 * `docs`' pure core: how Markdown splits into sections, how a query ranks
 * them, what a symbol finds in a `.d.mts`, and how the answer reads.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import {
  answer,
  answerText,
  declarationsIn,
  isSymbol,
  outlineText,
  rank,
  sectionsOf,
  type Declaration,
  type Doc,
} from '../src/docs.js'

const doc = (topic: string, ...lines: ReadonlyArray<string>): Doc => ({
  topic,
  label: `foldkit-${topic}@1.0.0 README.md`,
  path: `/n/${topic}/README.md`,
  text: lines.join('\n'),
})

const headingsOf = (docs: ReadonlyArray<Doc>, query: string) =>
  rank(docs.flatMap(sectionsOf), query).map(each => each.section.headings.at(-1))

describe('sectionsOf', () => {
  it('splits at headings outside code, each under those above it', () => {
    const sections = sectionsOf(
      doc(
        'remote',
        'Above every heading.',
        '# Remote',
        'Intro.',
        '## Reading',
        '````md',
        '# not a heading',
        '```',
        '## nor this',
        '````',
        '### Preloading',
        'Body.',
        '## Writing',
        '~~~',
        '# still code',
        '~~~',
      ),
    )
    expect(sections.map(each => [each.headings, each.line])).toEqual([
      [['Remote'], 2],
      [['Remote', 'Reading'], 4],
      [['Remote', 'Reading', 'Preloading'], 10],
      [['Remote', 'Writing'], 12],
    ])
    expect(sections[0]!.body).toEqual(['Intro.'])
    expect(sections[1]!.body).toEqual(['````md', '# not a heading', '```', '## nor this', '````'])
  })

  it("gives GitHub's anchors, numbering a repeated one", () => {
    const anchors = sectionsOf(doc('x', '## Why is it `Initial`?', '## Limits', '## Limits')).map(
      each => each.anchor,
    )
    expect(anchors).toEqual(['why-is-it-initial', 'limits', 'limits-1'])
  })
})

describe('rank', () => {
  const docs = [
    doc(
      'remote',
      '## Live data',
      'A delete arrives from the server; optimistic state is not involved here at all, nor anything else of note.',
      '## Reading',
      'Nothing about the query.',
      '## Mutations',
      'Call `Data.mutate` here. The preload of data happens elsewhere.',
      '## Optimistic deletes',
      'Removing a row before the server answers.',
    ),
  ]

  it('puts a section whose heading holds the words above one whose body does', () => {
    // The heading match is last in the document, so order alone cannot pass.
    expect(headingsOf(docs, 'optimistic delete')).toEqual(['Optimistic deletes', 'Live data'])
  })

  it('puts the exact symbol above its words apart', () => {
    expect(headingsOf(docs, 'Data.mutate')[0]).toBe('Mutations')
    const preload = [
      doc('a', '## Scattered', 'data and data and preload and preload.'),
      doc('b', '## Exact', 'Call `Data.preload` once.'),
    ]
    expect(headingsOf(preload, 'Data.preload')).toEqual(['Exact', 'Scattered'])
  })

  it('weighs a heading above a body by its words alone, not only as a phrase', () => {
    // Out of order, the query is no phrase either holds; the body names each word twice.
    const weighed = [
      doc('a', '## Live data', 'Optimistic, then delete; delete, then optimistic.'),
      doc('b', '## Optimistic deletes', 'Removing a row before the server answers.'),
    ]
    expect(headingsOf(weighed, 'delete optimistic')).toEqual(['Optimistic deletes', 'Live data'])
  })

  it('meets a word in another form', () => {
    expect(headingsOf([doc('a', '## Rows', 'Deleted rows stay.')], 'deleting')).toEqual(['Rows'])
  })

  it('leaves out a section that shares no word, and answers nothing to no words', () => {
    expect(headingsOf(docs, 'query')).toEqual(['Reading'])
    expect(headingsOf(docs, '  ...  ')).toEqual([])
  })
})

it.each([
  ['Data.preload', true],
  ['RemoteData', true],
  ['$Store.get', true],
  ['optimistic', false],
  ['optimistic delete', false],
  ['Data.', false],
])('isSymbol(%j) is %s', (query, expected) => {
  expect(isSymbol(query)).toBe(expected)
})

describe('declarationsIn', () => {
  const file = (text: string) => ({
    topic: 'remote',
    origin: 'foldkit-remote@1.0.0',
    path: '/d.mts',
    text,
  })
  const dts = [
    '/** The domain. */',
    'declare const Remote: {',
    '  /** Makes one. */',
    '  make: <A>(config: {',
    '    readonly a: A;',
    '  }) => A;',
    '  readonly select: (x: number) => number;',
    '};',
    'interface Domain {',
    '  /**',
    '   * Reads ahead.',
    '   */',
    '  preload(model: string): number;',
    '}',
    'declare function plan<A>(',
    '  a: A,',
    '): A;',
    'declare const Query$1: { make: () => void };',
  ].join('\n')

  it('outlines an object by its members, with its comment', () => {
    const [remote] = declarationsIn(file(dts), 'Remote')
    expect(remote?.comment).toEqual(['/** The domain. */'])
    expect(remote?.signature).toEqual([
      'declare const Remote: {',
      '  // members: make, select',
      '}',
    ])
    expect(remote?.line).toBe(2)
  })

  it('gives a member of a declared owner, whole, with its comment', () => {
    expect(declarationsIn(file(dts), 'Remote.make')).toEqual([
      {
        topic: 'remote',
        origin: 'foldkit-remote@1.0.0',
        path: '/d.mts',
        line: 4,
        comment: ['/** Makes one. */'],
        signature: ['make: <A>(config: {', '  readonly a: A;', '}) => A;'],
      } satisfies Declaration,
    ])
    // A declared owner without the member has none, rather than another owner's.
    expect(declarationsIn(file(dts), 'Remote.preload')).toEqual([])
  })

  it('finds a member anywhere when its owner is a value the application makes', () => {
    const [preload] = declarationsIn(file(dts), 'Data.preload')
    expect(preload?.comment).toEqual(['/**', ' * Reads ahead.', ' */'])
    expect(preload?.signature).toEqual(['preload(model: string): number;'])
  })

  it('reads a function to its end, and a bundler-renamed declaration by its name', () => {
    expect(declarationsIn(file(dts), 'plan')[0]?.signature).toEqual([
      'declare function plan<A>(',
      '  a: A,',
      '): A;',
    ])
    // The line above closes an interface, not a comment: it has none.
    expect(declarationsIn(file(dts), 'plan')[0]?.comment).toEqual([])
    expect(declarationsIn(file(dts), 'Query')[0]?.line).toBe(18)
  })

  it('reads a `$` in a name as itself', () => {
    expect(declarationsIn(file('declare const $store: 1;'), '$store')).toHaveLength(1)
  })
})

describe('answer', () => {
  const declaration = (topic: string): Declaration => ({
    topic,
    origin: `foldkit-${topic}@1.0.0`,
    path: `/${topic}.d.mts`,
    line: 1,
    comment: [],
    signature: ['preload(): void;'],
  })
  const docs = [
    doc('sync', '## Other', 'Unrelated.'),
    doc('remote', '## Preload', 'Use `Data.preload`.'),
  ]

  it("puts the declarations of the best section's package first", () => {
    const result = answer(docs, 'Data.preload', () => [declaration('sync'), declaration('remote')])
    expect(result.declarations.map(each => each.topic)).toEqual(['remote', 'sync'])
  })

  it('looks no symbol up for words', () => {
    let asked = false
    answer(docs, 'preload ahead', () => {
      asked = true
      return []
    })
    expect(asked).toBe(false)
  })

  it('cuts a long section, closes its open fence, and says where the rest is', () => {
    const long = doc(
      'remote',
      '## Long',
      '```ts',
      ...Array.from({ length: 80 }, (_, n) => `line ${n} preload`),
    )
    const text = answerText(answer([long], 'preload', () => []))
    expect(text).toContain(
      'From foldkit-remote@1.0.0 README.md › Long (/n/remote/README.md:1, #long)',
    )
    expect(text).toContain('line 58 preload\n```\n\n… 21 more lines at /n/remote/README.md:62')
    expect(text).not.toContain('line 59 preload')
  })

  it('says what it searched when nothing matches', () => {
    expect(answerText(answer(docs, 'zebra', () => []))).toContain(
      'Nothing in the 2 installed documents matches "zebra"',
    )
  })
})

describe('outlineText', () => {
  const docs = [doc('remote', '# Remote', '## Reading', '### Preloading'), doc('sync', '# Sync')]

  it('lists every document without a topic, and outlines one with it', () => {
    expect(Option.getOrThrow(outlineText(docs, Option.none()))).toContain(
      '- `sync`: foldkit-sync@1.0.0 README.md (/n/sync/README.md)',
    )
    const outline = Option.getOrThrow(outlineText(docs, Option.some('remote')))
    expect(outline).toContain('- Remote (line 1)\n  - Reading (line 2)\n    - Preloading (line 3)')
    expect(outline).not.toContain('Sync')
  })

  it('has nothing for a topic nothing covers', () => {
    expect(outlineText(docs, Option.some('mirror'))).toEqual(Option.none())
  })
})
