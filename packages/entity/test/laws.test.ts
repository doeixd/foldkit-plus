/**
 * `Laws.check`: each transition against each invariant of its Entity, by
 * enumeration over finite fields, and the arrows its writes make between the
 * Entity's states.
 */
import { Option, Schema } from 'effect'
import { Evidence } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Finding,
  Footprint,
  LawEdge,
  LawNode,
  Laws,
  Write,
  type LawReport,
  type LawVerdict,
} from '../src/index.js'

const Fields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.Literals(['draft', 'published', 'archived']),
    stock: Schema.Number,
    reserved: Schema.Number,
    sold: Schema.Number,
  }),
)
const reservedWithinStock = Entity.invariant<typeof Fields>(
  'reservedWithinStock',
  ({ after }) => Expr.lte(after.reserved, after.stock),
  { message: 'Reserved stock cannot exceed the stock' },
)
const publishedStaysPublished = Entity.invariant<typeof Fields>(
  'publishedStaysPublished',
  ({ before, after }) =>
    Expr.or(
      Expr.not(Expr.eq(before.status, 'published')),
      Expr.not(Expr.eq(after.status, 'draft')),
    ),
  { message: 'A published product does not go back to draft' },
)
/** A transition invariant over a number: broken by any write that leaves `sold` alone, if it said `>`. */
const soldNeverFalls = Entity.invariant<typeof Fields>(
  'soldNeverFalls',
  ({ before, after }) => Expr.gte(after.sold, before.sold),
  { message: 'What was sold stays sold' },
)
const Product = Fields.pipe(reservedWithinStock, publishedStaysPublished, soldNeverFalls)

const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })
const Published = Entity.refine(Product, 'Published', { status: 'published' })
Entity.refine(Product, 'Archived', { status: 'archived' })
/** Over a number: never enumerated, and no cost to the arrows between the others. */
const InStock = Entity.refine(Product, 'InStock', ({ row }) => Expr.gt(row.stock, 0))

const status = (value: 'draft' | 'published' | 'archived') =>
  Entity.input(Product, Schema.Struct({ id: Schema.String, status: Schema.Literal(value) }))

const Rename = {
  name: 'Rename',
  write: Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, name: Schema.String })),
    {
      id: 'id',
    },
  ),
}
const Publish = {
  name: 'Publish',
  write: Write.update(status('published'), { id: 'id', from: Draft, becomes: Published }),
}
const Revert = { name: 'Revert', write: Write.update(status('draft'), { id: 'id' }) }
/** Back to draft, but never from published: kept only because its `when` says so. */
const Unpublish = {
  name: 'Unpublish',
  write: Write.update(status('draft'), {
    id: 'id',
    when: () => Expr.not(Expr.eq(Product.fields.status, 'published')),
  }),
}
const Sell = {
  name: 'Sell',
  write: Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Number }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
}
const Remove = {
  name: 'Remove',
  write: Write.delete(Entity.input(Product, Schema.Struct({ id: Schema.String })), { id: 'id' }),
}

const verdict = (report: LawReport, write: string, invariant: string): LawVerdict => {
  const pair = report.pairs.find(each => each.write === write && each.invariant === invariant)
  if (pair === undefined) throw new Error(`no pair ${write} x ${invariant}`)
  return pair.verdict
}

