/**
 * The form's list of fields to fix: drawn after a submit while any field is
 * invalid, in a form of more than one control, a link to each one's control in
 * the order the fields are drawn, in the form's words. It is the alert for
 * those failures, so the errors beside the fields say nothing of their own.
 */
import { Schema } from 'effect'
import { Entity, Relation } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { FormView, type FormViewWords } from '../src/index.js'
import { Edit, options } from './fixture.js'

type Model = typeof Edit.initial
const send = (...messages: ReadonlyArray<typeof Edit.Message.Type>): Model =>
  messages.reduce((model, message) => Edit.bundle.update(model, message, undefined).model, {
    ...Edit.initial,
  })
const draw = (model: Model, words?: FormViewWords): Html =>
  FormView.define(Edit)(
    { model, errors: [], canSubmit: false, options, words },
    SlotView.inertBuilder(),
  )
/** The summary: what holds the only list a form draws. */
const summary = (root: Html) =>
  Inert.all(root).find(node => Inert.children(node).some(child => child.sel === 'ul'))
const links = (root: Html) =>
  Inert.byTag(summary(root), 'a').map(link => [Inert.value(link, 'href'), Inert.text(link)])

describe('the fields to fix', () => {
  it('is not drawn while no field is invalid', () => {
    expect(summary(draw(Edit.initial))).toBeUndefined()
  })

  it('is not drawn before a submit, while each field says its own failure', () => {
    // A page that checks every key without submitting owns its own submit.
    const root = draw(send(Edit.Message.ValidatedAll()))
    expect(summary(root)).toBeUndefined()
    expect(Inert.byRole(root, 'alert').map(Inert.text)).toEqual(['Required', 'Required'])
  })

  it('is the one alert after a submit, so the fields beside it say nothing more', () => {
    const root = draw(send(Edit.Message.Submitted()))
    expect(Inert.byRole(root, 'alert')).toEqual([summary(root)])
  })

  it('is not drawn for a form of one control, whose error is the summary', () => {
    const Name = Form.make(
      'Name',
      Form.input(Schema.Struct({ name: Schema.String.check(Schema.isMinLength(1)) })),
    )
    const model = Name.bundle.update(Name.initial, Name.Message.Submitted(), undefined).model
    const root = FormView.define(Name)(
      { model, errors: [], canSubmit: false },
      SlotView.inertBuilder(),
    )
    expect(summary(root)).toBeUndefined()
    expect(Inert.byRole(root, 'alert').map(Inert.text)).toEqual(['Required'])
  })

  it('links each invalid field, in the order drawn, and no valid one', () => {
    const model = send(
      Edit.Message.Changed({ key: 'rating', value: 'four' }),
      Edit.Message.Submitted(),
    )
    expect(links(draw(model))).toEqual([
      ['#Edit-title', 'Title: Required'],
      ['#Edit-status', 'status: Required'],
      ['#Edit-rating', 'rating: Enter a number'],
    ])
    expect(Inert.text(summary(draw(model)))).toMatch(/^Check these fields:/)
  })

  it('follows each field as it is fixed', () => {
    const submitted = send(Edit.Message.Submitted())
    expect(links(draw(submitted)).map(([href]) => href)).toEqual(['#Edit-title', '#Edit-status'])
    const model = [
      Edit.Message.Changed({ key: 'title', value: 'Hello' }),
      Edit.Message.Changed({ key: 'status', value: 'live' }),
    ].reduce((at, message) => Edit.bundle.update(at, message, undefined).model, submitted)
    expect(links(draw(model)).map(([href]) => href)).toEqual([])
  })

  it('says it in the form’s words', () => {
    const model = send(Edit.Message.Submitted())
    const root = draw(model, { summary: 'Fix:', issue: '{error} ({label})' })
    expect(Inert.text(summary(root))).toMatch(/^Fix:/)
    expect(links(root)[0]).toEqual(['#Edit-title', 'Required (Title)'])
  })

  it('sends the form’s own Message, which changes nothing', () => {
    const model = send(Edit.Message.Validated({ key: 'title' }))
    expect(
      Edit.bundle.update(model, Edit.Message.FollowedIssue({ id: 'Edit-title' }), undefined).model,
    ).toBe(model)
  })

  it('links a field in a row of a nested key by its own id', () => {
    const Author = Entity.define(
      'Author',
      Schema.Struct({ id: Schema.String, name: Schema.String }),
    )
    const Book = Entity.define('Book', Schema.Struct({ id: Schema.String, title: Schema.String }))
    const Library = Entity.relate({ Author, Book }, { Book: { author: Relation.one(Author) } })
    const NewAuthor = Entity.input(
      Library.Author,
      Schema.Struct({ name: Schema.String.check(Schema.isMinLength(1)) }),
    )
    const BookForm = Form.make(
      'Book',
      Entity.input(
        Library.Book,
        Schema.Struct({ title: Schema.String, author: NewAuthor.schema }),
        {
          author: Relation.nested(Library.Book.relations.author, NewAuthor),
        },
      ),
    )
    const model = BookForm.bundle.update(
      BookForm.initial,
      BookForm.Message.Submitted(),
      undefined,
    ).model
    const root = FormView.define(BookForm)(
      { model, errors: [], canSubmit: false },
      SlotView.inertBuilder(),
    )
    const [row] = BookForm.rows(model, 'author')
    expect(Inert.byTag(summary(root), 'a').map(link => Inert.value(link, 'href'))).toEqual([
      `#Book-author-${row!.id}-name`,
    ])
  })
})

it('draws every element of the summary in a Slot', () => {
  const tree = Inert.draw(FormView.define(Edit), {
    model: send(Edit.Message.Submitted()),
    errors: [],
    canSubmit: false,
    options,
  })
  expect(summary(tree)?.sel).toBe('div')
  expect(Inert.unslotted(summary(tree))).toEqual([])
})
