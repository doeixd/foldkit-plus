/**
 * The editor as a form control (§139): a key whose draft is the editor's Model with the
 * document inside, whose value is that document, and which a blank document leaves empty.
 */
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import * as RichText from 'foldkit-richtext'
import { describe, expect, it } from 'vitest'
import { Message } from '../src/editor.js'
import { richTextInput } from '../src/input.js'

const Post = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, body: RichText.Document }),
)
const PostInput = Entity.input(
  Post,
  Schema.Struct({ title: Post.fields.title.schema, body: Post.fields.body.schema }),
)
const PostForm = Form.make('PostForm', PostInput, {
  inputs: { body: richTextInput('post-body', { placeholder: 'Write the post…' }) },
})
const body = PostForm.control('body')
type Model = typeof PostForm.initial
const step = (model: Model, message: Message): Model =>
  PostForm.bundle.update(model, body.send(message), undefined).model

const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: RichText.NodeId.make(node), offset, affinity: 'after' },
  focus: { node: RichText.NodeId.make(node), offset, affinity: 'after' },
})
const text = (document: RichText.Document | undefined) =>
  document?.children.map(block => block.children.map(run => run.text).join('')).join('\n')

describe('the editor as a form control', () => {
  it('starts on a blank paragraph, which is nothing entered', () => {
    expect(text(body.field(PostForm.initial).value.document)).toBe('')
    expect(PostForm.partial(PostForm.initial).body).toBeUndefined()
    const submitted = PostForm.bundle.update(
      PostForm.initial,
      PostForm.Message.Submitted(),
      undefined,
    ).model
    expect(body.field(submitted)).toMatchObject({ _tag: 'Invalid', errors: ['Required'] })
  })

  it.each<[string, Message]>([
    ['the patch Command’s completion', Message.Patched()],
    ['the same caret, reported again', Message.Selected({ selection: caret('blank-t', 0) })],
  ])('keeps the form’s Model for %s', (_, message) => {
    const placed = step(PostForm.initial, Message.Selected({ selection: caret('blank-t', 0) }))
    expect(step(placed, message)).toBe(placed)
  })

  it('keeps what is typed in its own Model, as the key’s value', () => {
    const placed = step(PostForm.initial, Message.Selected({ selection: caret('blank-t', 0) }))
    const typed = step(placed, Message.Typed({ text: 'Hello' }))
    expect(text(PostForm.partial(typed).body)).toBe('Hello')
    expect(PostForm.authoredChanged(placed, typed)).toBe(true)
    // Undo is the editor's own, and comes back as a document too.
    expect(text(PostForm.partial(step(typed, Message.Undone())).body)).toBeUndefined()
  })

  it('shows a given document with a history of its own', () => {
    const typed = step(
      step(PostForm.initial, Message.Selected({ selection: caret('blank-t', 0) })),
      Message.Typed({ text: 'draft' }),
    )
    const stored = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 's',
          children: [{ type: 'Text', id: 's-t', text: 'Stored', marks: [] }],
        },
      ],
    })
    const filled = PostForm.fill(
      {
        ...typed,
        fields: {
          ...typed.fields,
          body: { ...typed.fields.body, value: { ...typed.fields.body.value, hostId: 'old-body' } },
        },
      },
      { body: stored },
    ).model
    expect(body.field(filled).value.hostId).toBe('post-body')
    expect(text(PostForm.partial(filled).body)).toBe('Stored')
    expect(RichText.inspectHistory(body.field(filled).value.history).past).toBe(0)
    // The caret was in the draft's runs, which the given document does not have.
    expect(body.field(filled).value.selection).toBeNull()
  })

  it('settles only the slash menu’s highlight, keeping caret and history for a resumed draft', () => {
    const placed = step(PostForm.initial, Message.Selected({ selection: caret('blank-t', 0) }))
    const typed = step(placed, Message.Typed({ text: 'x' }))
    const highlighted: Model = {
      ...typed,
      fields: {
        ...typed.fields,
        body: {
          ...typed.fields.body,
          // Stored under a host id the application has since renamed.
          value: { ...typed.fields.body.value, menuIndex: 2, hostId: 'old-body' },
        },
      },
    }
    const settled = body.field(PostForm.settled(highlighted)).value
    expect(settled.menuIndex).toBe(0)
    expect(settled.hostId).toBe('post-body')
    expect(settled.selection).toEqual(body.field(typed).value.selection)
    expect(RichText.inspectHistory(settled.history).past).toBe(1)
  })
})