describe('Laws.check: a write against an invariant', () => {
  const report = Laws.check({ writes: [Rename, Publish, Revert, Unpublish, Sell, Remove] })

  it('keeps a state invariant whose members the write does not write, by disjointness', () => {
    expect(verdict(report, 'Rename', 'reservedWithinStock')).toMatchObject({
      _tag: 'Kept',
      by: 'disjointness',
    })
  })

  it('never keeps a transition invariant by disjointness: over a number it is undecided', () => {
    expect(verdict(report, 'Rename', 'soldNeverFalls')).toEqual({
      _tag: 'Undecided',
      reason: 'sold is not finite',
    })
  })

  it('enumerates a transition invariant over finite fields the write leaves alone', () => {
    expect(verdict(report, 'Rename', 'publishedStaysPublished')).toMatchObject({
      _tag: 'Kept',
      by: 'enumeration',
      rows: 3,
    })
  })

  it('a numeric invariant the write moves is undecided, never kept', () => {
    expect(verdict(report, 'Sell', 'reservedWithinStock')).toEqual({
      _tag: 'Undecided',
      reason: 'stock is incremented',
    })
  })

  it('refuses with the rows that break it', () => {
    const refused = verdict(report, 'Revert', 'publishedStaysPublished')
    expect(refused._tag).toBe('Refused')
    expect(refused).toMatchObject({
      steps: [{ before: { status: 'published' }, after: { status: 'draft' } }],
    })
  })

  it('judges the when over each row, dropping one it refuses', () => {
    expect(verdict(report, 'Unpublish', 'publishedStaysPublished')).toMatchObject({
      _tag: 'Kept',
      by: 'enumeration',
      rows: 2,
    })
    expect(verdict(report, 'Publish', 'publishedStaysPublished')).toMatchObject({
      _tag: 'Kept',
      rows: 1,
    })
  })

  it('a delete leaves no row to judge', () => {
    expect(verdict(report, 'Remove', 'reservedWithinStock')).toMatchObject({
      _tag: 'Kept',
      by: 'delete',
    })
  })

  it('carries each pair its members and the write footprint', () => {
    const pair = report.pairs.find(
      each => each.write === 'Sell' && each.invariant === 'reservedWithinStock',
    )!
    expect(pair.reads).toEqual(['reserved', 'stock'])
    expect(pair.footprint).toEqual(Footprint.Derived({ reads: ['stock'], writes: ['stock'] }))
  })
})

describe('Laws.check: an operator the table lacks', () => {
  const odd = Expr.operator('acme.odd', { input: [Schema.String], output: Schema.Boolean })
  const Thing = Entity.define(
    'Thing',
    Schema.Struct({ id: Schema.String, kind: Schema.Literals(['a', 'b']) }),
  ).pipe(Entity.invariant('odd', ({ after }) => odd(after.kind), { message: 'odd' }))
  const SetKind = {
    name: 'SetKind',
    write: Write.update(
      Entity.input(Thing, Schema.Struct({ id: Schema.String, kind: Schema.Literal('a') })),
      { id: 'id' },
    ),
  }

  it('is undecided, never kept', () => {
    expect(verdict(Laws.check({ writes: [SetKind] }), 'SetKind', 'odd')).toEqual({
      _tag: 'Undecided',
      reason: 'it calls acme.odd, which the operator table does not run',
    })
  })
})

describe('Laws.check: a write expecting a revision', () => {
  const Doc = Entity.define(
    'Doc',
    Schema.Struct({ id: Schema.String, name: Schema.String, revision: Schema.Number }),
  ).pipe(
    Entity.invariant('fewRevisions', ({ after }) => Expr.lt(after.revision, 100), {
      message: 'few',
    }),
  )
  const Edit = {
    name: 'Edit',
    write: Write.update(
      Entity.input(
        Doc,
        Schema.Struct({ id: Schema.String, name: Schema.String, revision: Schema.Number }),
      ),
      { id: 'id', expect: 'revision' },
    ),
  }

  it('moves the revision on, so an invariant over it is not kept by disjointness', () => {
    expect(verdict(Laws.check({ writes: [Edit] }), 'Edit', 'fewRevisions')).toEqual({
      _tag: 'Undecided',
      reason: 'revision is the revision it expects, moved on where it lands',
    })
    expect(Write.footprint(Edit.write)).toEqual(
      Footprint.Derived({ reads: ['revision'], writes: ['name', 'revision'] }),
    )
  })
})

describe('Laws.check: an insert', () => {
  const Toggle = Entity.define(
    'Toggle',
    Schema.Struct({ id: Schema.String, on: Schema.Boolean }),
  ).pipe(Entity.invariant('on', ({ after }) => Expr.eq(after.on, true), { message: 'on' }))
  const create = (on: Schema.Top) => ({
    name: 'Create',
    write: Write.insert(
      Entity.input(Toggle, Schema.Struct({ id: Schema.String, on: on as typeof Schema.Boolean })),
      { id: 'id' },
    ),
  })

  it('is judged over what it sets', () => {
    expect(
      verdict(Laws.check({ writes: [create(Schema.Literal(true))] }), 'Create', 'on'),
    ).toMatchObject({
      _tag: 'Kept',
      by: 'enumeration',
    })
    expect(verdict(Laws.check({ writes: [create(Schema.Boolean)] }), 'Create', 'on')._tag).toBe(
      'Refused',
    )
  })

  it('is undecided where it may leave a field unwritten', () => {
    expect(
      verdict(Laws.check({ writes: [create(Schema.optionalKey(Schema.Boolean))] }), 'Create', 'on'),
    ).toEqual({ _tag: 'Undecided', reason: 'the write may leave on unwritten' })
  })
})

