/**
 * A path from the viewer (`Expr.path(Expr.viewer(Member), end)`): what the
 * asker's row holds, or a row reached from it, set on a write
 * (`Entity.sets`) and read one row at a time from what a holder has: unheld
 * where it lacks a row, null where a link or the viewer is none.
 * operations-phase3-DESIGN.
 */
import { Effect, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Held,
  Judge,
  Order,
  Query,
  Relation,
  Write,
  evaluate,
  type ContextRead,
  type ExprContext,
  type HeldRows,
} from '../src/index.js'

const Fields = {
  Org: Entity.define('Org', Schema.Struct({ id: Schema.String, plan: Schema.String })),
  Team: Entity.define('Team', Schema.Struct({ id: Schema.String, orgId: Schema.String })),
  Member: Entity.define('Member', Schema.Struct({ id: Schema.String, name: Schema.String })),
  Note: Entity.define(
    'Note',
    Schema.Struct({ id: Schema.String, body: Schema.String, orgId: Schema.String }),
  ),
}
const {
  Team,
  Member,
  Note: Unset,
} = Entity.relate(Fields, {
  Member: { team: Relation.one(Fields.Team, { optional: true }) },
  Team: { org: Relation.one(Fields.Org) },
})
const orgOfViewer = Expr.path(
  Expr.viewer(Member),
  Expr.path(Member.relations.team, Team.fields.orgId),
)
// A note belongs to the organisation of whoever writes it.
const Note = Unset.pipe(Entity.sets({ orgId: orgOfViewer }, { on: 'create' }))
const AddNote = Write.insert(
  Entity.input(Note, Schema.Struct({ id: Schema.String, body: Schema.String })),
  { id: 'id' },
)

/** Rows held by ref, each member as a store holds it: a link as its ref key. */
const holding =
  (rows: Readonly<Record<string, Readonly<Record<string, unknown>>>>): ContextRead<never, never> =>
  (row, key) => {
    const held = rows[`${row.entity}:${row.id}`]
    return Effect.succeed(
      held !== undefined && Object.hasOwn(held, key)
        ? Held.of(held[key])
        : Held.unheld(`${row.entity}.${key} is not held`),
    )
  }
const asking = (id: string, entity = 'Member'): ExprContext => ({
  viewer: Option.some({ entity, id }),
  now: Option.none(),
})
const world = {
  'Member:ada': { id: 'ada', team: 'Team:t1' },
  'Member:bo': { id: 'bo', team: null },
  'Team:t1': { id: 't1', orgId: 'acme' },
}
const set = (
  by: ExprContext,
  rows: Readonly<Record<string, Readonly<Record<string, unknown>>>> = world,
) => Effect.runSync(Write.contextValues(AddNote, by, holding(rows)))

