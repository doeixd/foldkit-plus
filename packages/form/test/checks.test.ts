import { Effect, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { beforeEach, describe, expect, it } from 'vitest'
import { Form } from '../src/index.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    slug: Schema.String.check(Schema.isMinLength(3)),
    rank: Schema.Number,
  }),
)
const PostInput = Schema.Struct({
  id: Schema.String,
  slug: Post.fields.slug.schema,
  rank: Schema.Number,
})

// What the outside world knows, and what it was asked.
const taken = new Map([['hello', 'p1']])
const asked: Array<{
  readonly slug: string
  readonly values: object
  readonly subject: object
}> = []

const PostForm = Form.make('PostForm', Entity.input(Post, PostInput), {
  debounce: 0,
  checks: {
    // Taken by another post; the one being edited keeps its own slug.
    // The row being edited keeps its own slug, whether it says which row it is in
    // its values or in its subject.
    slug: (slug, { values, subject }) =>
      Effect.sync(() => {
        asked.push({ slug, values, subject })
        const owner = taken.get(slug)
        return owner !== undefined && owner !== values.id && owner !== subject.id
          ? `"${slug}" is taken`
          : undefined
      }),
    rank: rank => Effect.succeed(rank > 100 ? 'Too high' : undefined),
  },
})

type Model = typeof PostForm.initial
type Message = typeof PostForm.Message.Type
const { Message } = PostForm

/** One Message through `update`, with the Commands it returns left unrun. */
const step = (model: Model, message: Message) => PostForm.bundle.update(model, message, undefined)
/** What the runtime does: run the Commands and feed their Messages back. */
const settle = async (
  model: Model,
  message: Message,
): Promise<{ readonly model: Model; readonly out: unknown }> => {
  const next = step(model, message)
  let current = { model: next.model, out: next.outMessage as unknown }
  for (const command of next.commands ?? []) {
    const answered = await settle(current.model, await Effect.runPromise(command.effect))
    current = { model: answered.model, out: answered.out ?? current.out }
  }
  return current
}
const change = (key: 'id' | 'slug' | 'rank', value: string) => Message.Changed({ key, value })

beforeEach(() => {
  asked.length = 0
})

describe('Form checks', () => {
  it('asks once the schema passes, and reads Validating until it is answered', () => {
    const typing = step(PostForm.initial, change('slug', 'hi'))
    // Too short for the schema: nothing is asked.
    expect(typing.model.fields.slug._tag).toBe('Invalid')
    expect(typing.commands ?? []).toEqual([])

    const asking = step(PostForm.initial, change('slug', 'fresh'))
    expect(asking.model.fields.slug).toEqual({ _tag: 'Validating', value: 'fresh' })
    expect(asking.commands?.map(command => command.name)).toEqual(['PostForm.check'])
  })

  it('takes the answer: valid, or invalid in the words of the check', async () => {
    expect((await settle(PostForm.initial, change('slug', 'fresh'))).model.fields.slug).toEqual({
      _tag: 'Valid',
      value: 'fresh',
    })
    expect((await settle(PostForm.initial, change('slug', 'hello'))).model.fields.slug).toEqual({
      _tag: 'Invalid',
      value: 'hello',
      errors: ['"hello" is taken'],
    })
  })

  it('gives the check the decoded value, and whatever else in the form decodes', async () => {
    const withId = (await settle(PostForm.initial, change('id', 'p1'))).model
    // p1 keeps its own slug: the check sees the id beside it.
    expect((await settle(withId, change('slug', 'hello'))).model.fields.slug._tag).toBe('Valid')
    expect(asked.at(-1)).toEqual({
      slug: 'hello',
      values: { id: 'p1', slug: 'hello' },
      // Nothing told this form which row it is about; the id came from the values.
      subject: {},
    })

    // A number arrives parsed, not as the text that was typed.
    expect((await settle(PostForm.initial, change('rank', '250'))).model.fields.rank).toEqual({
      _tag: 'Invalid',
      value: '250',
      errors: ['Too high'],
    })
  })

  it('drops an answer for a draft the key no longer holds', async () => {
    const first = step(PostForm.initial, change('slug', 'hello'))
    const second = step(first.model, change('slug', 'hello-world'))
    // The answer to "hello" arrives late.
    const late = await Effect.runPromise(first.commands![0]!.effect)
    const after = step(second.model, late)

    expect(after.model.fields.slug).toEqual({ _tag: 'Validating', value: 'hello-world' })
  })

  it('makes a submit wait for a running check, and sends it when the check passes', async () => {
    const ready = (
      await settle((await settle(PostForm.initial, change('id', 'p9'))).model, change('rank', '5'))
    ).model
    const asking = step(ready, change('slug', 'fresh'))
    const submitted = step(asking.model, Message.Submitted())

    expect(submitted.outMessage).toBeUndefined()
    expect(submitted.model.submitPending).toBe(true)
    expect(PostForm.canSubmit(asking.model)).toBe(true)

    const answer = await Effect.runPromise(asking.commands![0]!.effect)
    const sent = step(submitted.model, answer)
    expect(sent.outMessage).toEqual({
      _tag: 'Submitted',
      value: { id: 'p9', slug: 'fresh', rank: 5 },
    })
    expect(sent.model.submitPending).toBe(false)
  })

  it('sends nothing when the check a submit waited for fails', async () => {
    const ready = (
      await settle((await settle(PostForm.initial, change('id', 'p9'))).model, change('rank', '5'))
    ).model
    const asking = step(ready, change('slug', 'hello'))
    const submitted = step(asking.model, Message.Submitted())
    const failed = step(submitted.model, await Effect.runPromise(asking.commands![0]!.effect))

    expect(failed.outMessage).toBeUndefined()
    expect(failed.model.submitPending).toBe(false)
    expect(failed.model.fields.slug._tag).toBe('Invalid')
    expect(PostForm.canSubmit(failed.model)).toBe(false)
  })

  it('checks a filled form on submit, since filling validates nothing', async () => {
    const filled = PostForm.fill(PostForm.initial, { id: 'p1', slug: 'hello', rank: 3 }).model
    expect(filled.fields.slug._tag).toBe('NotValidated')

    const sent = await settle(filled, Message.Submitted())
    expect(sent.out).toEqual({ _tag: 'Submitted', value: { id: 'p1', slug: 'hello', rank: 3 } })
    expect(asked.map(entry => entry.slug)).toEqual(['hello'])
  })

  it('lets an edit cancel a submit that was waiting', async () => {
    const ready = (
      await settle((await settle(PostForm.initial, change('id', 'p9'))).model, change('rank', '5'))
    ).model
    const waiting = step(step(ready, change('slug', 'fresh')).model, Message.Submitted()).model
    expect(waiting.submitPending).toBe(true)

    const edited = await settle(waiting, change('slug', 'fresher'))
    expect(edited.model.submitPending).toBe(false)
    expect(edited.out).toBeUndefined()
  })

  it('does not ask again on blur for a draft already answered', async () => {
    const answered = (await settle(PostForm.initial, change('slug', 'fresh'))).model
    const blurred = step(answered, Message.Blurred({ key: 'slug' }))

    expect(blurred.commands ?? []).toEqual([])
    expect(blurred.model).toBe(answered)
  })
})

