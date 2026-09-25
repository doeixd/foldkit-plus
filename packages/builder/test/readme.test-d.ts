// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Composition, type Document } from 'foldkit-composition'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { expectTypeOf } from 'vitest'
import { Builder, type Model } from '../src/index.js'
import { Site, SiteRenderer } from './fixture.js'

const Page = Entity.define(
  'Page',
  Schema.Struct({ id: Schema.String, title: Schema.String, document: Composition.Document }),
)
const PageInput = Entity.input(
  Page,
  Schema.Struct({
    title: Page.fields.title.schema,
    document: Composition.Document.check(Composition.valid(Site)),
  }),
)

const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  starters: { Section: {}, Heading: { text: 'New heading' } },
})

const PageForm = Form.make('PageForm', PageInput, {
  inputs: { document: PageBuilder.input },
})

expectTypeOf(PageForm.control('document').field(PageForm.initial).value).toEqualTypeOf<Model>()
expectTypeOf(
  PageForm.control('document').field(PageForm.initial).value.document,
).toEqualTypeOf<Document>()

Builder.make('Wrong', {
  catalog: Site,
  renderer: SiteRenderer,
  // @ts-expect-error: a Heading's starting props need its text
  starters: { Heading: {} },
})
