// @vitest-environment node
/**
 * The README's notes model, run: the sixty-second example's bindings, a write
 * whose View is behind, and the fixture that seeds and drains it.
 */
import * as Domain from '@alchemy.run/domain'
import { Effect, Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Mutation, REMOTE_PROTOCOL_VERSION, RemoteClient } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { DomainReads, DomainRemote } from '../src/index.js'
import { Fixture } from '../src/testing.js'

class Renamed extends Domain.Event('Renamed', { name: Schema.String, revision: Schema.Int }) {}

class Rename extends Domain.Command('Rename', {
  target: Schema.String,
  input: { name: Schema.String },
  events: [Renamed],
}) {}

class Note extends Domain.Aggregate('Note', {
  id: Schema.String,
  state: Schema.Struct({ name: Schema.String, revision: Schema.Int }),
  initial: { name: '', revision: 0 },
  commands: [Rename],
  decide: {
    Rename: (state, command) => [new Renamed({ name: command.name, revision: state.revision + 1 })],
  },
  evolve: { Renamed: (_, event) => ({ name: event.name, revision: event.revision }) },
}) {}

class NoteRow extends Domain.View('NoteRow', {
  from: [Note],
  key: Note,
  state: Schema.Struct({ name: Schema.String, revision: Schema.Int }),
  initial: { name: '', revision: 0 },
  evolve: { Renamed: (_, event) => ({ name: event.name, revision: event.revision }) },
}) {}

class Notes extends Domain.Model('Notes', { aggregates: [Note], views: [NoteRow] }) {}

class NotesApi extends Domain.Api('NotesApi', {
  model: Notes,
  commands: ['Rename'],
  views: ['NoteRow'],
}) {}

const NoteEntity = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, name: Schema.String, revision: Schema.Number }),
)

const RenameNote = Mutation.make('RenameNote', {
  Input: { id: Schema.String, name: Schema.String },
  Output: {},
})

const NoteReads = DomainRemote.view(NoteEntity, NotesApi, 'NoteRow', { revision: 'revision' })

const RenameBinding = DomainRemote.command(RenameNote, NotesApi, 'Rename', {
  entity: NoteEntity,
  target: input => input.id,
  input: input => ({ name: input.name }),
  written: (_reply, input) => ({ name: input.name }),
})

const shop = () =>
  Fixture.make(NotesApi, {
    model: Notes,
    given: [{ aggregate: 'Note', id: 'n1', events: [new Renamed({ name: 'Draft', revision: 1 })] }],
    bindings: {
      views: [NoteReads],
      commands: [RenameBinding],
      denied: () => 'Unauthenticated',
      confirmWithin: '100 millis',
    },
  })

const readN1 = Effect.flatMap(RemoteClient, client =>
  client.read({
    version: REMOTE_PROTOCOL_VERSION,
    requests: [{ entity: 'Note', id: 'n1', fields: ['name', 'revision'] }],
  }),
)

describe('the README notes model', () => {
  it('reads the seeded row once the View has drained', async () => {
    const hosted = shop()
    const answer = await Effect.runPromise(
      Effect.gen(function* () {
        yield* hosted.drain
        return yield* readN1
      }).pipe(Effect.scoped, Effect.provide(hosted.layer)),
    )
    expect(answer.entities).toEqual([
      { entity: 'Note', id: 'n1', values: { name: 'Draft', revision: 1 } },
    ])
  })

  it('answers a write with the reply’s fields while the View is behind, and confirms after', async () => {
    const hosted = shop()
    const seen = await Effect.runPromise(
      Effect.gen(function* () {
        yield* hosted.drain
        const client = yield* RemoteClient
        const written = yield* client.mutate({
          requestId: 'r1',
          operation: 'op1',
          mutation: 'RenameNote',
          input: { id: 'n1', name: 'Final' },
          principal: null,
        })
        const reads = yield* DomainReads
        const pending = yield* reads.pending
        const behind = yield* Effect.flip(readN1)
        yield* hosted.drain
        const confirmed = yield* reads.confirm(NoteEntity, 'n1')
        return { written, pending, behind, confirmed, after: yield* readN1 }
      }).pipe(Effect.scoped, Effect.provide(hosted.layer)),
    )
    expect(seen.written.entities).toEqual([{ entity: 'Note', id: 'n1', values: { name: 'Final' } }])
    expect(seen.pending.map(read => read.operation)).toEqual(['op1'])
    expect(seen.behind._tag).toBe('Unreachable')
    expect(seen.confirmed).toBe(true)
    expect(seen.after.entities[0]?.values).toEqual({ name: 'Final', revision: 2 })
  })

  it('sends a principal-less write for the principal the layer was given', async () => {
    const hosted = shop()
    const refused = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        return yield* Effect.flip(
          client.mutate({
            requestId: 'r1',
            operation: 'op1',
            mutation: 'RenameNote',
            input: { id: 'n1', name: 'Final' },
            principal: 'grace',
          }),
        )
      }).pipe(Effect.scoped, Effect.provide(hosted.layer)),
    )
    expect(Option.some(refused._tag)).toEqual(Option.some('Unauthenticated'))
  })
})
