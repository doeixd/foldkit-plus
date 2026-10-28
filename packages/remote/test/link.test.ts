/**
 * A list body over a link, judged by the client: the store keeps a link as its
 * ref key (`'User:ada'`), and the body reads the id it points at.
 * operations-phase3-DESIGN.
 */
import { Option, Schema } from 'effect'
import { Entity as DomainEntity, Expr, Order, Relation } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Query, entityKey, matching, writeEntity, emptyStore } from '../src/index.js'

const Fields = {
  User: DomainEntity.define('User', Schema.Struct({ id: Schema.String })),
  Note: DomainEntity.define('Note', Schema.Struct({ id: Schema.String, title: Schema.String })),
}
const { User, Note } = DomainEntity.relate(Fields, { Note: { owner: Relation.one(Fields.User) } })

const Mine = Query.define('Mine', {}, () =>
  Query.from(Note).pipe(
    Query.where(Expr.eq(Note.relations.owner, Expr.viewer(User))),
    Query.orderBy(Order.asc(Note.fields.id)),
  ),
)

const key = (id: string) => entityKey('Note', id)
const ada = { viewer: Option.some({ entity: 'User', id: 'ada' }), now: Option.none() }

describe('a body over a link, judged over the store', () => {
  it('reads the id the ref key names', () => {
    const store = [
      { id: 'n1', title: 'a', owner: 'User:ada' },
      { id: 'n2', title: 'b', owner: 'User:bo' },
    ].reduce((held, note) => writeEntity(held, key(note.id), note), emptyStore)
    expect(matching(store, Mine, {}, { context: ada })).toEqual({
      matched: [key('n1')],
      skipped: [],
    })
  })

  it('leaves a row whose link the store lacks unjudged', () => {
    const store = writeEntity(emptyStore, key('n1'), { id: 'n1', title: 'a' })
    expect(matching(store, Mine, {}, { context: ada })).toEqual({
      matched: [],
      skipped: [key('n1')],
    })
  })

  it('refuses a link held as no ref key, rather than compare it', () => {
    const store = writeEntity(emptyStore, key('n1'), { id: 'n1', title: 'a', owner: 'ada' })
    expect(() => matching(store, Mine, {}, { context: ada })).toThrow(
      'Note.owner holds "ada", which is no ref key ("Entity:id")',
    )
  })
})
