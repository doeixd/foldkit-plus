import { Effect, Result, Schema } from 'effect'
import { Action } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Block,
  Catalog,
  Composition,
  Content,
  NodeId,
  Region,
  type Applied,
  type Document,
  type Operation,
  type Refusal,
} from '../src/index.js'

const Heading = Block.define('Heading', {
  Props: Schema.Struct({
    text: Schema.String,
    level: Schema.Literals([1, 2, 3]),
    anchor: Schema.optional(Schema.String),
  }),
  provides: [Content.Flow],
  appearance: {
    tone: { kind: 'variant', values: ['plain', 'accent'] },
    gap: { kind: 'token', values: ['s', 'm'] },
  },
})
const Button = Block.define('Button', {
  Props: Schema.Struct({ label: Schema.String }),
  provides: [Content.Flow, Content.Interactive],
  events: ['press'],
})
const AddToCart = Action.define({
  name: 'addToCart',
  description: 'Add a product to the cart',
  input: Schema.Struct({ productId: Schema.String }),
  toMessage: input => ({ _tag: 'AddedToCart', ...input }),
})
const Hero = Block.define('Hero', {
  Props: Schema.Struct({ title: Schema.String }),
  regions: { actions: Region.many({ accepts: [Content.Interactive], max: 2 }) },
  provides: [Content.Section],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const Frame = Block.define('Frame', {
  Props: Schema.Struct({}),
  regions: { content: Region.many({ accepts: [Content.Flow], min: 1 }) },
  provides: [Content.Section],
})
const Site = Catalog.make({
  blocks: [Heading, Button, Hero, Section, Frame],
  roots: [Content.Section],
  context: Schema.Struct({ audience: Schema.Literals(['guest', 'member']) }),
  actions: [AddToCart],
})

const id = NodeId.make

/** The value, or a failed test saying what was missing: no assertion needed. */
const required = <A>(value: A | undefined, what: string): A => {
  if (value === undefined) throw new Error(`expected ${what}`)
  return value
}
const { Op, root, region } = Composition

const page = (roots: ReadonlyArray<string>, nodes: Readonly<Record<string, unknown>>): Document =>
  Schema.decodeUnknownSync(Composition.Document)({ format: 1, roots, nodes })

const start = page(['s'], {
  s: { block: 'Section', props: {}, regions: { body: ['a', 'b', 'c'] } },
  a: { block: 'Heading', props: { text: 'A', level: 1 }, regions: {} },
  b: { block: 'Heading', props: { text: 'B', level: 2 }, regions: {} },
  c: { block: 'Button', props: { label: 'C' }, regions: {} },
})

const applied = (document: Document, op: Operation): Applied => {
  const result = Composition.apply(Site, document, op)
  if (Result.isFailure(result)) throw new Error(`refused: ${result.failure.message}`)
  return result.success
}
const refused = (document: Document, op: Operation): Refusal => {
  const result = Composition.apply(Site, document, op)
  if (Result.isSuccess(result)) throw new Error('applied, and a refusal was expected')
  return result.failure
}
const body = (document: Document, parent = 's') => document.nodes[id(parent)]?.regions['body']

describe('insert', () => {
  it('adds a node where the position says, and reports it and its parent as changed', () => {
    const result = applied(
      start,
      Op.insert({
        id: id('d'),
        block: 'Button',
        props: { label: 'D' },
        at: region(id('s'), 'body', 1),
      }),
    )
    expect(body(result.document)).toEqual(['a', 'd', 'b', 'c'])
    expect(result.document.nodes[id('d')]).toEqual({
      block: 'Button',
      props: { label: 'D' },
      regions: {},
    })
    expect([...result.changed].sort()).toEqual(['d', 's'])
    expect(result.removed).toEqual([])
    expect(Composition.validate(Site, result.document)).toEqual([])
  })

  it('adds a root', () => {
    const result = applied(
      start,
      Op.insert({ id: id('h'), block: 'Hero', props: { title: 'T' }, at: root(0) }),
    )
    expect(result.document.roots).toEqual(['h', 's'])
  })

  it('refuses what the insert itself would get wrong', () => {
    const insert = (fields: Partial<Parameters<typeof Op.insert>[0]>) =>
      refused(
        start,
        Op.insert({
          id: id('d'),
          block: 'Button',
          props: { label: 'D' },
          at: region(id('s'), 'body', 0),
          ...fields,
        }),
      )
    expect(insert({ id: id('a') })).toEqual({
      code: 'composition:id-taken',
      message: '"a" is already a node',
    })
    expect(insert({ block: 'Nope' }).code).toBe('composition:unknown-block')
    expect(insert({ props: { label: 3 } }).code).toBe('composition:invalid-props')
    expect(insert({ at: region(id('s'), 'aside', 0) }).message).toBe(
      '"s" is a Section, which has no Region "aside"',
    )
    expect(insert({ at: region(id('gone'), 'body', 0) }).code).toBe('composition:missing-node')
    expect(insert({ at: region(id('s'), 'body', 4) }).message).toBe(
      '"s"\'s body at 4 is outside "s"\'s body, which has 3',
    )
    expect(insert({ at: root(0) }).message).toBe('a root must be Section, and "d" is a Button')
    expect(insert({ block: 'Hero', props: { title: 'x' } }).message).toBe(
      '"s"\'s body takes Flow, and "d" is a Hero',
    )
  })

  it('refuses a node a Region has no room for', () => {
    const full = page(['h'], {
      h: { block: 'Hero', props: { title: 'T' }, regions: { actions: ['x', 'y'] } },
      x: { block: 'Button', props: { label: 'x' }, regions: {} },
      y: { block: 'Button', props: { label: 'y' }, regions: {} },
    })
    expect(
      refused(
        full,
        Op.insert({
          id: id('z'),
          block: 'Button',
          props: { label: 'z' },
          at: region(id('h'), 'actions', 0),
        }),
      ).message,
    ).toBe('"h"\'s actions holds 2, and takes 0 to 2')
  })

  it('leaves the Document it was given as it was', () => {
    const before = JSON.stringify(start)
    applied(
      start,
      Op.insert({
        id: id('d'),
        block: 'Button',
        props: { label: 'D' },
        at: region(id('s'), 'body', 0),
      }),
    )
    refused(
      start,
      Op.insert({
        id: id('a'),
        block: 'Button',
        props: { label: 'D' },
        at: region(id('s'), 'body', 0),
      }),
    )
    expect(JSON.stringify(start)).toBe(before)
  })
})

describe('remove', () => {
  it('removes the node and everything it holds', () => {
    const nested = page(['s', 'h'], {
      s: { block: 'Section', props: {}, regions: { body: [] } },
      h: { block: 'Hero', props: { title: 'T' }, regions: { actions: ['x'] } },
      x: { block: 'Button', props: { label: 'x' }, regions: {} },
    })
    const result = applied(nested, Op.remove(id('h')))
    expect(result.document.roots).toEqual(['s'])
    expect(Object.keys(result.document.nodes)).toEqual(['s'])
    expect([...result.removed].sort()).toEqual(['h', 'x'])
  })

  it('refuses to leave a Region below its bound, and a node that is not there', () => {
    const framed = page(['f'], {
      f: { block: 'Frame', props: {}, regions: { content: ['a'] } },
      a: { block: 'Heading', props: { text: 'A', level: 1 }, regions: {} },
    })
    expect(refused(framed, Op.remove(id('a'))).message).toBe(
      '"f"\'s content would hold 0, and takes at least 1',
    )
    expect(refused(start, Op.remove(id('gone'))).code).toBe('composition:missing-node')
  })
})

describe('move', () => {
  it('reorders by the index after the node is taken out, at both ends', () => {
    expect(body(applied(start, Op.move(id('a'), region(id('s'), 'body', 2))).document)).toEqual([
      'b',
      'c',
      'a',
    ])
    expect(body(applied(start, Op.move(id('c'), region(id('s'), 'body', 0))).document)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('moves between Regions, keeping every id', () => {
    const two = page(['s', 'h'], {
      s: { block: 'Section', props: {}, regions: { body: ['c'] } },
      h: { block: 'Hero', props: { title: 'T' }, regions: { actions: [] } },
      c: { block: 'Button', props: { label: 'C' }, regions: {} },
    })
    const result = applied(two, Op.move(id('c'), region(id('h'), 'actions', 0)))
    expect(body(result.document)).toEqual([])
    expect(result.document.nodes[id('h')]?.regions['actions']).toEqual(['c'])
    expect(result.document.nodes[id('c')]).toBe(two.nodes[id('c')])
    expect([...result.changed].sort()).toEqual(['h', 's'])
  })

  it('refuses an incompatible Region, and a node put inside itself', () => {
    expect(refused(start, Op.move(id('a'), root(0))).code).toBe('composition:root-rejects')
    const nested = page(['s'], {
      s: { block: 'Section', props: {}, regions: { body: [] } },
    })
    expect(refused(nested, Op.move(id('s'), region(id('s'), 'body', 0))).message).toBe(
      '"s" cannot go inside itself, at "s"\'s body at 0',
    )
  })

  it('reorders inside a Region that may not be emptied', () => {
    const framed = page(['f'], {
      f: { block: 'Frame', props: {}, regions: { content: ['a', 'b'] } },
      a: { block: 'Heading', props: { text: 'A', level: 1 }, regions: {} },
      b: { block: 'Heading', props: { text: 'B', level: 1 }, regions: {} },
    })
    const alone = page(['f'], {
      f: { block: 'Frame', props: {}, regions: { content: ['a'] } },
      a: { block: 'Heading', props: { text: 'A', level: 1 }, regions: {} },
    })
    expect(
      applied(framed, Op.move(id('a'), region(id('f'), 'content', 1))).document.nodes[id('f')]
        ?.regions['content'],
    ).toEqual(['b', 'a'])
    expect(
      applied(alone, Op.move(id('a'), region(id('f'), 'content', 0))).document.nodes[id('f')]
        ?.regions['content'],
    ).toEqual(['a'])
  })
})

describe('duplicate, a tree, and new ids', () => {
  const nested = page(['h'], {
    h: { block: 'Hero', props: { title: 'T' }, regions: { actions: ['x'] } },
    x: { block: 'Button', props: { label: 'x' }, regions: {} },
  })

  it('copies a subtree under the ids it is given', () => {
    const result = applied(
      nested,
      Op.duplicate({ id: id('h'), ids: { [id('h')]: id('h2'), [id('x')]: id('x2') }, at: root(1) }),
    )
    expect(result.document.roots).toEqual(['h', 'h2'])
    expect(result.document.nodes[id('h2')]).toEqual({
      block: 'Hero',
      props: { title: 'T' },
      regions: { actions: ['x2'] },
    })
  })

  it('refuses ids that miss a node, name one twice, or are taken', () => {
    expect(
      refused(nested, Op.duplicate({ id: id('h'), ids: { [id('h')]: id('h2') }, at: root(1) }))
        .message,
    ).toBe('new ids must name each node of the tree once: "x" has none')
    expect(
      refused(
        nested,
        Op.duplicate({ id: id('h'), ids: { [id('h')]: id('n'), [id('x')]: id('n') }, at: root(1) }),
      ).message,
    ).toBe('two nodes of the tree are given the same new id')
    expect(
      refused(
        nested,
        Op.duplicate({
          id: id('h'),
          ids: { [id('h')]: id('h2'), [id('x')]: id('h') },
          at: root(1),
        }),
      ).code,
    ).toBe('composition:id-taken')
  })

  it('takes a tree and re-keys it, as a copy and paste does', () => {
    const tree = Composition.takeTree(nested, id('h'))
    expect(Object.keys(tree.nodes).sort()).toEqual(['h', 'x'])
    const pasted = Composition.rekey(tree, { [id('h')]: id('p'), [id('x')]: id('q') })
    const result = applied(nested, Op.insertTree({ tree: pasted, at: root(0) }))
    expect(result.document.roots).toEqual(['p', 'h'])
    expect(result.document.nodes[id('p')]?.regions['actions']).toEqual(['q'])
  })

  it('refuses a tree that does not hold together, or does not fit the Catalog', () => {
    const tree = (nodes: Readonly<Record<string, unknown>>, rootId = 't') =>
      Schema.decodeUnknownSync(Composition.Tree)({ root: rootId, nodes })
    const insert = (value: ReturnType<typeof tree>) =>
      refused(nested, Op.insertTree({ tree: value, at: root(0) })).message
    expect(insert(tree({ u: { block: 'Section', props: {}, regions: {} } }))).toBe(
      'the tree\'s root "t" is not one of its nodes',
    )
    expect(
      insert(
        tree({
          t: { block: 'Section', props: {}, regions: {} },
          u: { block: 'Section', props: {}, regions: {} },
        }),
      ),
    ).toBe('the tree holds "u", which its root does not reach')
    expect(
      insert(
        tree({
          t: { block: 'Section', props: {}, regions: { body: ['b', 'b'] } },
          b: { block: 'Button', props: { label: 'b' }, regions: {} },
        }),
      ),
    ).toBe('the tree reaches "b" twice')
    expect(insert(tree({ t: { block: 'Section', props: {}, regions: { body: ['t2'] } } }))).toBe(
      'the tree names "t2", which it does not hold',
    )
    expect(
      insert(
        tree({
          t: { block: 'Section', props: {}, regions: { body: ['b'] } },
          b: { block: 'Hero', props: { title: 'x' }, regions: {} },
        }),
      ),
    ).toBe('"t"\'s body takes Flow, and "b" is a Hero')
  })
})

describe('props and the reserved fields', () => {
  it('sets a prop, checked against the Block', () => {
    const result = applied(start, Op.setProp(id('a'), 'text', 'Hello'))
    expect(result.document.nodes[id('a')]?.props).toEqual({ text: 'Hello', level: 1 })
    expect(result.changed).toEqual(['a'])
    expect(refused(start, Op.setProp(id('a'), 'level', 7)).code).toBe('composition:invalid-props')
    expect(refused(start, Op.setProp(id('a'), 'colour', 'red')).code).toBe(
      'composition:invalid-props',
    )
  })

  it('unsets an optional prop, and refuses a required one', () => {
    const anchored = applied(start, Op.setProp(id('a'), 'anchor', 'top')).document
    expect(
      applied(anchored, Op.unsetProp(id('a'), 'anchor')).document.nodes[id('a')]?.props,
    ).toEqual({ text: 'A', level: 1 })
    expect(refused(start, Op.unsetProp(id('a'), 'text')).code).toBe('composition:invalid-props')
  })

  it('stores and clears a condition, an appearance and an action', () => {
    const set = applied(
      start,
      Op.batch([
        Op.setWhen(id('a'), [Composition.when.eq('audience', 'member')]),
        Op.setAppearance(id('a'), { tone: 'accent' }),
        Op.setAction(id('c'), 'press', { action: 'addToCart', input: { productId: 'p1' } }),
      ]),
    ).document
    expect(set.nodes[id('a')]).toMatchObject({
      when: [{ eq: ['audience', 'member'] }],
      appearance: { tone: 'accent' },
    })
    expect(set.nodes[id('c')]?.actions).toEqual({
      press: { action: 'addToCart', input: { productId: 'p1' } },
    })
    const cleared = applied(
      set,
      Op.batch([
        Op.setWhen(id('a'), null),
        Op.setAppearance(id('a'), null),
        Op.setAction(id('c'), 'press', null),
      ]),
    ).document
    expect(cleared).toEqual(start)
  })

  it('refuses an action on an event the Block lacks, not offered, or given bad input', () => {
    const refusal = (node: string, event: string, action: Schema.Json) =>
      refused(start, Op.setAction(id(node), event, action))
    expect(refusal('c', 'hover', { action: 'addToCart' }).message).toBe(
      `"c"'s actions.hover: a Button has no event "hover"`,
    )
    expect(refusal('a', 'press', { action: 'addToCart' }).code).toBe('composition:invalid-action')
    expect(refusal('c', 'press', { action: 'deleteAll' }).code).toBe('composition:unknown-action')
    expect(refusal('c', 'press', { action: 'addToCart', input: { productId: 7 } }).code).toBe(
      'composition:invalid-action',
    )
    expect(refusal('c', 'press', 'addToCart').message).toBe(
      `"c"'s actions.press: is not an { action, input } reference`,
    )
  })

  it('refuses a condition that is malformed, or over what the context does not declare', () => {
    const refusal = (when: Schema.Json) => refused(start, Op.setWhen(id('a'), when))
    expect(refusal({ eq: ['audience', 'member'] }).code).toBe('composition:invalid-condition')
    expect(refusal([{ eq: ['locale', 'en'] }]).message).toBe(
      `"a"'s when.0: "locale" is not in the page's context`,
    )
    expect(refusal([{ isNull: 'audience' }, { eq: ['audience', 'admin'] }]).message).toBe(
      `"a"'s when.1: "admin" is not a value "audience" can have`,
    )
    expect(
      Result.isSuccess(
        Composition.apply(
          Site,
          start,
          Op.setWhen(id('a'), [Composition.when.isNotNull('audience')]),
        ),
      ),
    ).toBe(true)
  })

  it('refuses an appearance the Block does not offer, each with its own code', () => {
    const refusal = (node: string, appearance: Schema.Json) =>
      refused(start, Op.setAppearance(id(node), appearance))
    expect(refusal('a', { tone: 'loud' }).code).toBe('composition:invalid-appearance')
    expect(refusal('a', { gap: 'xl' }).code).toBe('composition:unknown-token')
    expect(refusal('a', { width: 'wide' }).message).toBe(
      `"a"'s appearance.width: a Heading has no appearance "width"`,
    )
    expect(refusal('a', ['accent']).message).toBe(
      `"a"'s appearance: is not a record of choices by axis`,
    )
    expect(refusal('a', { tone: 3 }).message).toBe(
      `"a"'s appearance.tone: 3 is not one of tone's: plain, accent`,
    )
    // A Block with no axes takes none.
    expect(refusal('c', { tone: 'accent' }).code).toBe('composition:invalid-appearance')
  })

  it('refuses to check props of a Block the Catalog does not know, and keeps working beside one', () => {
    const legacy = page(['s'], {
      s: { block: 'Section', props: {}, regions: { body: ['old', 'a'] } },
      old: { block: 'Embed', props: { url: 'x' }, regions: {} },
      a: { block: 'Heading', props: { text: 'A', level: 1 }, regions: {} },
    })
    expect(refused(legacy, Op.setProp(id('old'), 'url', 'y')).code).toBe(
      'composition:unknown-block',
    )
    expect(applied(legacy, Op.setProp(id('a'), 'text', 'B')).document.nodes[id('old')]).toBe(
      legacy.nodes[id('old')],
    )
    expect(body(applied(legacy, Op.move(id('a'), region(id('s'), 'body', 0))).document)).toEqual([
      'a',
      'old',
    ])
  })
})

describe('batch', () => {
  it('applies every Operation in order, or none of them', () => {
    const both = applied(
      start,
      Op.batch([Op.setProp(id('a'), 'text', 'X'), Op.move(id('a'), region(id('s'), 'body', 2))]),
    )
    expect(body(both.document)).toEqual(['b', 'c', 'a'])
    expect(both.document.nodes[id('a')]?.props['text']).toBe('X')
    expect(
      Composition.apply(
        Site,
        start,
        Op.batch([Op.setProp(id('a'), 'text', 'X'), Op.remove(id('gone'))]),
      ),
    ).toEqual(Result.fail({ code: 'composition:missing-node', message: '"gone" is not a node' }))
  })
})

describe('a batch that edits the same node twice', () => {
  it('finds the node where the batch left it, not where it started', () => {
    const twice = applied(
      start,
      Op.batch([
        Op.move(id('a'), region(id('s'), 'body', 2)),
        Op.move(id('a'), region(id('s'), 'body', 0)),
      ]),
    ).document
    expect(body(twice)).toEqual(['a', 'b', 'c'])
    const added = applied(
      start,
      Op.batch([
        Op.insert({
          id: id('d'),
          block: 'Button',
          props: { label: 'D' },
          at: region(id('s'), 'body', 0),
        }),
        Op.remove(id('d')),
      ]),
    ).document
    expect(added).toEqual(start)
    expect(Composition.validate(Site, twice)).toEqual([])
  })
})

describe('Operations as data', () => {
  it('round-trips every Operation through its Schema, a nested batch included', () => {
    const ops: ReadonlyArray<Operation> = [
      Op.insert({
        id: id('d'),
        block: 'Button',
        props: { label: 'D' },
        at: region(id('s'), 'body', 0),
      }),
      Op.insertTree({ tree: Composition.takeTree(start, id('s')), at: root(0) }),
      Op.remove(id('a')),
      Op.move(id('a'), root(0)),
      Op.duplicate({ id: id('a'), ids: { [id('a')]: id('a2') }, at: root(0) }),
      Op.setProp(id('a'), 'text', 'x'),
      Op.unsetProp(id('a'), 'anchor'),
      Op.setWhen(id('a'), null),
      Op.setAppearance(id('a'), { tone: 'x' }),
      Op.setAction(id('a'), 'press', null),
      Op.batch([Op.batch([Op.remove(id('a'))])]),
    ]
    for (const op of ops) {
      const encoded = Schema.encodeSync(Composition.Operation)(op)
      expect(
        Schema.decodeUnknownSync(Composition.Operation)(JSON.parse(JSON.stringify(encoded))),
      ).toEqual(op)
    }
    expect(
      Result.isFailure(Schema.decodeUnknownResult(Composition.Operation)({ _tag: 'Explode' })),
    ).toBe(true)
  })

  it('mints new ids in an Effect, each one different', () => {
    const ids = Effect.runSync(Composition.newIds(3))
    expect(new Set(ids).size).toBe(3)
  })
})

describe('a Document stays valid under any sequence of applied edits', () => {
  it('never adds a finding, for a seeded run of random Operations', () => {
    let seed = 7
    const next = (limit: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % limit
    }
    let document = start
    let made = 0
    for (let round = 0; round < 500; round++) {
      const ids = Object.keys(document.nodes).map(value => id(value))
      const pick = () => ids[next(ids.length)] ?? id('s')
      const container = pick()
      const where = () =>
        next(3) === 0
          ? root(next(document.roots.length + 1))
          : region(container, next(2) === 0 ? 'body' : 'actions', next(4))
      const candidates: ReadonlyArray<Operation> = [
        Op.insert({
          id: id(`n${made}`),
          block: required(['Heading', 'Button', 'Hero', 'Section'][next(4)], 'a Block'),
          props: {},
          at: where(),
        }),
        Op.insert({ id: id(`n${made}`), block: 'Button', props: { label: 'x' }, at: where() }),
        Op.insert({ id: id(`n${made}`), block: 'Section', props: {}, at: where() }),
        Op.remove(pick()),
        Op.move(pick(), where()),
        Op.setProp(pick(), 'label', 'y'),
        Op.duplicate({ id: pick(), ids: {}, at: where() }),
      ]
      const op = required(candidates[next(candidates.length)], 'an Operation')
      const result = Composition.apply(Site, document, op)
      if (Result.isSuccess(result)) {
        made++
        document = result.success.document
        expect(Composition.validate(Site, document)).toEqual([])
      }
    }
    expect(made).toBeGreaterThan(50)
  })
})
