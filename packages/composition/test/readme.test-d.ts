// The README's snippets, compiled. Keep the two in step.
import { Result, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import * as RichText from 'foldkit-richtext'
import { inertHtml, type Html } from 'foldkit/html'
import { Renderer } from 'foldkit-composition/foldkit'
import { RichTextBlock } from 'foldkit-composition/richtext'
import { Appearance } from 'foldkit-composition/appearance'
import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { expectTypeOf } from 'vitest'
import {
  Block,
  Catalog,
  Composition,
  Content,
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

{
  const HeroSlots = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
  const t = Theme.ref(Theme.tokens)
  const HeroLook = Appearance.make(HeroSlots, {
    recipe: Style.recipeFor(HeroSlots)({
      base: { root: Style.class('hero') },
      variants: { tone: { plain: {}, accent: { root: Style.class('accent') } } },
      defaults: { tone: 'plain' },
    }),
    tokens: { gap: Appearance.token(t.space, { slot: 'root', property: 'gap' }) },
  })
  const Hero = Block.define('Hero', {
    Props: Schema.Struct({ title: Schema.String }),
    provides: [Content.Section],
  }).pipe(Appearance.attach(HeroLook))
  const Looks = Catalog.make({ blocks: [Hero], roots: [Content.Section] })
  const LooksRenderer = Renderer.make(Looks, {
    Hero: ({ props, appearance, h }) => {
      const slots = HeroLook.draw({ appearance, h })
      return h.section(slots.root.attrs(), [props.title])
    },
  })
  const sheet: string = Style.stylesheet(...HeroLook.styles)
  void LooksRenderer
  void sheet
}

{
  const Audience = Catalog.make({
    blocks: [Heading, Section],
    roots: [Content.Section],
    context: Schema.Struct({ audience: Schema.Literals(['guest', 'member']) }),
  })
  const op = Composition.Op.setWhen(NodeId.make('s'), [Composition.when.eq('audience', 'member')])
  const shown: boolean = Composition.holds([Composition.when.eq('audience', 'member')], {
    audience: 'guest',
  })
  void Audience
  void op
  void shown
}
