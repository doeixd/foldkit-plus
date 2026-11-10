/**
 * #477: a declared write traced through query impact to the region that draws
 * the result, with each edge asked of the API that already answers it. The
 * findings are in `docs/design/477-write-trace-DESIGN.md`; this file is their
 * evidence, and each `it` names the edge it records.
 *
 * A shop: products with a status and a category. `SetStatus` writes a
 * product's status; `RenameCategory` writes a category's name, which only a
 * path reads. Four lists of products: `Active` filters on status, `Named` reads
 * only names, `InToys` filters through the category's name, and `Opaque` is a
 * list whose meaning only its server knows (no body).
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import {
  Collation,
  Entity,
  Expr,
  Order,
  Query as Body,
  Relation,
  Write,
  dependenciesOf,
} from 'foldkit-entity'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { EntityChange, Impact, impactOn, type HeldConnection } from '../src/impact.js'
import { Mutation, Query, Remote, terminal, type NormalizedPatch } from '../src/index.js'
import { tableOf } from '../src/table.js'
import { explain, why, Why } from '../src/why.js'

const CategoryFields = Entity.define(
  'Category',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const ProductFields = Entity.define(
  'Product',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const Shop = Entity.relate(
  { Category: CategoryFields, Product: ProductFields },
  { Product: { category: Relation.one(CategoryFields) } },
)
const { Category, Product } = Shop

const binary = { collation: Collation.binary }
const byName = [Order.asc(Product.fields.name, binary), Order.asc(Product.fields.id, binary)]
const Active = Query.define('Active', {}, () =>
  Query.from(Product).pipe(
    Query.where(Expr.eq(Product.fields.status, 'active')),
    Query.orderBy(...byName),
  ),
)
const Named = Query.define('Named', {}, () => Query.from(Product).pipe(Query.orderBy(...byName)))
const InToys = Query.define('InToys', {}, () =>
  Query.from(Product).pipe(
    Query.where(Expr.eq(Expr.path(Product.relations.category, Category.fields.name), 'toys')),
    Query.orderBy(...byName),
  ),
)
const Stocked = Query.define('Stocked', {}, () =>
  Query.from(Category).pipe(
    Query.where(Expr.exists(Product.relations.category, Expr.eq(Product.fields.status, 'active'))),
    Query.orderBy(Order.asc(Category.fields.id, binary)),
  ),
)
const Opaque = Query.make('Opaque', { Input: {}, Result: Product })

const SetStatus = Write.update(
  Entity.input(Product, Schema.Struct({ id: Schema.String, status: Schema.String })),
  { id: 'id' },
)
const RenameCategory = Write.update(
  Entity.input(Category, Schema.Struct({ id: Schema.String, name: Schema.String })),
  { id: 'id' },
)
const SetStatusM = Mutation.write('SetStatus', SetStatus)
const RenameCategoryM = Mutation.write('RenameCategory', RenameCategory)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Category, Product],
  queries: [Active, Named, InToys, Opaque],
  mutations: [SetStatusM, RenameCategoryM],
})

const line = Entity.select(Product, { name: true })
const lists = {
  active: Data.query(Active, {}, { select: line, first: 10 }),
  named: Data.query(Named, {}, { select: line, first: 10 }),
  toys: Data.query(InToys, {}, { select: line, first: 10 }),
  opaque: Data.query(Opaque, {}, { select: line, first: 10 }),
}
/** The page that shows the four lists: the active record `subscriptions` takes. */
const surfaces = {
  page: Surface.at(App.surface('Shop', { model: () => lists }), undefined),
}
Data.subscriptions(surfaces)

const rows: ReadonlyArray<NormalizedPatch> = [
  { entity: 'Category', id: 'c1', values: { id: 'c1', name: 'toys' } },
  { entity: 'Category', id: 'c2', values: { id: 'c2', name: 'tools' } },
  {
    entity: 'Product',
    id: 'p1',
    values: { id: 'p1', name: 'ball', status: 'active', category: 'Category:c1' },
  },
  {
    entity: 'Product',
    id: 'p2',
    values: { id: 'p2', name: 'saw', status: 'active', category: 'Category:c2' },
  },
  {
    entity: 'Product',
    id: 'p3',
    values: { id: 'p3', name: 'top', status: 'retired', category: 'Category:c1' },
  },
]
const edges = (ids: ReadonlyArray<string>) =>
  ids.map(id => ({ key: `Product:${id}`, ref: { entity: 'Product', id } }))
