/**
 * An editor whose form sets only the discount of a quote judges the quote's
 * invariants over the row it loaded (#542, #543 part 3): it loads what they
 * read beside the form's keys, shows a failure as the key is typed, and the
 * form, `Data.can` and the check before sending agree.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import { Can, Mutation, Remote, RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { beforeEach, describe, expect, it } from 'vitest'
import { Crud } from '../src/index.js'

const Quote = Entity.define(
  'Quote',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'confirmed']),
    discountPct: Schema.Number,
    approvedBy: Schema.NullOr(Schema.String),
  }),
).pipe(
  Entity.invariant(
    'discountNeedsApproval',
    ({ after }) => Expr.or(Expr.lte(after.discountPct, 15), Expr.isNotNull(after.approvedBy)),
    { message: 'A discount over 15% needs an approval', path: ['discountPct'] },
  ),
  Entity.invariant(
    'confirmedPriceIsFixed',
    ({ before, after }) =>
      Expr.or(Expr.eq(before.status, 'draft'), Expr.eq(after.discountPct, before.discountPct)),
    { message: "A confirmed quote's price is fixed", path: ['discountPct'] },
  ),
  Entity.invariant(
    'largeDiscountStays',
    ({ before, after }) =>
      Expr.or(Expr.lte(before.discountPct, 15), Expr.gt(after.discountPct, 15)),
    { message: 'A large discount stays large', path: ['discountPct'] },
  ),
)
const EditInput = Entity.input(
  Quote,
  Schema.Struct({ id: Schema.String, discountPct: Schema.Number }),
)
const EditQuote = Mutation.write('EditQuote', Write.update(EditInput, { id: 'id' }))
const EditForm = Form.make('EditQuote', EditInput, { inputs: { id: Input.hidden() } })
const Editor = Crud.editor('QuoteEditor', { form: EditForm, mutation: EditQuote })
const Slot = Bundle.declare(Editor.bundle, 'editor')

const Model = Schema.Struct({ remote: Remote.Model, ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  ...Slot.cases,
  Opened: { id: Schema.String },
})
type Message = typeof Message.Type

const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Quote], mutations: [EditQuote] })
const QuoteEditor = Editor.at({ data: Data, model: App.model.editor })
const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const Placed = Page.at(Slot, QuoteEditor.placement)
const update = QuoteEditor.after(
  Page.assemble(Placed).update((model: Model, message: Message) =>
    message._tag === 'Opened'
      ? Placed.helpers.open(message.id)(model)
      : Remote.reduces(message)
        ? { model: Data.reduce(model, message) }
        : { model },
  ),
)

type Row = Readonly<Record<string, unknown>>
let held: Row = {}
/** The fields a Read rule withholds from this reader: answered without, and settled unavailable. */
let withheld: ReadonlySet<string> = new Set()
/** The fields each read asked for, and the writes sent. */
let asked: Array<ReadonlyArray<string>> = []
let sent: Array<unknown> = []
const Client = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.sync(() => ({
      settled: [],
      entities: batch.requests.map(request => {
        asked.push(request.fields)
        // A server answers what was asked, and nothing else.
        const values = Object.fromEntries(
          request.fields
            .filter(field => Object.hasOwn(held, field) && !withheld.has(field))
            .map(f => [f, held[f]]),
        )
        return { entity: 'Quote', id: request.id, values }
      }),
    })).pipe(
      Effect.map(answer => ({
        ...answer,
        settled: batch.requests.flatMap(request => {
          const fields = request.fields.filter(field => withheld.has(field))
          return fields.length === 0 ? [] : [{ entity: 'Quote', id: request.id, fields }]
        }),
      })),
    ),
  query: () => Effect.die('no queries'),
  mutate: request =>
    Effect.sync(() => {
      sent.push(request)
      // The server writes what was sent and answers with the row.
      held = { ...held, ...(request.input as Row) }
      return { output: {}, entities: [{ entity: 'Quote', id: String(held.id), values: held }] }
    }),
  live: () => Stream.empty,
})
beforeEach(() => {
  asked = []
  sent = []
  withheld = new Set()
})

const initial: Model = { remote: Remote.initial, editor: Editor.bundle.init().model }
const form = (model: Model, message: typeof EditForm.Message.Type) =>
  update(model, Message.GotEditorMessage({ message }))
/** Opens q1 over `row` and fills the form with what the server sends. */
const opened = async (row: Row): Promise<Model> => {
  held = row
  const open = update(initial, Message.Opened({ id: 'q1' })).model
  const projection = Option.getOrThrow(QuoteEditor.active.projectionOf(open))
  const loaded = await Effect.runPromise(
    Data.prefetch(open, projection).pipe(Effect.provide(Client)),
  )
  return QuoteEditor.sync(loaded).model
}
const typed = (model: Model, value: string) =>
  form(model, EditForm.Message.Changed({ key: 'discountPct', value })).model
const discount = (model: Model) => EditForm.field(model.editor.form, 'discountPct')

/** What the check before sending says of `input`: the write it refuses, run, sends nothing. */
const presend = async (
  model: Model,
  input: { readonly id: string; readonly discountPct: number },
) => {
  const started = Data.mutate(model, EditQuote, input)
  const answer = await Effect.runPromise(started.command.effect.pipe(Effect.provide(Client)))
  return { answer, sent: sent.length }
}

