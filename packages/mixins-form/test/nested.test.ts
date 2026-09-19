// @vitest-environment jsdom
/**
 * A form with nested keys, drawn and driven on the real Foldkit runtime: a row's
 * DOM events reach the nested form wrapped for the row, and the submit carries
 * the nested values.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Relation } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { FormView } from '../src/index.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Filled = Schema.String.check(Schema.isMinLength(1))
const Country = Entity.define('Country', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Blog = Entity.relate(
  { Country, Author, Comment, Post },
  {
    Author: { country: Relation.one(Country) },
    Post: { author: Relation.one(Author), comments: Relation.many(Comment) },
  },
)

const NewAuthor = Entity.input(
  Blog.Author,
  Schema.Struct({ name: Filled, countryId: Schema.String }),
  { countryId: Relation.input(Blog.Author.relations.country) },
)
const NewComment = Entity.input(Blog.Comment, Schema.Struct({ body: Filled }))
const CreateInput = Schema.Struct({
  title: Filled,
  author: NewAuthor.schema,
  comments: Schema.Array(NewComment.schema),
})
const Create = Form.make(
  'Create',
  Entity.input(Blog.Post, CreateInput, {
    author: Relation.nested(Blog.Post.relations.author, NewAuthor),
    comments: Relation.nested(Blog.Post.relations.comments, NewComment),
  }),
)

const Drawn = Create.bundle.pipe(
  Bundle.withView(FormView.submodel(Create, FormView.define(Create))),
)
const Slot = Bundle.declare(Drawn, 'create')
const Model = Schema.Struct({ ...Slot.fields, saved: Schema.Array(CreateInput) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases })
type Message = typeof Message.Type

const Page = Bundle.parent({ Model, Message })
const CreateForm = Page.at(Slot, {
  onOut: submitted => model => ({ model: { ...model, saved: [...model.saved, submitted.value] } }),
})
const placements = Page.assemble(CreateForm)

const element = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E
const type = (id: string, value: string) => {
  const input = element<HTMLInputElement>(id)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = (words: string): HTMLButtonElement =>
  Array.from(document.querySelectorAll('button')).find(
    found => found.textContent === words,
  ) as HTMLButtonElement

it('draws rows, adds and removes them, and submits what they hold', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'nested-runtime'
  document.body.appendChild(container)

  let latest: Model | undefined
  const update = placements.update()
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => placements.initial({ saved: [] }),
        update: (model: Model, message: Message) => {
          const next = update(model, message)
          latest = next.model
          return next
        },
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main(
            [],
            [
              CreateForm.view(model, h, {
                nestedOptions: { 'author.countryId': [{ value: 'c1', label: 'Chile' }] },
                addLabel: label => `Another of ${label}`,
              }),
            ],
          ),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  try {
    // The author must be there, so its row is, with no way out and no way to add another.
    await vi.waitFor(() => expect(element('Create-author-r0-name')).not.toBeNull())
    const group = element('Create-author')
    expect(group.tagName).toBe('FIELDSET')
    expect(group.querySelector('legend')?.textContent).toBe('author')
    expect(group.querySelectorAll('button')).toHaveLength(0)
    // A picker in a row is offered what its path names.
    expect(element('Create-author-r0-countryId').querySelectorAll('option')).toHaveLength(2)

    type('Create-title', 'Hello')
    type('Create-author-r0-name', 'Ada')
    const country = element<HTMLSelectElement>('Create-author-r0-countryId')
    country.value = 'c1'
    country.dispatchEvent(new Event('change', { bubbles: true }))

    // Rows of a many come and go; a button in a form must not submit it.
    const add = button('Another of comments')
    expect(add.type).toBe('button')
    add.click()
    await vi.waitFor(() => expect(element('Create-comments-r1-body')).not.toBeNull())
    add.click()
    await vi.waitFor(() => expect(element('Create-comments-r2-body')).not.toBeNull())
    button('Remove comments 1').click()
    await vi.waitFor(() => expect(element('Create-comments-r1-body')).toBeNull())

    // A failure inside a row shows in the row.
    element('Create-comments-r2-body').dispatchEvent(new Event('blur'))
    await vi.waitFor(() =>
      expect(element('Create-comments-r2-body-error')?.textContent).toBe('Required'),
    )
    type('Create-comments-r2-body', 'First')

    const submit = button('Submit')
    await vi.waitFor(() => expect(submit.disabled).toBe(false))
    document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => expect(latest?.saved).toHaveLength(1))
    expect(latest?.saved[0]).toEqual({
      title: 'Hello',
      author: { name: 'Ada', countryId: 'c1' },
      comments: [{ body: 'First' }],
    })
  } finally {
    handle.dispose()
  }
})
