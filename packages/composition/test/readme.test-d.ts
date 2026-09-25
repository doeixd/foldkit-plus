// The README's snippets, compiled. Keep the two in step.
import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { expectTypeOf } from 'vitest'
import {
  Block,
  Catalog,
  Composition,
  Content,
  Region,
  type Document,
  type PropsOf,
} from '../src/index.js'

const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String, level: Schema.Literals([1, 2, 3]) }),
  provides: [Content.Flow],
})

const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})

const Site = Catalog.make({ blocks: [Heading, Section], roots: [Content.Section] })

const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['intro'],
  nodes: {
    intro: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['title'] } },
    title: { block: 'Heading', props: { text: 'Hello', level: 1 }, regions: {} },
  },
})

Composition.validate(Site, page)
expectTypeOf(Composition.describe(Site, page)).toEqualTypeOf<string>()

const Page = Entity.define(
  'Page',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    document: Composition.Document,
  }),
)

const PublishPage = Entity.input(
  Page,
  Schema.Struct({
    title: Page.fields.title.schema,
    document: Composition.Document.check(Composition.valid(Site)),
  }),
)
expectTypeOf(PublishPage.schema.Type.document).toEqualTypeOf<Document>()
expectTypeOf<PropsOf<typeof Heading>['level']>().toEqualTypeOf<1 | 2 | 3>()
