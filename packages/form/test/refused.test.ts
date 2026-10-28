/**
 * A refusal from outside lands on its key only while the key holds the value
 * refused, and stops showing on the next edit of any key.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Form } from '../src/index.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, body: Schema.String }),
)
const PostForm = Form.make(
  'PostForm',
  Entity.input(
    Post,
    Schema.Struct({ title: Post.fields.title.schema, body: Post.fields.body.schema }),
  ),
)
type Message = typeof PostForm.Message.Type

const run = (messages: ReadonlyArray<Message>) =>
  messages.reduce(
    (state: { readonly model: typeof PostForm.initial; readonly outMessage?: unknown }, message) =>
      PostForm.bundle.update(state.model, message, undefined),
    { model: PostForm.initial },
  )

const tooLong = 'Too long a title'
const refusal = PostForm.Message.Refused({ key: 'title', error: 'Too long', value: tooLong })
const sent = [
  PostForm.Message.Changed({ key: 'title', value: tooLong }),
  PostForm.Message.Changed({ key: 'body', value: 'Text' }),
  PostForm.Message.Submitted(),
]

describe('A refusal', () => {
  it('shows on its key while the key holds the value refused', () => {
    const { model } = run([...sent, refusal])
    expect(PostForm.field(model, 'title')).toEqual({
      _tag: 'Invalid',
      value: tooLong,
      errors: ['Too long'],
    })
  })

  it('is dropped when the key was changed while the save was on its way', () => {
    const { model } = run([
      ...sent,
      PostForm.Message.Changed({ key: 'title', value: 'Short' }),
      refusal,
    ])
    expect(PostForm.field(model, 'title')).toEqual({ _tag: 'Valid', value: 'Short' })
  })

  it('stops showing on an edit of another key, and does not stop the next submit', () => {
    const { model, outMessage } = run([
      ...sent,
      refusal,
      PostForm.Message.Changed({ key: 'body', value: 'More text' }),
    ])
    expect(PostForm.field(model, 'title')._tag).toBe('Valid')
    expect(outMessage).toBeUndefined()
    expect(
      PostForm.bundle.update(model, PostForm.Message.Submitted(), undefined).outMessage,
    ).toEqual({ _tag: 'Submitted', value: { title: tooLong, body: 'More text' } })
  })

  it('stops a submit until an edit, as the same value would be refused again', () => {
    const { model, outMessage } = run([...sent, refusal, PostForm.Message.Submitted()])
    expect(outMessage).toBeUndefined()
    expect(PostForm.canSubmit(model)).toBe(false)
    expect(PostForm.field(model, 'title')._tag).toBe('Invalid')
  })

  it('lands once: the same refusal again returns the Model it was given', () => {
    const { model } = run([...sent, refusal])
    expect(PostForm.bundle.update(model, refusal, undefined).model).toBe(model)
  })
})
