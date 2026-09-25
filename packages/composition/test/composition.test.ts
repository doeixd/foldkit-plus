import { Result, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Metadata } from 'foldkit-metadata'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  Block,
  Catalog,
  Composition,
  Content,
  NodeId,
  Region,
  type Diagnostic,
  type PropsOf,
} from '../src/index.js'

const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})
const Button = Block.define('Button', {
  Props: Schema.Struct({ label: Schema.String }),
  provides: [Content.Flow, Content.Interactive],
})
const Hero = Block.define('Hero', {
  Props: Schema.Struct({ title: Schema.String }),
  regions: { actions: Region.many({ accepts: [Content.Interactive], max: 2 }) },
  provides: [Content.Section],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: {
    body: Region.many({ accepts: [Content.Flow] }),
    aside: Region.one({ accepts: [Content.Flow], optional: true }),
  },
  provides: [Content.Section],
})
const Site = Catalog.make({ blocks: [Heading, Button, Hero, Section], roots: [Content.Section] })

const id = (value: string) => NodeId.make(value)

/** A Document from roots and nodes written as plain data, through the codec. */
const page = (roots: ReadonlyArray<string>, nodes: Readonly<Record<string, unknown>>) =>
  Schema.decodeUnknownSync(Composition.Document)({ format: 1, roots, nodes })

const codes = (diagnostics: ReadonlyArray<Diagnostic>) =>
  diagnostics.map(diagnostic => diagnostic.code)

