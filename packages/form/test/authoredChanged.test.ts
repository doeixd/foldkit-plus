/**
 * The transition-level content-change report (§45). A Message tag says intent;
 * only comparing the two Models says whether authored content moved.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Form } from '../src/index.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, body: Schema.String }),
)
const PostInput = Schema.Struct({
  id: Schema.String,
  title: Post.fields.title.schema,
  body: Post.fields.body.schema,
})

const PostForm = Form.make('PostForm', Entity.input(Post, PostInput))
type Model = ReturnType<typeof PostForm.bundle.init>['model']

const start = (): Model => PostForm.bundle.init(undefined).model
const edit = (model: Model, key: string, value: string): Model =>
  PostForm.bundle.update(model, PostForm.Message.Changed({ key: key as never, value }), undefined)
    .model

describe('authored content reporting', () => {
  it('reports a changed draft', () => {
    const before = start()
    const after = edit(before, 'title', 'Hello')
    expect(PostForm.authoredChanged(before, after)).toBe(true)
  })

  it('does not report validation state, a blur, or a repeated value', () => {
    const typed = edit(start(), 'title', 'Hello')
    expect(PostForm.authoredChanged(typed, edit(typed, 'title', 'Hello'))).toBe(false)
    const blurred = PostForm.bundle.update(
      typed,
      PostForm.Message.Blurred({ key: 'title' as never }),
      undefined,
    ).model
    expect(blurred.fields.title._tag).not.toBe('NotValidated')
    expect(PostForm.authoredChanged(typed, blurred)).toBe(false)
  })

  it('does not report a refusal or a search', () => {
    const typed = edit(start(), 'title', 'Hello')
    const refused = PostForm.bundle.update(
      typed,
      PostForm.Message.Refused({ key: 'title' as never, error: 'no' }),
      undefined,
    ).model
    expect(PostForm.authoredChanged(typed, refused)).toBe(false)
    const searched = PostForm.bundle.update(
      typed,
      PostForm.Message.Searched({ key: 'title' as never, text: 'hel' }),
      undefined,
    ).model
    expect(PostForm.authoredChanged(typed, searched)).toBe(false)
  })

  it('reports clearing and setting the same draft back', () => {
    const typed = edit(start(), 'body', 'text')
    const cleared = edit(typed, 'body', '')
    expect(PostForm.authoredChanged(typed, cleared)).toBe(true)
    expect(PostForm.authoredChanged(cleared, cleared)).toBe(false)
    expect(PostForm.authoredChanged(cleared, typed)).toBe(true)
  })
})