/** What the server listed for each, read whole. */
const served = {
  active: ['p1', 'p2'],
  named: ['p1', 'p2', 'p3'],
  toys: ['p1', 'p3'],
  opaque: ['p1', 'p2', 'p3'],
}

const held: Model = [
  {
    _tag: 'ReadReceived' as const,
    requests: rows.map(row => ({
      entity: row.entity,
      id: row.id,
      fields: Object.keys(row.values),
    })),
    result: { settled: [], entities: [...rows] },
    now: 0,
  },
  ...Object.entries(served).map(([list, ids]) => ({
    _tag: 'ConnectionMerged' as const,
    connection: lists[list as keyof typeof lists].ref.identity,
    page: { edges: edges(ids), start: terminal, end: terminal },
  })),
].reduce(Data.reduce, { remote: Remote.initial })

/** Each list as its rows' ids, `stale` where the client must fetch it again. */
const shown = (model: Model) =>
  Object.fromEntries(
    Object.entries(lists).map(([name, list]) => {
      const data = list.read(model)
      const ids =
        data._tag === 'Ready' || data._tag === 'Refreshing'
          ? data.value.items.map(item => item.name)
          : []
      return [name, `${data._tag}:${ids.join(',')}`]
    }),
  )

/** A write started over the held rows, answered by the server's patch of the one row it wrote. */
const answered = (
  started: { readonly model: Model; readonly requestId: string },
  patch: NormalizedPatch,
) =>
  Data.reduce(started.model, {
    _tag: 'MutationSucceeded',
    requestId: started.requestId,
    entities: [patch],
    now: 1,
  })

const setStatus = (id: string, status: string) =>
  answered(Data.mutate(held, SetStatusM, { id, status }), {
    entity: 'Product',
    id,
    values: { status },
  })
const renameCategory = (id: string, name: string) =>
  answered(Data.mutate(held, RenameCategoryM, { id, name }), {
    entity: 'Category',
    id,
    values: { name },
  })

/**
 * Edges 1 and 2 from declarations alone, with the existing APIs: what a write
 * may write (`Write.writes`), and whether a body reads it, as its own row's
 * field (`Query.dependencies(...).fields`) or through another row
 * (`reaches`). Compared by the owner's identity, never its name. A query with
 * no body is `unknown`: its meaning is its server's.
 */
const candidate = (
  write: Parameters<typeof Write.writes>[0],
  descriptor: { readonly body?: Parameters<typeof Body.dependencies>[0] | undefined },
): 'reads' | 'unaffected' | 'unknown' => {
  if (descriptor.body === undefined) return 'unknown'
  const writes = Write.writes(write)
  const same = (owner: { readonly token: symbol }, key: string) =>
    writes.some(member => member.owner.token === owner.token && member.key === key)
  const read = Body.dependencies(descriptor.body)
  const own = read.fields.some(field => same(field.owner, field.key))
  const through = read.reaches.some(reach =>
    Match.value(reach).pipe(
      Match.tagsExhaustive({
        Path: path =>
          same(path.field.owner, path.field.key) ||
          path.via.some(relation => same(relation.owner, relation.key)),
        Exists: exists =>
          same(exists.relation.owner, exists.relation.key) ||
          exists.via.some(relation => same(relation.owner, relation.key)) ||
          Option.exists(exists.where, where =>
            dependenciesOf(where).fields.some(field => same(field.owner, field.key)),
          ),
        ViewerPath: path =>
          same(path.field.owner, path.field.key) ||
          path.via.some(relation => same(relation.owner, relation.key)),
      }),
    ),
  )
  return own || through ? 'reads' : 'unaffected'
}

