// The README's snippets, compiled. Keep the two in step.
import { Result, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { expectTypeOf } from 'vitest'
import {
  Block,
  Catalog,
  Composition,
  Content,
  History,
  NodeId,
  Region,
  type Applied,
  type Document,
  type Refusal,
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

// Editing: Operations
{
  const { Op, region } = Composition
  const result = Composition.apply(
    Site,
    page,
    Op.insert({
      id: NodeId.make('subtitle'),
      block: 'Heading',
      props: { text: 'Welcome', level: 2 },
      at: region(NodeId.make('intro'), 'body', 1),
    }),
  )
  expectTypeOf(result).toEqualTypeOf<Result.Result<Applied, Refusal>>()

  // Undo: History
  const before = page
  const op = Op.remove(NodeId.make('title'))
  const current = Result.isSuccess(result) ? result.success.document : page
  let history = History.empty()
  history = History.commit(history, before, History.groupFor(op))
  const back = History.undo(history, current)
  const forward = back && History.redo(back.history, back.document)
  expectTypeOf(forward).toEqualTypeOf<
    { readonly history: History; readonly document: Document } | undefined
  >()
}