const good = page(['section-1'], {
  'section-1': {
    block: 'Section',
    props: { tone: 'plain' },
    regions: { body: ['heading-1', 'button-1'] },
  },
  'heading-1': { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  'button-1': { block: 'Button', props: { label: 'Go' }, regions: {} },
})

describe('the vocabulary', () => {
  it('compares Content by identity, so two libraries’ capabilities never meet', () => {
    const ours = Content.define('Pricing')
    const theirs = Content.define('Pricing')
    const Plan = Block.define('Plan', { Props: Schema.Struct({}), provides: [theirs] })
    const Grid = Block.define('Grid', {
      Props: Schema.Struct({}),
      regions: { items: Region.many({ accepts: [ours] }) },
      provides: [Content.Section],
    })
    const catalog = Catalog.make({ blocks: [Plan, Grid], roots: [Content.Section] })
    const document = page(['grid'], {
      grid: { block: 'Grid', props: {}, regions: { items: ['plan'] } },
      plan: { block: 'Plan', props: {}, regions: {} },
    })
    expect(codes(Composition.validate(catalog, document))).toEqual(['composition:region-rejects'])
  })

  it('refuses a Region, a Block or a Catalog that could never hold anything', () => {
    expect(() => Region.many({ accepts: [] })).toThrow('`accepts` names no Content')
    expect(() => Region.many({ accepts: [Content.Flow], min: 3, max: 2 })).toThrow(
      '`max` (2) is below `min` (3)',
    )
    expect(() => Region.many({ accepts: [Content.Flow], min: 1.5 })).toThrow('whole number')
    expect(() => Block.define('Nothing', { Props: Schema.Struct({}), provides: [] })).toThrow(
      'Block "Nothing": `provides` names no Content',
    )
    expect(() => Catalog.make({ blocks: [Heading, Heading], roots: [Content.Section] })).toThrow(
      'two Blocks are named "Heading"',
    )
    expect(() => Catalog.make({ blocks: [Heading], roots: [] })).toThrow('`roots` names no Content')
  })

  it('describes each Block for a person or an agent', () => {
    const Palette = Metadata.key<string>('test/palette', {
      merge: categories => categories.slice(-1),
      summarize: category => category,
    })
    const Marked = Hero.pipe(Block.annotate(Palette.of('Marketing')))
    expect(Catalog.describe(Catalog.make({ blocks: [Marked], roots: [Content.Section] }))).toEqual([
      {
        name: 'Hero',
        provides: ['Section'],
        props: ['title'],
        regions: { actions: { accepts: ['Interactive'], holds: '0 to 2' } },
        metadata: [{ name: 'test/palette', entries: ['Marketing'] }],
      },
    ])
    // Annotating gives a new Block and leaves the first as it was.
    expect(Metadata.summarize(Hero.metadata)).toEqual([])
  })

  it('types a Block’s decoded props', () => {
    expectTypeOf<PropsOf<typeof Heading>>().toEqualTypeOf<{
      readonly text: string
      readonly level: 1 | 2 | 3
    }>()
    const decoded = Block.decode(Heading, { text: 'Hi', level: 2 })
    expect(Result.isSuccess(decoded) && decoded.success).toEqual({ text: 'Hi', level: 2 })
  })
})

describe('the stored Document', () => {
  it('reads any well-formed Document, a Block no Catalog knows and reserved fields included', () => {
    const stored = {
      format: 1,
      roots: ['legacy-1'],
      nodes: {
        'legacy-1': {
          block: 'LegacyEmbed',
          props: { url: 'https://example.com', size: [1, 2], nested: { ok: true } },
          regions: {},
          when: { eq: ['audience', 'member'] },
          appearance: { tone: 'accent' },
          actions: { press: { action: 'open' } },
        },
      },
    }
    const decoded = Schema.decodeUnknownSync(Composition.Document)(stored)
    expect(Schema.encodeSync(Composition.Document)(decoded)).toEqual(stored)
  })

  it('refuses what is not a Document at all', () => {
    const read = Schema.decodeUnknownResult(Composition.Document)
    expect(Result.isFailure(read({ format: 2, roots: [], nodes: {} }))).toBe(true)
    expect(Result.isFailure(read({ format: 1, roots: [''], nodes: {} }))).toBe(true)
    expect(
      Result.isFailure(read({ format: 1, roots: [], nodes: { a: { block: 'A', regions: {} } } })),
    ).toBe(true)
    expect(
      Result.isFailure(
        read({
          format: 1,
          roots: [],
          nodes: { a: { block: 'A', props: { f: () => 1 }, regions: {} } },
        }),
      ),
    ).toBe(true)
  })

  it('starts empty, and an empty Document fits any Catalog', () => {
    expect(Composition.empty()).toEqual({ format: 1, roots: [], nodes: {} })
    expect(Composition.validate(Site, Composition.empty())).toEqual([])
  })
})

describe('validate', () => {
  it('finds nothing wrong with a Document that fits', () => {
    expect(Composition.validate(Site, good)).toEqual([])
  })

  it('names a missing node, where it was named', () => {
    const document = page(['section-1'], {
      'section-1': { block: 'Section', props: { tone: 'plain' }, regions: { body: ['gone'] } },
    })
    expect(Composition.validate(Site, document)).toEqual([
      {
        code: 'composition:missing-node',
        node: id('gone'),
        path: ['nodes', 'section-1', 'regions', 'body', 0],
        message: '"section-1"\'s body at 0 names "gone", which is not a node',
      },
    ])
  })

  it('finds an orphan, a second parent and a cycle', () => {
    const document = page(['a', 'b'], {
      a: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['h'] } },
      b: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['h'] } },
      h: { block: 'Heading', props: { text: 'x', level: 1 }, regions: {} },
      loose: { block: 'Heading', props: { text: 'y', level: 1 }, regions: {} },
    })
    expect(Composition.validate(Site, document).map(diagnostic => diagnostic.message)).toEqual([
      '"h" is placed twice: at "a"\'s body at 0 and at "b"\'s body at 0',
      '"loose" is in no root and no Region',
    ])
    const cyclic = page(['a'], {
      a: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['b'] } },
      b: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['a'] } },
    })
    expect(codes(Composition.validate(Site, cyclic))).toEqual([
      'composition:region-rejects',
      'composition:region-rejects',
      'composition:cycle',
    ])
  })

  it('keeps an unknown Block and still checks what it holds', () => {
    const document = page(['section-1'], {
      'section-1': { block: 'Section', props: { tone: 'plain' }, regions: { body: ['embed'] } },
      embed: { block: 'Embed', props: { url: 'x' }, regions: { slides: ['h', 'gone'] } },
      h: { block: 'Heading', props: { text: 'x', level: 9 }, regions: {} },
    })
    expect(codes(Composition.validate(Site, document))).toEqual([
      'composition:unknown-block',
      'composition:invalid-props',
      'composition:missing-node',
    ])
  })

  it('decodes props strictly: a wrong value and a key the Block does not name both fail', () => {
    const document = page(['section-1'], {
      'section-1': {
        block: 'Section',
        props: { tone: 'plain', color: 'red' },
        regions: { body: ['h'] },
      },
      h: { block: 'Heading', props: { text: 'x' }, regions: {} },
    })
    const found = Composition.validate(Site, document)
    expect(codes(found)).toEqual(['composition:invalid-props', 'composition:invalid-props'])
    expect(found[0]?.path).toEqual(['nodes', 'section-1', 'props'])
    expect(found[0]?.message).toContain('"section-1"\'s props are not a Section\'s')
  })

  it('checks a stored appearance against the axes its Block offers', () => {
    const Looks = Section.pipe(
      Block.withAppearance({
        space: { kind: 'variant', values: ['snug', 'roomy'] },
        gap: { kind: 'token', values: ['s', 'm'] },
      }),
    )
    const Styled = Catalog.make({ blocks: [Heading, Looks], roots: [Content.Section] })
    const document = page(['s'], {
      s: {
        block: 'Section',
        props: { tone: 'plain' },
        regions: { body: ['h'] },
        appearance: { space: 'roomy', gap: 'xl', edge: 'round' },
      },
      h: { block: 'Heading', props: { text: 'x', level: 1 }, regions: {}, appearance: {} },
    })
    const found = Composition.validate(Styled, document)
    expect(codes(found)).toEqual(['composition:unknown-token', 'composition:invalid-appearance'])
    expect(found.map(each => each.path)).toEqual([
      ['nodes', 's', 'appearance', 'gap'],
      ['nodes', 's', 'appearance', 'edge'],
    ])
    expect(Looks.appearance).not.toBe(Section.appearance)
    expect(Section.appearance).toEqual({})
  })

  it('holds a Region to its bounds and its Content, and knows only the Block’s Regions', () => {
    const document = page(['hero'], {
      hero: {
        block: 'Hero',
        props: { title: 'Hi' },
        regions: { actions: ['b1', 'b2', 'h'], footer: [] },
      },
      b1: { block: 'Button', props: { label: '1' }, regions: {} },
      b2: { block: 'Button', props: { label: '2' }, regions: {} },
      h: { block: 'Heading', props: { text: 'x', level: 1 }, regions: {} },
    })
    expect(Composition.validate(Site, document).map(diagnostic => diagnostic.message)).toEqual([
      '"hero"\'s actions holds 3, and takes 0 to 2',
      '"hero"\'s actions takes Interactive, and "h" is a Heading',
      '"hero" is a Hero, which has no Region "footer"',
    ])
    const crowded = page(['section-1'], {
      'section-1': { block: 'Section', props: { tone: 'plain' }, regions: { aside: ['h1', 'h2'] } },
      h1: { block: 'Heading', props: { text: 'x', level: 1 }, regions: {} },
      h2: { block: 'Heading', props: { text: 'y', level: 1 }, regions: {} },
    })
    expect(Composition.validate(Site, crowded)[0]?.message).toBe(
      '"section-1"\'s aside holds 2, and takes 0 to 1',
    )
  })

  it('requires the one child of a Region that is not optional', () => {
    const Frame = Block.define('Frame', {
      Props: Schema.Struct({}),
      regions: { content: Region.one({ accepts: [Content.Flow] }) },
      provides: [Content.Section],
    })
    const catalog = Catalog.make({ blocks: [Frame, Heading], roots: [Content.Section] })
    const document = page(['frame'], { frame: { block: 'Frame', props: {}, regions: {} } })
    expect(Composition.validate(catalog, document)[0]?.message).toBe(
      `"frame"'s content holds 0, and takes exactly 1`,
    )
  })

  it('holds a root to the Catalog’s roots', () => {
    const document = page(['h'], {
      h: { block: 'Heading', props: { text: 'x', level: 1 }, regions: {} },
    })
    expect(Composition.validate(Site, document)).toEqual([
      {
        code: 'composition:root-rejects',
        node: id('h'),
        path: ['roots', 0],
        message: 'a root must be Section, and "h" is a Heading',
      },
    ])
  })
})