describe('a Model that was stored', () => {
  it('is shown again with nothing in flight: the check that was running will never answer', () => {
    // The Commands are left unrun: this is the Model as it is while the check runs.
    const asking = step(step(PostForm.initial, change('slug', 'fresh')).model, Message.Submitted())
    expect(asking.model.fields.slug._tag).toBe('Validating')
    expect(asking.model.submitPending).toBe(true)

    const settled = PostForm.settled(asking.model)
    expect(settled.fields.slug).toEqual({ _tag: 'NotValidated', value: 'fresh' })
    expect(settled.submitPending).toBe(false)
    // What was decided stays decided.
    expect(settled.fields.rank).toEqual(asking.model.fields.rank)
  })
})

describe('what the form is editing', () => {
  it('starts about nothing, which is what creating something means', () => {
    expect(PostForm.subject(PostForm.initial)).toEqual({})
  })

  it('gives the check the subject, so a row passes over its own value', async () => {
    // 'hello' belongs to p1. Told it is editing p1, the check lets it stand.
    const own = step(PostForm.initial, Message.About({ subject: { id: 'p1' } })).model
    expect(PostForm.subject(own)).toEqual({ id: 'p1' })
    expect((await settle(own, change('slug', 'hello'))).model.fields.slug._tag).toBe('Valid')
    expect(asked.at(-1)?.subject).toEqual({ id: 'p1' })

    // Told it is editing another row, the same value is taken.
    const other = step(PostForm.initial, Message.About({ subject: { id: 'p2' } })).model
    expect((await settle(other, change('slug', 'hello'))).model.fields.slug._tag).toBe('Invalid')
  })

  it('is not a draft: it changes no field and answers no submit', () => {
    const typed = step(PostForm.initial, change('rank', '5')).model
    const told = step(typed, Message.About({ subject: { id: 'p1' } }))
    expect(told.commands ?? []).toEqual([])
    expect(told.model.fields).toEqual(typed.fields)
    expect(told.model.submitPending).toBe(typed.submitPending)
  })

  it('survives being filled and reset: which row it is stays that row', () => {
    const told = step(PostForm.initial, Message.About({ subject: { id: 'p1' } })).model
    expect(PostForm.subject(PostForm.fill(told, { slug: 'anything' }).model)).toEqual({ id: 'p1' })
    expect(PostForm.subject(step(told, Message.Reset()).model)).toEqual({ id: 'p1' })
  })
})