describe('#477 edge 1, the write: what it may change, from its declaration', () => {
  it('names the members each write may write, by their owner', () => {
    expect(Write.writes(SetStatus).map(member => `${member.owner.name}.${member.key}`)).toEqual([
      'Product.status',
    ])
    expect(
      Write.writes(RenameCategory).map(member => `${member.owner.name}.${member.key}`),
    ).toEqual(['Category.name'])
  })
})

describe('#477 edge 2, the queries a write can reach, from declarations alone', () => {
  it('finds the query whose filter reads the member, and not the one that does not', () => {
    expect(candidate(SetStatus, Active)).toBe('reads')
    expect(candidate(SetStatus, Named)).toBe('unaffected')
    expect(candidate(SetStatus, InToys)).toBe('unaffected')
  })

  it('finds a query that reads the member through a related row, by its reaches', () => {
    expect(candidate(RenameCategory, InToys)).toBe('reads')
    expect(candidate(RenameCategory, Active)).toBe('unaffected')
    // `fields` alone would miss it: a path's field is not the judged row's.
    expect(
      Body.dependencies(InToys.body!).fields.some(
        field => field.owner.token === Category.identity.token,
      ),
    ).toBe(false)
  })

  it("finds a query that reads the member only inside an exists' where, by its reaches", () => {
    expect(candidate(SetStatus, Stocked)).toBe('reads')
    expect(candidate(RenameCategory, Stocked)).toBe('unaffected')
  })

  it('is unknown, never unaffected, for a query whose body only its server has', () => {
    expect(candidate(SetStatus, Opaque)).toBe('unknown')
    expect(candidate(RenameCategory, Opaque)).toBe('unknown')
  })

  it('tells two Entities of one name apart by identity, which explain() cannot', () => {
    const Namesake = Entity.define(
      'Product',
      Schema.Struct({ id: Schema.String, status: Schema.String }),
    )
    const Other = Write.update(
      Entity.input(Namesake, Schema.Struct({ id: Schema.String, status: Schema.String })),
      { id: 'id' },
    )
    expect(candidate(Other, Active)).toBe('unaffected')
    // The serializable explanation names fields by their Entity's name alone.
    const explained = explain(Data, held, lists.active).dependencies?.fields ?? []
    expect(explained).toContainEqual({ entity: 'Product', key: 'status' })
    expect(
      Write.writes(Other).map(member => ({ entity: member.owner.name, key: member.key })),
    ).toEqual([{ entity: 'Product', key: 'status' }])
  })
})

describe('#477 edge 3, the client decision, from the runtime path', () => {
  const before = {
    active: 'Ready:ball,saw',
    named: 'Ready:ball,saw,top',
    toys: 'Ready:ball,top',
    opaque: 'Ready:ball,saw,top',
  }

  it('places the list whose filter the write moved a row out of, and keeps the others', () => {
    expect(shown(held)).toEqual(before)
    expect(shown(setStatus('p2', 'retired'))).toEqual({
      ...before,
      // Placed by the client from the body: saw left, nothing fetched.
      active: 'Ready:ball',
      // Its meaning is its server's: fetched again.
      opaque: 'Refreshing:ball,saw,top',
    })
  })

  it("judges a related row's change through the path, and confirms it with the server", () => {
    expect(shown(renameCategory('c1', 'games'))).toEqual({
      ...before,
      // Both its rows were in c1, now not toys: they leave, and the list is fetched to confirm.
      toys: 'Refreshing:',
      // A list with no body may read categories on its server too (the fix this trace found).
      opaque: 'Refreshing:ball,saw,top',
    })
  })

  it('gives the reason as impactOn decides it, which why says', () => {
    const renamed = renameCategory('c1', 'games')
    const connection: HeldConnection = {
      // As Remote holds it: erased, by the name the domain registered it under.
      descriptor: Data.definition.registry.queries.get('Opaque')!,
      encoded: {},
      holds: new Set(['Product:p1', 'Product:p2', 'Product:p3']),
      connection: held.remote.connections[lists.opaque.ref.identity]!,
      filtered: [],
    }
    const change = EntityChange.Changed({
      entity: 'Category',
      id: 'c1',
      fields: ['name'],
      created: false,
    })
    expect(impactOn(connection, Data.storeOf(renamed), change, tableOf(Data.operators))).toEqual(
      Impact.Invalidated({
        reason: 'query "Opaque" declares no body, so what it reads is unknown',
      }),
    )
    // The reducer keeps the reason (#489): `why` says it beside the stale list.
    expect(why(Data, renamed, lists.opaque).because).toEqual([
      Why.List({
        list: { query: 'Opaque', identity: lists.opaque.ref.identity },
        held: 'Stale',
        inFlight: false,
      }),
      Why.Invalidated({
        list: { query: 'Opaque', identity: lists.opaque.ref.identity },
        because: 'query "Opaque" declares no body, so what it reads is unknown',
      }),
    ])
  })
})

