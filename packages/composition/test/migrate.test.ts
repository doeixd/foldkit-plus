import { Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Block,
  Catalog,
  Composition,
  Content,
  NodeId,
  Region,
  type Document,
} from '../src/index.js'

const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, align: Schema.Literals(['start', 'center']) }),
  provides: [Content.Flow],
})
const Embed = Block.define('Embed', {
  Props: Schema.Struct({ url: Schema.String, height: Schema.Number }),
  provides: [Content.Flow, Content.Media],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
/** Version 2 of the site: it has Heading, Section and Embed, and no longer LegacyVideo or OldHeading. */
const Site = Catalog.make({ blocks: [Heading, Embed, Section], roots: [Content.Section] })

const id = NodeId.make
const page = (roots: ReadonlyArray<string>, nodes: Readonly<Record<string, unknown>>): Document =>
  Schema.decodeUnknownSync(Composition.Document)({ format: 1, roots, nodes })

/** A revision saved under version 1. */
const revision = page(['s'], {
  s: { block: 'Section', props: {}, regions: { body: ['h', 'v', 'w'] } },
  h: { block: 'OldHeading', props: { text: 'Hi', alignment: 'center' }, regions: {} },
  v: { block: 'LegacyVideo', props: { url: 'https://example.com/a', height: 360 }, regions: {} },
  w: { block: 'LegacyVideo', props: { src: 'https://example.com/b' }, regions: {} },
})

describe('an old revision under a newer Catalog', () => {
  it('reads, round-trips and keeps its unknown Blocks, and blocks a publish until migrated', () => {
    const stored = Schema.encodeSync(Composition.Document)(revision)
    const read = Schema.decodeUnknownSync(Composition.Document)(JSON.parse(JSON.stringify(stored)))
    expect(read).toEqual(revision)
    expect(
      Composition.validate(Site, read).filter(found => found.code === 'composition:unknown-block'),
    ).toHaveLength(3)
    const publish = Schema.decodeUnknownResult(Composition.Document.check(Composition.valid(Site)))
    expect(Result.isFailure(publish(stored))).toBe(true)
  })

  it('can still be edited around its unknown Blocks, which move and go like any node', () => {
    const moved = Composition.apply(
      Site,
      revision,
      Composition.Op.move(id('v'), Composition.region(id('s'), 'body', 0)),
    )
    expect(
      Result.isSuccess(moved) && moved.success.document.nodes[id('s')]?.regions['body'],
    ).toEqual(['v', 'h', 'w'])
    // Anywhere else, nothing could say whether the new place accepts it.
    const elsewhere = Composition.apply(
      Site,
      revision,
      Composition.Op.move(id('v'), Composition.root(1)),
    )
    expect(Result.isFailure(elsewhere) && elsewhere.failure.code).toBe('composition:unknown-block')
    const removed = Composition.apply(Site, revision, Composition.Op.remove(id('w')))
    expect(Result.isSuccess(removed) && Object.keys(removed.success.document.nodes)).toEqual([
      's',
      'h',
      'v',
    ])
  })

  it('moves forward by a chain of migrations, and then fits the Catalog', () => {
    const { document, applied, unused } = Composition.migrate(revision, [
      Composition.renameBlock('OldHeading', 'Heading'),
      Composition.renameProp('Heading', 'alignment', 'align'),
      Composition.promoteUnknown('LegacyVideo to Embed', 'LegacyVideo', Embed),
      Composition.renameBlock('Nothing', 'Anything'),
    ])
    expect(applied).toEqual([
      { name: 'rename OldHeading to Heading', node: 'h' },
      { name: 'rename Heading.alignment to align', node: 'h' },
      { name: 'LegacyVideo to Embed', node: 'v' },
    ])
    expect(unused).toEqual(['rename Nothing to Anything'])
    expect(document.nodes[id('h')]).toEqual({
      block: 'Heading',
      props: { text: 'Hi', align: 'center' },
      regions: {},
    })
    expect(document.nodes[id('v')]?.block).toBe('Embed')
    // Props that do not decode as the target's are kept as they were, not half converted.
    expect(document.nodes[id('w')]).toBe(revision.nodes[id('w')])
    expect(Composition.validate(Site, document).map(found => found.code)).toEqual([
      'composition:unknown-block',
    ])
    // The revision it started from is unchanged.
    expect(revision.nodes[id('h')]?.block).toBe('OldHeading')
  })

  it('renames a prop only where it is, leaving a node without it untouched', () => {
    const mixed = page(['s'], {
      s: { block: 'Section', props: {}, regions: { body: ['a', 'b'] } },
      a: { block: 'Heading', props: { text: 'A', alignment: 'start' }, regions: {} },
      b: { block: 'Heading', props: { text: 'B', align: 'center' }, regions: {} },
    })
    const result = Composition.migrate(mixed, [
      Composition.renameProp('Heading', 'alignment', 'align'),
    ])
    expect(result.applied).toEqual([{ name: 'rename Heading.alignment to align', node: 'a' }])
    expect(result.document.nodes[id('b')]).toBe(mixed.nodes[id('b')])
    expect(Composition.validate(Site, result.document)).toEqual([])
  })

  it('lets a migration decline, and leaves the Document as it was when every one does', () => {
    const declined = Composition.migrate(revision, [
      Composition.migration('never', 'OldHeading', () => undefined),
    ])
    expect(declined).toEqual({ document: revision, applied: [], unused: ['never'] })
  })
})

describe('what a migration may not do', () => {
  it('throws when it breaks the structure, naming itself', () => {
    expect(() =>
      Composition.migrate(revision, [
        Composition.migration('points nowhere', 'Section', node => ({
          ...node,
          regions: { body: ['h', 'v', 'w', 'gone'].map(value => id(value)) },
        })),
      ]),
    ).toThrow('migration "points nowhere" broke the Document: "gone" is named but is not a node')
    expect(() =>
      Composition.migrate(revision, [
        Composition.migration('twice', 'Section', node => ({
          ...node,
          regions: { body: ['h', 'h', 'v', 'w'].map(value => id(value)) },
        })),
      ]),
    ).toThrow('"h" is placed twice')
    expect(() =>
      Composition.migrate(revision, [
        Composition.migration('strands', 'Section', node => ({
          ...node,
          regions: { body: [id('h')] },
        })),
      ]),
    ).toThrow('"v" is in no root and no Region')
  })

  it('throws when it returns something that is not a node', () => {
    expect(() =>
      Composition.migrate(revision, [
        Composition.migration('not json', 'OldHeading', node => ({
          ...node,
          props: { ...node.props, when: Number.NaN },
        })),
      ]),
    ).toThrow('migration "not json" rewrote "h" into something that is not a node')
  })

  it('does not blame a migration for what was already wrong', () => {
    const broken = page(['s'], {
      s: { block: 'Section', props: {}, regions: { body: ['h'] } },
      h: { block: 'OldHeading', props: { text: 'x', alignment: 'start' }, regions: {} },
      loose: { block: 'Heading', props: { text: 'y', align: 'start' }, regions: {} },
    })
    const result = Composition.migrate(broken, [Composition.renameBlock('OldHeading', 'Heading')])
    expect(result.applied).toEqual([{ name: 'rename OldHeading to Heading', node: 'h' }])
  })
})
