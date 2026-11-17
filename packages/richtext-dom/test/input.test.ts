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

/** A body stored as text, one paragraph a line: the smallest codec that is not the identity. */
const Note = Entity.define('Note', Schema.Struct({ id: Schema.String, body: Schema.String }))
const NoteInput = Entity.input(Note, Schema.Struct({ body: Note.fields.body.schema }))
const calls: Array<string> = []
const NoteForm = Form.make('NoteForm', NoteInput, {
  inputs: {
    body: richTextInput(
      'note-body',
      {},
      {
        codec: {
          value: document => {
            calls.push('value')
            return text(document) ?? ''
          },
          fill: stored => {
            calls.push('fill')
            return RichText.decodeDocument({
              version: 1,
              children: stored.split('\n').map((line, index) => ({
                type: 'Paragraph',
                id: `n${index}`,
                children: [{ type: 'Text', id: `n${index}-t`, text: line, marks: [] }],
              })),
            })
          },
        },
      },
    ),
  },
})
const noteBody = NoteForm.control('body')
const stored = RichText.decodeDocument({
  version: 1,
  children: [
    { type: 'Paragraph', id: 's', children: [{ type: 'Text', id: 's-t', text: 's', marks: [] }] },
  ],
})

describe('the editor as a form control with a codec', () => {
  it('shows a stored text as a document and reads it back as the same text', () => {
    const filled = NoteForm.fill(NoteForm.initial, { body: 'one\ntwo' }).model
    expect(text(noteBody.field(filled).value.document)).toBe('one\ntwo')
    expect(NoteForm.partial(filled).body).toBe('one\ntwo')
  })

  it('holds what is typed as the codec’s value', () => {
    const placed = NoteForm.bundle.update(
      NoteForm.initial,
      noteBody.send(Message.Selected({ selection: caret('blank-t', 0) })),
      undefined,
    ).model
    const typed = NoteForm.bundle.update(
      placed,
      noteBody.send(Message.Typed({ text: 'Hi' })),
      undefined,
    ).model
    expect(NoteForm.partial(typed).body).toBe('Hi')
  })

  it('never asks the codec about a blank document', () => {
    calls.length = 0
    expect(NoteForm.partial(NoteForm.initial).body).toBeUndefined()
    expect(calls).toEqual([])
    const submitted = NoteForm.bundle.update(
      NoteForm.initial,
      NoteForm.Message.Submitted(),
      undefined,
    ).model
    expect(noteBody.field(submitted)).toMatchObject({ _tag: 'Invalid', errors: ['Required'] })
    expect(calls).not.toContain('value')
  })

  it('reads a blank document as the codec’s blank value, which a required key accepts', () => {
    const Lenient = Form.make('Lenient', NoteInput, {
      inputs: {
        body: richTextInput(
          'lenient-body',
          {},
          { codec: { value: document => text(document) ?? '', fill: () => stored, blank: '' } },
        ),
      },
    })
    expect(Lenient.partial(Lenient.initial).body).toBe('')
    const submitted = Lenient.bundle.update(
      Lenient.initial,
      Lenient.Message.Submitted(),
      undefined,
    ).model
    expect(Lenient.control('body').field(submitted)).not.toMatchObject({ _tag: 'Invalid' })
  })

  it('starts a given text on a history and caret of its own', () => {
    const filled = NoteForm.fill(NoteForm.initial, { body: 'x' }).model
    expect(RichText.inspectHistory(noteBody.field(filled).value.history).past).toBe(0)
    expect(noteBody.field(filled).value.selection).toBeNull()
  })

  it('fails the form’s fill when the codec’s fill throws, naming nothing it hides', () => {
    const Strict = Form.make('Strict', NoteInput, {
      inputs: {
        body: richTextInput(
          'strict-body',
          {},
          {
            codec: {
              value: document => text(document) ?? '',
              fill: () => {
                throw new Error('not markdown')
              },
            },
          },
        ),
      },
    })
    expect(() => Strict.fill(Strict.initial, { body: 'x' })).toThrow('not markdown')
  })
})
