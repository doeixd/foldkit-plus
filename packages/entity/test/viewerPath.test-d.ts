/** A path from the viewer compares as the value at its end, or null. operations-phase5-DESIGN. */
import { Schema } from 'effect'
import { Entity, Expr, Query, Relation } from '../src/index.js'

const Fields = {
  Team: Entity.define(
    'Team',
    Schema.Struct({ id: Schema.String, orgId: Schema.String, size: Schema.Number }),
  ),
  Member: Entity.define('Member', Schema.Struct({ id: Schema.String })),
  Note: Entity.define('Note', Schema.Struct({ id: Schema.String, orgId: Schema.String })),
}
const { Team, Member, Note } = Entity.relate(Fields, {
  Member: { team: Relation.one(Fields.Team, { optional: true }) },
})
const orgOfViewer = Expr.path(
  Expr.viewer(Member),
  Expr.path(Member.relations.team, Team.fields.orgId),
)
const sizeOfViewer = Expr.path(
  Expr.viewer(Member),
  Expr.path(Member.relations.team, Team.fields.size),
)

Query.from(Note).pipe(Query.where(Expr.eq(Note.fields.orgId, orgOfViewer)))
Query.from(Note).pipe(Query.where(Expr.isNull(orgOfViewer)))

// @ts-expect-error a team's size is a number, an org's id text
Expr.eq(Note.fields.orgId, sizeOfViewer)
