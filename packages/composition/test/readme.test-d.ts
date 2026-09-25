// The README's snippets, compiled. Keep the two in step.
import { Result, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import * as RichText from 'foldkit-richtext'
import { inertHtml, type Html } from 'foldkit/html'
import { Renderer } from 'foldkit-composition/foldkit'
import { RichTextBlock } from 'foldkit-composition/richtext'
import { expectTypeOf } from 'vitest'
import {
  Block,
  Catalog,
  Composition,
  Content,
  History,
  NodeId,
  Region,
  Url,
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

// Migrations and unknown Blocks
{
  const Embed = Block.define('Embed', {
    Props: Schema.Struct({ url: Schema.String, height: Schema.Number }),
    provides: [Content.Flow, Content.Media],
  })
  const stored = page
  const { document, applied, unused } = Composition.migrate(stored, [
    Composition.renameBlock('OldHeading', 'Heading'),
    Composition.renameProp('Heading', 'alignment', 'align'),
    Composition.promoteUnknown('LegacyVideo to Embed', 'LegacyVideo', Embed),
    Composition.migration('DangerToCritical', 'Callout', node =>
      node.props['tone'] === 'danger'
        ? { ...node, props: { ...node.props, tone: 'critical' } }
        : undefined,
    ),
  ])
  expectTypeOf(document).toEqualTypeOf<Document>()
  expectTypeOf(applied).toEqualTypeOf<
    ReadonlyArray<{ readonly name: string; readonly node: NodeId }>
  >()
  expectTypeOf(unused).toEqualTypeOf<ReadonlyArray<string>>()
}

// Drawing a page
{
  const SiteRenderer = Renderer.make(Site, {
    Heading: ({ props, h }) => h.h2([], [props.text]),
    Section: ({ props, regions, h }) =>
      h.section([h.DataAttribute('tone', props.tone)], [...regions.body]),
  })
  expectTypeOf(Renderer.render(SiteRenderer, page, inertHtml)).toEqualTypeOf<ReadonlyArray<Html>>()

  // URLs
  const Image = Block.define('Image', {
    Props: Schema.Struct({ src: Url, alt: Schema.String }),
    provides: [Content.Flow, Content.Media],
  })
  expectTypeOf<PropsOf<typeof Image>['src']>().toEqualTypeOf<Url>()

  // Rich text as a Block
  const ArticleKit = RichText.kit({ nodes: [RichText.block('Paragraph')], marks: [] })
  const Text = RichTextBlock.define('Text', { kit: ArticleKit, provides: [Content.Flow] })
  expectTypeOf<PropsOf<typeof Text>['body']>().toEqualTypeOf<RichText.Document>()
}
