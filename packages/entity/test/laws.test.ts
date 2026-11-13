/**
 * `Laws.check`: each transition against each invariant of its Entity, by
 * enumeration over finite fields, and the arrows its writes make between the
 * Entity's states.
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Finding,
  Footprint,
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
      { entity: 'Product', names: ['Draft', 'Published', 'Archived'] },
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