describe('valid, as a Schema check', () => {
  const Page = Entity.define(
    'Page',
    Schema.Struct({ id: Schema.String, title: Schema.String, document: Composition.Document }),
  )
  const PageInput = Entity.input(
    Page,
    Schema.Struct({
      title: Page.fields.title.schema,
      document: Composition.Document.check(Composition.valid(Site)),
    }),
  )
  const decode = Schema.decodeUnknownResult(PageInput.schema)
  const encoded = Schema.encodeSync(Composition.Document)

  it('stores any Document in the Entity, and publishes only one that fits', () => {
    const broken = page(['h'], {
      h: { block: 'Heading', props: { text: 'x', level: 1 }, regions: {} },
      loose: { block: 'Gone', props: {}, regions: {} },
    })
    // The row reads with anything in it: the Entity's field is the tolerant codec.
    const row = Schema.decodeUnknownResult(Page.schema)({
      id: 'p1',
      title: 'T',
      document: encoded(broken),
    })
    expect(Result.isSuccess(row)).toBe(true)

    const refused = decode({ title: 'T', document: encoded(broken) })
    expect(Result.isFailure(refused)).toBe(true)
    const message = Result.isFailure(refused) ? refused.failure.message : ''
    expect(message).toContain('a root must be Section, and "h" is a Heading')
    expect(message).toContain('"loose" is in no root and no Region')

    expect(Result.isSuccess(decode({ title: 'T', document: encoded(good) }))).toBe(true)
  })
})

describe('index and describe', () => {
  it('says where each reachable node is, once per Document value', () => {
    const places = Composition.index(good)
    expect(places.get(id('section-1'))).toEqual({ parent: undefined, region: undefined, index: 0 })
    expect(places.get(id('button-1'))).toEqual({ parent: 'section-1', region: 'body', index: 1 })
    expect(Composition.index(good)).toBe(places)
  })

  it('writes the Document as indented text, marking what the Catalog does not know', () => {
    const document = page(['section-1'], {
      'section-1': {
        block: 'Section',
        props: { tone: 'plain' },
        regions: { body: ['heading-1', 'embed'], aside: [] },
      },
      'heading-1': { block: 'Heading', props: { level: 1, text: 'Hello' }, regions: {} },
      embed: { block: 'Embed', props: {}, regions: { items: ['gone'] } },
    })
    expect(Composition.describe(Site, document)).toBe(
      [
        'Section section-1 {"tone":"plain"}',
        '  body:',
        '    Heading heading-1 {"level":1,"text":"Hello"}',
        '    ? Embed embed',
        '      items:',
        '        (missing gone)',
      ].join('\n'),
    )
  })
})
