/**
 * The site Phase 4 renders: Hero, Section, Columns, Text, Image and Button,
 * each drawn by an ordinary Foldkit view. The same Renderer draws a page in the
 * tests, in an editor's edit mode, and inside a server's static region.
 * Columns is a Mixins layout, its settings appearance choices (Phase 8).
 */
import { Schema } from 'effect'
import * as RichText from 'foldkit-richtext'
import { renderDocument } from 'foldkit-richtext-dom/view'
import { Block, Catalog, Composition, Content, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { RichTextBlock } from 'foldkit-composition/richtext'
import { Appearance } from 'foldkit-composition/appearance'
import { Capability, Slot, Slots, Style } from 'foldkit-mixins'
import { Layout } from 'foldkit-mixins/layout'
import { Theme } from 'foldkit-mixins/theme'

export const ArticleKit = RichText.kit({
  nodes: [RichText.block('Paragraph'), RichText.block('Heading')],
  marks: [RichText.Bold],
})

export const Hero = Block.define('Hero', {
  Props: Schema.Struct({ title: Schema.String, subtitle: Schema.optional(Schema.String) }),
  regions: { actions: Region.many({ accepts: [Content.Interactive], max: 3 }) },
  provides: [Content.Section],
})
export const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
export const ColumnsSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  left: Slot.make({ capability: Capability.Container }),
  right: Slot.make({ capability: Capability.Container }),
})
const grow = (left: string, right: string) => ({
  left: Style.inline({ flexGrow: left }),
  right: Style.inline({ flexGrow: right }),
})
/** Two columns side by side that stack when the row is narrower than the threshold. */
export const ColumnsLook = Appearance.make(ColumnsSlots, {
  recipe: Style.recipeFor(ColumnsSlots)({
    base: { root: Layout.switcher() },
    variants: {
      ratio: { '1:1': grow('1', '1'), '1:2': grow('1', '2'), '2:1': grow('2', '1') },
      stack: {
        early: { root: Style.vars({ '--fk-l-threshold': '48rem' }) },
        late: { root: Style.vars({ '--fk-l-threshold': '30rem' }) },
      },
    },
    defaults: { ratio: '1:1', stack: 'late' },
  }),
  tokens: {
    gap: Appearance.token(Theme.ref(Theme.tokens).space, { slot: 'root', property: 'gap' }),
  },
})
export const Columns = Block.define('Columns', {
  Props: Schema.Struct({}),
  regions: {
    left: Region.many({ accepts: [Content.Flow] }),
    right: Region.many({ accepts: [Content.Flow] }),
  },
  provides: [Content.Flow],
}).pipe(Appearance.attach(ColumnsLook))
export const Text = RichTextBlock.define('Text', { kit: ArticleKit, provides: [Content.Flow] })
export const Image = Block.define('Image', {
  Props: Schema.Struct({ src: Url, alt: Schema.String }),
  provides: [Content.Flow, Content.Media],
})
export const Button = Block.define('Button', {
  Props: Schema.Struct({ label: Schema.String, href: Url }),
  provides: [Content.Flow, Content.Interactive],
})

export const Site = Catalog.make({
  blocks: [Hero, Section, Columns, Text, Image, Button],
  roots: [Content.Section],
})

export const SiteRenderer = Renderer.make(Site, {
  Hero: ({ props, regions, h }) =>
    h.header(
      [h.Class('hero')],
      [
        h.h1([], [props.title]),
        props.subtitle === undefined ? h.empty : h.p([], [props.subtitle]),
        h.div([h.Class('actions')], [...regions.actions]),
      ],
    ),
  Section: ({ props, regions, h }) =>
    h.section([h.DataAttribute('tone', props.tone)], [...regions.body]),
  Columns: ({ regions, appearance, h }) => {
    const slots = ColumnsLook.draw({ appearance, h })
    return h.div(slots.root.attrs(), [
      h.div(slots.left.attrs(), [...regions.left]),
      h.div(slots.right.attrs(), [...regions.right]),
    ])
  },
  Text: ({ props }) => renderDocument(props.body),
  Image: ({ props, h }) => h.img([h.Src(props.src), h.Alt(props.alt)]),
  Button: ({ props, h }) => h.a([h.Class('button'), h.Href(props.href)], [props.label]),
})

/** A rich-text body, encoded as a Document stores it. */
export const body = (text: string) =>
  Schema.encodeSync(RichText.Document)(
    RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: `p-${text.length}`,
          children: [{ type: 'Text', id: `t-${text.length}`, text, marks: [] }],
        },
      ],
    }),
  )

/** A page of the site: a Hero with a button, then a Section with columns of text and an image. */
export const homePage = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['hero', 'about'],
  nodes: {
    hero: {
      block: 'Hero',
      props: { title: 'Build what comes next', subtitle: 'A page as data' },
      regions: { actions: ['start'] },
    },
    start: { block: 'Button', props: { label: 'Start', href: '/start' }, regions: {} },
    about: {
      block: 'Section',
      props: { tone: 'plain' },
      regions: { body: ['columns'] },
    },
    columns: {
      block: 'Columns',
      props: {},
      appearance: { ratio: '2:1', gap: 'lg' },
      regions: { left: ['copy'], right: ['photo'] },
    },
    copy: { block: 'Text', props: { body: body('Composition is a stored page.') }, regions: {} },
    photo: {
      block: 'Image',
      props: { src: 'https://example.com/photo.jpg', alt: 'A photo' },
      regions: {},
    },
  },
})
