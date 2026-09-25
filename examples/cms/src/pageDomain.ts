/**
 * A page, declared the way a post is: an Entity, a form, two mutations, and a
 * content type. The one difference is the `document` key, whose control is the
 * page Builder. The Entity stores any well-formed page; what a publish takes
 * must also fit the site's Catalog.
 */
import { Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Composition } from 'foldkit-composition'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import { PageBuilder, Site } from './site.js'

export const PageId = Schema.String.pipe(Schema.brand('PageId'))
export type PageId = typeof PageId.Type

export const Page = Entity.define(
  'Page',
  Schema.Struct({
    id: PageId,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
    slug: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Address' }),
    // Tolerant: a stored page always reads, whatever Blocks it names.
    document: Composition.Document.annotate({ title: 'Page' }),
    publishedAt: Schema.NullOr(Schema.String),
  }),
).pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))

/** What a publish takes: the page must fit the Catalog the site draws. */
export const PageInput = Schema.Struct({
  title: Page.fields.title.schema,
  slug: Page.fields.slug.schema,
  document: Composition.Document.check(Composition.valid(Site)),
})

export const PageForm = Form.make('PageForm', Entity.input(Page, PageInput), {
  inputs: { slug: Cms.slug('title', { prefix: '/' }), document: PageBuilder.input },
  debounce: 0,
})

export const CreatePage = Mutation.make('CreatePage', {
  Input: PageInput,
  Output: { id: PageId },
})
export const UpdatePage = Mutation.make('UpdatePage', {
  Input: { ...PageInput.fields, id: PageId },
  Output: {},
})

export const Pages = Cms.content('pages', {
  entity: Page,
  form: PageForm,
  publish: { create: CreatePage, update: UpdatePage },
  words: { one: 'Page', many: 'Pages' },
  preview: (value, id) => [{ entity: 'Page', id, values: value }],
})

/** The public site's reading of a page. */
export const PageView = Entity.select(Page, { title: true, slug: true, document: true })