describe('#489, why a list went stale', () => {
  const stale = (list: { readonly ref: { readonly identity: string } }) =>
    why(Data, renameCategory('c1', 'games'), list as typeof lists.toys).because.filter(
      Why.guards.Invalidated,
    )

  it('names the path a related row changed, for a list judged again through it', () => {
    expect(stale(lists.toys)).toEqual([
      Why.Invalidated({
        list: { query: 'InToys', identity: lists.toys.ref.identity },
        because:
          'a write changed what "InToys" reads through other rows, which may have moved rows the client does not hold',
      }),
    ])
    // A list the write left as it was says nothing.
    expect(stale(lists.active)).toEqual([])
  })

  it('drops the reason of a list retention collects', () => {
    const renamed = renameCategory('c1', 'games')
    expect(Object.keys(renamed.remote.staleBecause)).toContain(lists.toys.ref.identity)
    // Nothing on the page any more, and nothing kept for going back.
    const left = Data.reduce(renamed, {
      _tag: 'RetentionChanged',
      roots: { requirements: [], connections: [] },
      budget: 0,
    })
    expect(left.remote.connections[lists.toys.ref.identity]).toBeUndefined()
    expect(left.remote.staleBecause).toEqual({})
  })

  it('keeps the reason that made it stale, and drops it once a page answers it', () => {
    const renamed = renameCategory('c1', 'games')
    // Refreshed while already stale: the write is still why it went stale.
    const again = Data.reduce(renamed, {
      _tag: 'ConnectionInvalidated',
      connection: lists.toys.ref.identity,
    })
    expect(again.remote.staleBecause[lists.toys.ref.identity]).toBe(
      renamed.remote.staleBecause[lists.toys.ref.identity],
    )
    const answered = Data.reduce(again, {
      _tag: 'ConnectionMerged',
      connection: lists.toys.ref.identity,
      page: { edges: [], start: terminal, end: terminal },
      // The refetch's page, which answers the list whole.
      refreshes: true,
    })
    expect(why(Data, answered, lists.toys).because.filter(Why.guards.Invalidated)).toEqual([])
  })
})

describe('#477 edge 4, the Surfaces that read a list, from the active record', () => {
  it('names the Surface reading each list, given the record subscriptions takes', () => {
    expect(explain(Data, held, lists.active, { surfaces }).surfaces).toEqual(['Shop'])
    // Without it the explanation cannot say, and leaves the member out.
    expect(explain(Data, held, lists.active).surfaces).toBeUndefined()
  })
})

describe('#477 edge 5, the region that draws a list', () => {
  it("is reused where the write left the list's read as it was, and redrawn where it moved it", () => {
    // As `SlotView.region` reads it: a derivation over the list's read.
    const named = Projection.derive([lists.named], (root: Model) => lists.named.read(root))
    const active = Projection.derive([lists.active], (root: Model) => lists.active.read(root))
    const after = setStatus('p2', 'retired')
    const [namedBefore, activeBefore] = [named.read(held), active.read(held)]
    expect(named.read(after)).toBe(namedBefore)
    expect(active.read(after)).not.toBe(activeBefore)
  })
})
