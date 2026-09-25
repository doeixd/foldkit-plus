// The README's snippets, compiled. Keep the two in step.
import { Result, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import * as RichText from 'foldkit-richtext'
import { inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import { Bundle } from 'foldkit-bundle'
import { Layout } from 'foldkit-mixins/layout'
import { SurfaceBlock } from 'foldkit-composition/surface'
import { Action, Surface } from 'foldkit-surface'
import { Renderer, Stateful } from 'foldkit-composition/foldkit'
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
  type Operation,
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

// Actions
{
  const Message = defineMessageUnion({ AddedToCart: { productId: Schema.String } })
  const AddToCart = Action.define({
    name: 'addToCart',
    description: 'Add a product to the cart',
    input: Schema.Struct({ productId: Schema.String }),
    toMessage: input => Message.AddedToCart(input),
  })
  const Button = Block.define('Button', {
    Props: Schema.Struct({ label: Schema.String }),
    provides: [Content.Flow],
    events: ['press'],
  })
  const Shop = Catalog.make({
    blocks: [Section, Button],
    roots: [Content.Section],
    actions: [AddToCart],
  })
  const op = Composition.Op.setAction(NodeId.make('b'), 'press', {
    action: 'addToCart',
    input: { productId: 'p1' },
  })
  const ShopRenderer = Renderer.forMessages<typeof Message.Type>().make(Shop, {
    Section: ({ regions, h }) => h.section([], [...regions.body]),
    Button: ({ props, on, h }) => {
      const pressed = on('press')
      return h.button(pressed === undefined ? [] : [h.OnClick(pressed)], [props.label])
    },
  })
  void op
  void ShopRenderer
}

// Agents: the tool's input is generated from the Catalog.
{
  expectTypeOf(Composition.operationSchema(Site)).toEqualTypeOf<Schema.Codec<Operation, unknown>>()
}

// Appearance: a layout Block
{
  const ColumnsSlots = Slots.define({
    root: Slot.make({ capability: Capability.Container }),
    left: Slot.make({ capability: Capability.Container }),
    right: Slot.make({ capability: Capability.Container }),
  })
  const t = Theme.ref(Theme.tokens)
  const grow = (left: string, right: string) => ({
    left: Style.inline({ flexGrow: left }),
    right: Style.inline({ flexGrow: right }),
  })
  const ColumnsLook = Appearance.make(ColumnsSlots, {
    recipe: Style.recipeFor(ColumnsSlots)({
      base: { root: Layout.switcher() },
      variants: {
        ratio: { '1:1': grow('1', '1'), '2:1': grow('2', '1') },
        stack: { early: { root: Style.vars({ '--fk-l-threshold': '48rem' }) }, late: {} },
      },
    }),
    tokens: { gap: Appearance.token(t.space, { slot: 'root', property: 'gap' }) },
  })
  void ColumnsLook
}

// Blocks with state of their own
{
  const CarouselModel = Schema.Struct({ interval: Schema.Number, at: Schema.Number })
  const CarouselMessage = defineMessageUnion({ Advanced: {} })
  const CarouselBundle = Bundle.make('Carousel', {
    Model: CarouselModel,
    Message: CarouselMessage,
    init: () => ({ model: { interval: 5, at: 0 } }),
    update: model => ({ model: { ...model, at: model.at + 1 } }),
    view: Submodel.defineView<typeof CarouselModel.Type, typeof CarouselMessage.Type>((model, h) =>
      h.p([], [String(model.at)]),
    ),
  })
  const Carousel = Block.define('Carousel', {
    Props: Schema.Struct({ interval: Schema.Number }),
    provides: [Content.Flow],
    stateful: true,
  })
  const Site = Catalog.make({ blocks: [Section, Carousel], roots: [Content.Section] })
  const Carousels = Bundle.declareEach(CarouselBundle, 'carousels')
  const PageModel = Schema.Struct({ ...Carousels.fields })
  const PageMessage = defineMessageUnion({ ...Carousels.cases })
  const Page = Bundle.parent({ Model: PageModel, Message: PageMessage })
  const Placed = Page.each(Carousels)
  const SiteRenderer = Renderer.forMessages<typeof PageMessage.Type>().make(Site, {
    Section: ({ regions, h }) => h.section([], [...regions.body]),
    Carousel: ({ data }) => Stateful.html(data),
  })
  const before: Document | undefined = undefined
  const after: Document = Composition.empty()
  const step = Stateful.sync(Placed, Site, Carousel, { before, after }, (model, props) => ({
    ...model,
    interval: props.interval,
  }))
  const draw = (model: typeof PageModel.Type, h: HtmlBuilder<typeof PageMessage.Type>) =>
    Renderer.render(SiteRenderer, after, h, {
      data: Stateful.views(Placed, Site, Carousel, after, model, h),
    })
  void step
  void draw
}

// Blocks that show a feature
{
  const Model = Schema.Struct({ cartCount: Schema.Number })
  const App = Surface.application({ Model, Message: defineMessageUnion({ Removed: {} }) })
  const CartSummary = App.surface('CartSummary', {
    params: { caption: Schema.String },
    model: ({ model }) => ({ count: model.cartCount }),
  })
  const Cart = SurfaceBlock.define('Cart', {
    Props: Schema.Struct({ caption: Schema.String }),
    provides: [Content.Flow],
    surface: CartSummary,
    params: props => ({ caption: props.caption }),
  })
  const Shop = Catalog.make({ blocks: [Section, Cart], roots: [Content.Section] })
  const features = SurfaceBlock.active('Features', App.owner, Shop, () => Composition.empty())
  expectTypeOf(Cart.value).returns.toEqualTypeOf<{ readonly count: number } | undefined>()
  void features
}