describe('a path from the viewer', () => {
  it('is what the row reached from the viewer holds', () => {
    expect(set(asking('ada'))).toEqual({ values: { orgId: 'acme' }, links: {}, unfilled: [] })
  })

  it('reaches no row through a null link, nor for a visitor or a viewer of another Entity', () => {
    expect(set(asking('bo')).unfilled).toEqual(['orgId'])
    expect(set({ viewer: Option.none(), now: Option.none() }).unfilled).toEqual(['orgId'])
    expect(set(asking('ada', 'Org')).unfilled).toEqual(['orgId'])
  })

  it('is unheld where the holder lacks a row it reaches', () => {
    expect(set(asking('ada'), { 'Member:ada': world['Member:ada'] })).toMatchObject({
      values: {},
      unfilled: ['orgId'],
    })
  })

  it('tells a null, which a field holding none takes, from what the holder lacks', () => {
    const Draft = Entity.define(
      'Draft',
      Schema.Struct({ id: Schema.String, orgId: Schema.NullOr(Schema.String) }),
    ).pipe(Entity.sets({ orgId: orgOfViewer }, { on: 'create' }))
    const AddDraft = Write.insert(Entity.input(Draft, Schema.Struct({ id: Schema.String })), {
      id: 'id',
    })
    const draft = (
      by: ExprContext,
      rows: Readonly<Record<string, Readonly<Record<string, unknown>>>>,
    ) => Effect.runSync(Write.contextValues(AddDraft, by, holding(rows)))
    expect(draft(asking('bo'), world).values).toEqual({ orgId: null })
    const lacking = { 'Member:ada': world['Member:ada'] }
    expect(draft(asking('ada'), lacking)).toMatchObject({ values: {}, unfilled: ['orgId'] })
    const linkless = { 'Member:ada': { id: 'ada' } }
    expect(draft(asking('ada'), linkless)).toMatchObject({ values: {}, unfilled: ['orgId'] })
    const unread = { ...lacking, 'Team:t1': { id: 't1' } }
    expect(draft(asking('ada'), unread)).toMatchObject({ values: {}, unfilled: ['orgId'] })
  })

  it('names the Entities it reads, which a server must serve', () => {
    expect(Write.contextReads(AddNote)).toEqual(['Member', 'Team'])
  })

  it('is refused where it is written for an end on another Entity, or an exists', () => {
    // @ts-expect-error the viewer is a Member, not a Team
    expect(() => Expr.path(Expr.viewer(Member), Team.fields.orgId)).toThrow(
      'the viewer is a Member, but Team.orgId is read on a Team',
    )
    expect(() =>
      // @ts-expect-error a path from the viewer ends at a value
      Expr.path(Expr.viewer(Team), Expr.exists(Member.relations.team)),
    ).toThrow('a path from the viewer ends at a field or a path')
  })

  describe('in a body, judged over what a holder has', () => {
    const InOrg = Query.from(Fields.Note).pipe(
      Query.where(Expr.eq(Fields.Note.fields.orgId, orgOfViewer)),
    )
    const notes = [
      { id: 'n1', body: 'mine', orgId: 'acme' },
      { id: 'n2', body: 'theirs', orgId: 'globex' },
    ]
    const holder = (members: ReadonlyArray<Record<string, unknown>>, complete = true) =>
      Held.rows([
        { entity: Fields.Note, rows: notes },
        { entity: Member, rows: members, complete },
        { entity: Team, rows: [{ id: 't1', orgId: 'acme' }] },
      ])
    const verdicts = (by: ExprContext, rows: HeldRows | undefined) =>
      notes.map(note =>
        Judge.query(InOrg, {}, rows!.row(Fields.Note, note.id).pipe(Option.getOrThrow), {
          context: by,
          rows,
        }),
      )
    const known = (truth: boolean) => ({ _tag: 'Known', truth })

    it("keeps the notes of the viewer's organisation", () => {
      const rows = holder([{ id: 'ada', team: 't1' }])
      expect(verdicts(asking('ada'), rows)).toEqual([known(true), known(false)])
    })

    it('keeps none for a visitor, a viewer of another Entity, or a viewer in no team', () => {
      // Not every Member is held: a visitor's path starts at no row, whatever is held.
      const rows = holder(
        [
          { id: 'ada', team: 't1' },
          { id: 'bo', team: null },
        ],
        false,
      )
      const none = [known(false), known(false)]
      expect(verdicts({ viewer: Option.none(), now: Option.none() }, rows)).toEqual(none)
      expect(verdicts(asking('ada', 'Org'), rows)).toEqual(none)
      expect(verdicts(asking('bo'), rows)).toEqual(none)
    })

    it("is unknown where the holder lacks the viewer's row, and absent where it holds every one", () => {
      expect(verdicts(asking('ada'), holder([], false)).map(each => each._tag)).toEqual([
        'Unknown',
        'Unknown',
      ])
      expect(verdicts(asking('ada'), holder([], true))).toEqual([known(false), known(false)])
    })

    it('is unknown where the holder hides the field it reads, or was given no rows', () => {
      const hidden = Held.rows([
        { entity: Fields.Note, rows: notes },
        { entity: Member, rows: [{ id: 'ada', team: 't1' }] },
        { entity: Team, rows: [{ id: 't1', orgId: 'acme' }], hidden: ['orgId'] },
      ])
      const note = hidden.row(Fields.Note, 'n1').pipe(Option.getOrThrow)
      expect(Judge.query(InOrg, {}, note, { context: asking('ada'), rows: hidden })._tag).toBe(
        'Unknown',
      )
      expect(Judge.query(InOrg, {}, note, { context: asking('ada') })._tag).toBe('Unknown')
    })

    it('is refused by a run over one row, as a path is', () => {
      expect(() => evaluate(InOrg, {}, notes, { context: asking('ada') })).toThrow(
        'does not run path',
      )
    })

    it('reads the viewer and the Entities it reaches, and none of the judged row', () => {
      const read = Query.dependencies(InOrg)
      expect(read.operations).toEqual(expect.arrayContaining(['viewer', 'path']))
      expect(read.fields.map(field => field.key)).toEqual(['orgId'])
      expect(read.reaches).toEqual([orgOfViewer])
      expect(Expr.show(orgOfViewer)).toBe('viewer Member.team.orgId')
    })

    it('is no order', () => {
      expect(() => Order.asc(orgOfViewer)).toThrow('is a path from the viewer')
    })
  })

  it('sets only a field that can hold what its end holds', () => {
    const toName = Expr.path(Expr.viewer(Member), Member.fields.name)
    expect(() => Unset.pipe(Entity.sets({ body: toName }, { on: 'create' }))).not.toThrow()
    const Counted = Entity.define(
      'Counted',
      Schema.Struct({ id: Schema.String, count: Schema.Number }),
    )
    // @ts-expect-error a name is text, the count a number
    expect(() => Counted.pipe(Entity.sets({ count: toName }, { on: 'create' }))).toThrow(
      'sets "count" to what Member.name holds, which it is not stored as',
    )
  })
})
