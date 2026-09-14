import { Effect, Schema } from 'effect'
import {
  Codec,
  actorId,
  cursor,
  documentId,
  makeJournal,
  opId,
  sequence,
  type Journal,
  type JournalOptions,
} from '../src/index.js'

interface Operation {
  readonly id: string
}
interface Snapshot {
  readonly ids: ReadonlyArray<string>
}
interface Principal {
  readonly actorId: string
}

const key = documentId('orders')
const principal: Principal = { actorId: 'owner' }

// The append input is the codec's encoded side, not `unknown`.
declare const journal: Journal<Operation, Snapshot, Principal, string>
journal.append(key, 'order:1', principal)
// @ts-expect-error a decoded Operation is not the encoded input
journal.append(key, { id: 'order:1' }, principal)

// `after` is a Cursor and `through` is a Sequence, so they cannot be swapped.
journal.read(key, cursor(0))
journal.compact(key, sequence(1))
// @ts-expect-error a Sequence is not a Cursor
journal.read(key, sequence(1))
// @ts-expect-error a Cursor is not a Sequence
journal.compact(key, cursor(1))
// @ts-expect-error a plain number is not a Cursor
journal.read(key, 0)

// The encoded type is inferred from a transforming codec.
const options: JournalOptions<Operation, Snapshot, Principal, string> = {
  file: ':memory:',
  operation: { encode: value => value.id, decode: value => ({ id: value }) },
  snapshot: { encode: value => value, decode: value => value as Snapshot },
  empty: () => ({ ids: [] }),
  reduce: (snapshot, operation) => ({ ids: [...snapshot.ids, operation.id] }),
  opId: value => opId(value.id),
  actorId: value => actorId(value.actorId),
}
void options

// A `Schema.Codec` is accepted directly, and the encoded side comes from the
// schema's own `Encoded` type rather than collapsing to `unknown`.
const OperationSchema = Schema.Struct({ id: Schema.String, amount: Schema.FiniteFromString })
const SnapshotSchema = Schema.Struct({ ids: Schema.Array(Schema.String) })

const schemaJournal = makeJournal({
  file: ':memory:',
  operation: OperationSchema,
  snapshot: SnapshotSchema,
  empty: () => ({ ids: [] }),
  reduce: (snapshot: typeof SnapshotSchema.Type) => snapshot,
  opId: (value: typeof OperationSchema.Type) => opId(value.id),
  actorId: (value: Principal) => actorId(value.actorId),
})
type SchemaJournal =
  typeof schemaJournal extends Effect.Effect<infer A, infer _E, infer _R> ? A : never
type SchemaEncoded =
  SchemaJournal extends Journal<infer _O, infer _S, infer _P, infer E> ? E : never

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
const encodedFromSchema: Equals<SchemaEncoded, { readonly id: string; readonly amount: string }> =
  true
void encodedFromSchema

declare const schemaBacked: SchemaJournal
schemaBacked.append(key, { id: 'order:1', amount: '5' }, principal)
// @ts-expect-error the decoded operation is not the schema's encoded input
schemaBacked.append(key, { id: 'order:1', amount: 5 }, principal)

// `Codec.fromSchema` is the same conversion, spelled out.
const fromSchema = Codec.fromSchema(OperationSchema)
const converted: Equals<
  ReturnType<typeof fromSchema.encode>,
  { readonly id: string; readonly amount: string }
> = true
void converted