const draft = { id: 'q1', status: 'draft', discountPct: 10, approvedBy: null }
const confirmed = { ...draft, status: 'confirmed' }

/** Submits, and runs the save it starts. */
const saved = async (model: Model): Promise<Model> => {
  const submitted = form(model, EditForm.Message.Submitted())
  let next = submitted.model
  for (const command of submitted.commands ?? [])
    next = update(next, await Effect.runPromise(command.effect.pipe(Effect.provide(Client)))).model
  return QuoteEditor.sync(next).model
}

describe('An editor over a quote the form sets only the discount of', () => {
  it('loads what the invariants read beside the discount', async () => {
    await opened(draft)
    expect(asked).toEqual([expect.arrayContaining(['approvedBy', 'status', 'discountPct'])])
  })

  it('shows a discount needing an approval as it is typed, and sends nothing', async () => {
    const model = typed(await opened(draft), '20')
    expect(discount(model)).toMatchObject({
      _tag: 'Invalid',
      errors: ['A discount over 15% needs an approval'],
    })
    const submitted = form(model, EditForm.Message.Submitted())
    expect(submitted.commands ?? []).toEqual([])
    expect(QuoteEditor.status(submitted.model)).toBe('Editing')
  })

  it("shows a confirmed quote's fixed price on an edit of the discount", async () => {
    expect(discount(typed(await opened(confirmed), '12'))).toMatchObject({
      _tag: 'Invalid',
      errors: ["A confirmed quote's price is fixed"],
    })
  })

  it('judges over the row its own save left', async () => {
    const after = await saved(typed(await opened({ ...draft, approvedBy: 'ada' }), '20'))
    expect(sent).toHaveLength(1)
    expect(QuoteEditor.status(after)).toBe('Saved')
    expect(discount(typed(after, '12'))).toMatchObject({
      _tag: 'Invalid',
      errors: ['A large discount stays large'],
    })
  })

  it('gives one answer from the form, Data.can and the check before sending', async () => {
    const cases = [
      { row: draft, typed: '20', rule: 'discountNeedsApproval' },
      { row: confirmed, typed: '12', rule: 'confirmedPriceIsFixed' },
      { row: { ...draft, approvedBy: 'ada' }, typed: '20', rule: undefined },
    ] as const
    for (const each of cases) {
      sent = []
      const model = await opened(each.row)
      const input = { id: 'q1', discountPct: Number(each.typed) }
      const byForm = discount(typed(model, each.typed))._tag === 'Invalid'
      const can = Can.match(Data.can(model, EditQuote, input), {
        Yes: () => undefined,
        Undecided: () => undefined,
        No: ({ refusal }) => (refusal._tag === 'Invalid' ? refusal.rule : refusal._tag),
      })
      const before = await presend(model, input)
      expect({ byForm, can, sent: before.sent }).toEqual({
        byForm: each.rule !== undefined,
        can: each.rule,
        sent: each.rule === undefined ? 1 : 0,
      })
      if (each.rule !== undefined)
        expect(before.answer).toMatchObject({
          _tag: 'MutationFailed',
          error: { refusal: { _tag: 'Invalid', rule: each.rule } },
        })
    }
  })
})

describe('An editor for a reader a Read rule withholds a member an invariant reads from', () => {
  it('fills the form, judges what it was sent, and leaves the withheld rule undecided', async () => {
    withheld = new Set(['approvedBy'])
    const model = typed(await opened(draft), '20')
    expect(EditForm.field(model.editor.form, 'id')).toMatchObject({ value: 'q1' })
    // Over a missing approval the rule is undecided: the server judges it.
    expect(discount(model)._tag).toBe('Valid')
    expect(form(model, EditForm.Message.Submitted()).commands).toHaveLength(1)
    // The members it was sent are still judged.
    expect(discount(typed(await opened(confirmed), '12'))).toMatchObject({
      _tag: 'Invalid',
      errors: ["A confirmed quote's price is fixed"],
    })
  })

  it('sets the form over a judged member that arrives after it was filled', async () => {
    held = draft
    const open = update(initial, Message.Opened({ id: 'q1' })).model
    // The row the form fills from is already held, from a list say.
    const listed = await Effect.runPromise(
      Data.prefetch(open, Data.get(Editor.selection, 'q1')).pipe(Effect.provide(Client)),
    )
    const filled = QuoteEditor.sync(listed).model
    expect(discount(typed(filled, '20'))._tag).toBe('Valid')
    const projection = Option.getOrThrow(QuoteEditor.active.projectionOf(filled))
    const arrived = await Effect.runPromise(
      Data.prefetch(filled, projection).pipe(Effect.provide(Client)),
    )
    const judged = QuoteEditor.sync(arrived).model
    expect(discount(typed(judged, '20'))).toMatchObject({
      _tag: 'Invalid',
      errors: ['A discount over 15% needs an approval'],
    })
    // Once over every member it was sent, a sync with nothing new changes nothing.
    expect(QuoteEditor.sync(judged).model).toBe(judged)
  })
})