describe('Laws.check: footprints', () => {
  const Touch = {
    name: 'Touch',
    entity: Product,
    footprint: Footprint.declared({ writes: [Product.fields.name], by: 'the Domain model' }),
  }
  const Restock = {
    name: 'Restock',
    entity: Product,
    footprint: Footprint.declared({ writes: [Product.fields.stock], by: 'the Domain model' }),
  }
  const Import = { name: 'Import', entity: Product, footprint: Footprint.unknown }
  const report = Laws.check({ writes: [Touch, Restock, Import] })

  it('keeps a state invariant a declared footprint does not write, marked declared', () => {
    expect(verdict(report, 'Touch', 'reservedWithinStock')).toMatchObject({
      _tag: 'Kept',
      by: 'declared',
    })
    expect(verdict(report, 'Restock', 'reservedWithinStock')._tag).toBe('Undecided')
  })

  it('decides no transition invariant by a declared footprint', () => {
    expect(verdict(report, 'Touch', 'publishedStaysPublished')._tag).toBe('Undecided')
  })

  it('an unknown footprint writes every member: undecided against every invariant', () => {
    for (const invariant of ['reservedWithinStock', 'publishedStaysPublished', 'soldNeverFalls'])
      expect(verdict(report, 'Import', invariant)._tag).toBe('Undecided')
  })

  it('refuses a declared footprint of another Entity', () => {
    const Other = Entity.define('Other', Schema.Struct({ id: Schema.String, name: Schema.String }))
    const stranger = Footprint.declared({ writes: [Other.fields.name], by: 'nobody' })
    expect(() =>
      Laws.check({
        // @ts-expect-error
        writes: [{ name: 'Stray', entity: Product, footprint: stranger }],
      }),
    ).toThrow(/its footprint names Other's fields/)
    expect(() =>
      Footprint.declared({
        writes: [Other.fields.name, Product.fields.name],
        by: 'nobody',
      }),
    ).toThrow(/a footprint is of one Entity/)
  })
})

describe('Laws.check: states', () => {
  const findings = (report: LawReport) => report.findings.map(each => ({ ...each }))

  it('reports each arrow between states, and the states nothing reaches', () => {
    const report = Laws.check({ writes: [Rename, Publish, Revert, Sell] })
    expect(report.states).toEqual([
      { entity: 'Product', names: ['Draft', 'Published', 'Archived', 'InStock'] },
    ])
    expect(findings(report)).toEqual(
      [
        Finding.Holds({ entity: 'Product', write: 'Publish', from: 'Draft', to: 'Published' }),
        Finding.Refused({
          entity: 'Product',
          write: 'Revert',
          from: 'Published',
          to: 'Draft',
          invariant: 'publishedStaysPublished',
        }),
        Finding.Undeclared({ entity: 'Product', write: 'Revert', from: 'Archived', to: 'Draft' }),
        Finding.Unreached({ entity: 'Product', state: 'Archived' }),
      ].map(each => ({ ...each })),
    )
  })

  it('a state only a refused arrow leads to is unreached', () => {
    const Unpublish = {
      name: 'Unpublish',
      write: Write.update(status('draft'), { id: 'id', from: Published }),
    }
    expect(findings(Laws.check({ writes: [Unpublish] }))).toContainEqual({
      ...Finding.Unreached({ entity: 'Product', state: 'Draft' }),
    })
  })

  it('reports a state no write starts from as terminal', () => {
    const report = Laws.check({ writes: [Publish] })
    expect(findings(report)).toContainEqual({
      ...Finding.Terminal({ entity: 'Product', state: 'Published' }),
    })
  })

  it('an unknown footprint may move a row anywhere, so no state is called unreached', () => {
    const report = Laws.check({
      writes: [Publish, { name: 'Import', entity: Product, footprint: Footprint.unknown }],
    })
    expect(report.findings.filter(Finding.$is('Unreached'))).toEqual([])
    expect(report.findings.filter(Finding.$is('Terminal'))).toEqual([])
  })

  it('a state over a number is undecided where a write moves it, and costs the others nothing', () => {
    const report = Laws.check({ writes: [Publish, Sell] })
    expect(findings(report)).toContainEqual({
      ...Finding.Holds({ entity: 'Product', write: 'Publish', from: 'Draft', to: 'Published' }),
    })
    expect(report.findings.filter(each => 'state' in each && each.state === 'InStock')).toEqual([])
    expect(findings(Laws.check({ writes: [Publish] }))).toContainEqual({
      ...Finding.Unreached({ entity: 'Product', state: 'InStock' }),
    })
  })

  it('reports a becomes enumeration cannot decide as enforced, and judges its postcondition', () => {
    const SellInStock = {
      name: 'SellInStock',
      write: Write.update(Sell.write.input, {
        id: 'id',
        increment: { stock: 'quantity' },
        becomes: InStock,
      }),
    }
    const report = Laws.check({ writes: [SellInStock] })
    expect(report.findings.filter(Finding.$is('Enforced')).map(each => ({ ...each }))).toEqual([
      { ...Finding.Enforced({ entity: 'Product', write: 'SellInStock', to: 'InStock' }) },
    ])
    // The postcondition can refuse the sale, as an invariant can: it is a pair of that write alone.
    expect(verdict(report, 'SellInStock', 'becomes:InStock')).toEqual({
      _tag: 'Undecided',
      reason: 'stock is incremented',
    })
    expect(Laws.show(report).split('\n').slice(0, 2)).toEqual([
      'Product',
      '  * -> InStock   SellInStock   enforced',
    ])
    expect(Laws.check({ writes: [Sell] }).pairs.map(pair => pair.invariant)).not.toContain(
      'becomes:InStock',
    )
  })

  it('prints the report', () => {
    expect(Laws.show(Laws.check({ writes: [Publish, Revert, Sell] }))).toBe(
      [
        'Product',
        '  Draft -> Published   Publish   holds',
        '  Published -> Draft   Revert    refused by publishedStaysPublished',
        '  Archived -> Draft    Revert    undeclared',
        '  Archived                       unreached',
        '',
        'Publish   x reservedWithinStock       kept: writes no member it reads',
        'Publish   x publishedStaysPublished   kept: 1 row enumerated',
        'Publish   x soldNeverFalls            undecided: sold is not finite',
        'Revert    x reservedWithinStock       kept: writes no member it reads',
        'Revert    x publishedStaysPublished   refused: from {"status":"published"} it leaves {"status":"draft"}',
        'Revert    x soldNeverFalls            undecided: sold is not finite',
        'Sell      x reservedWithinStock       undecided: stock is incremented',
        'Sell      x publishedStaysPublished   kept: 3 rows enumerated',
        'Sell      x soldNeverFalls            undecided: sold is not finite',
      ].join('\n'),
    )
  })
})

describe('Laws.check: evidence', () => {
  const Touch = {
    name: 'Touch',
    entity: Product,
    footprint: Footprint.declared({ writes: [Product.fields.name], by: 'the Domain model' }),
  }
  const report = Laws.check({ writes: [Rename, Revert, Sell, Remove, Touch] })
  const evidence = (write: string, invariant: string) =>
    report.pairs.find(each => each.write === write && each.invariant === invariant)!.evidence

  it.each([
    ['Rename', 'reservedWithinStock', 'disjointness'],
    ['Rename', 'publishedStaysPublished', 'enumeration'],
    ['Remove', 'reservedWithinStock', 'delete'],
  ])('issues an Enumerated record for %s x %s, kept by %s', (write, invariant) => {
    const record = Option.getOrThrow(evidence(write, invariant))
    expect(record).toEqual(
      Evidence.Enumerated({ transition: `write:${write}`, law: `Product.${invariant}` }),
    )
    expect(Evidence.issuedBy(record)).toEqual(Option.some('foldkit-entity/laws'))
  })

  it.each([
    ['Sell', 'reservedWithinStock', 'undecided'],
    ['Revert', 'publishedStaysPublished', 'refused'],
    ['Touch', 'reservedWithinStock', "kept on its author's word"],
  ])('issues none for %s x %s, %s', (write, invariant) => {
    expect(evidence(write, invariant)).toEqual(Option.none())
  })

  it('names transitions and laws as the graph and evidence do', () => {
    expect(Laws.transition(Sell)).toBe('write:Sell')
    expect(Laws.law(reservedWithinStock)).toBe('Product.reservedWithinStock')
  })
})

describe('Laws.facts', () => {
  const SellInStock = {
    name: 'SellInStock',
    write: Write.update(Sell.write.input, {
      id: 'id',
      increment: { stock: 'quantity' },
      becomes: InStock,
    }),
  }
  const Import = { name: 'Import', entity: Product, footprint: Footprint.unknown }
  const Restock = {
    name: 'Restock',
    entity: Product,
    footprint: Footprint.declared({ writes: [Product.fields.stock], by: 'the Domain model' }),
  }
  const report = Laws.check({ writes: [Publish, Revert, SellInStock, Import, Restock] })
  const { nodes, edges } = Laws.facts(report)
  const plain = (each: ReadonlyArray<object>) => each.map(item => ({ ...item }))

  it('makes a node of each law, transition and state, and of each member named', () => {
    expect(plain(nodes.filter(LawNode.$is('Law')))).toEqual(
      ['reservedWithinStock', 'publishedStaysPublished', 'soldNeverFalls'].map(id => ({
        ...LawNode.Law({ id: `Product.${id}` }),
      })),
    )
    expect(plain(nodes.filter(LawNode.$is('Transition')))).toEqual(
      ['Publish', 'Revert', 'SellInStock', 'Import', 'Restock'].map(name => ({
        ...LawNode.Transition({ id: `write:${name}`, kind: 'write' }),
      })),
    )
    expect(nodes.filter(LawNode.$is('State')).map(state => state.name)).toEqual([
      'Draft',
      'Published',
      'Archived',
      'InStock',
    ])
    expect(nodes.filter(LawNode.$is('Path')).map(each => each.path.join('.'))).toContain(
      'Product.reserved',
    )
  })

  it('says what each law reads and each transition writes, once each', () => {
    expect(
      edges.filter(LawEdge.$is('Reads')).filter(each => each.law === 'Product.reservedWithinStock'),
    ).toEqual([
      LawEdge.Reads({ law: 'Product.reservedWithinStock', path: ['Product', 'reserved'] }),
      LawEdge.Reads({ law: 'Product.reservedWithinStock', path: ['Product', 'stock'] }),
    ])
    expect(plain(edges.filter(LawEdge.$is('Writes')))).toEqual(
      [
        ['Publish', 'status'],
        ['Revert', 'status'],
        ['SellInStock', 'stock'],
        ['Restock', 'stock'],
      ].map(([name, member]) => ({
        ...LawEdge.Writes({ transition: `write:${name}`, path: ['Product', member!] }),
      })),
    )
  })

  it('joins a transition to a law it keeps by its Enumerated record, and no other', () => {
    const keeps = edges.filter(LawEdge.$is('Keeps'))
    const decided = report.pairs.filter(pair => Option.isSome(pair.evidence))
    expect(keeps.map(each => [each.transition, each.law])).toEqual(
      decided.map(pair => [`write:${pair.write}`, `Product.${pair.invariant}`]),
    )
    expect(keeps.map(each => each.evidence)).toEqual(
      decided.map(pair => Option.getOrThrow(pair.evidence)),
    )
    expect(
      keeps.some(
        each =>
          each.transition === 'write:Revert' && each.law === 'Product.publishedStaysPublished',
      ),
    ).toBe(false)
  })

  it("leaves a write's own postcondition out, and draws its becomes as a to edge", () => {
    expect(nodes.some(each => LawNode.$is('Law')(each) && each.id.includes('becomes:'))).toBe(false)
    expect(plain(edges.filter(LawEdge.$is('To')))).toEqual(
      [
        ['Publish', 'Published'],
        ['Revert', 'Draft'],
        ['SellInStock', 'InStock'],
      ].map(([name, state]) => ({
        ...LawEdge.To({ transition: `write:${name}`, entity: 'Product', state: state! }),
      })),
    )
    expect(
      edges.filter(LawEdge.$is('From')).map(each => `${each.transition} ${each.state}`),
    ).toEqual(['write:Publish Draft', 'write:Revert Published', 'write:Revert Archived'])
  })
})
