/**
 * The site Phase 4 renders: Hero, Section, Columns, Text, Image and Button,
 * each drawn by an ordinary Foldkit view. The same Renderer draws a page in the
 * tests, in an editor's edit mode, and inside a server's static region.
 */
import { Schema } from 'effect'
import * as RichText from 'foldkit-richtext'
import { renderDocument } from 'foldkit-richtext-dom/view'
import { Block, Catalog, Composition, Content, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { RichTextBlock } from 'foldkit-composition/richtext'

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
export const Columns = Block.define('Columns', {
  Props: Schema.Struct({ ratio: Schema.Literals(['1:1', '1:2', '2:1']) }),
  regions: {
    left: Region.many({ accepts: [Content.Flow] }),
    right: Region.many({ accepts: [Content.Flow] }),
  },
  provides: [Content.Flow],
})
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

const widths = { '1:1': '1fr 1fr', '1:2': '1fr 2fr', '2:1': '2fr 1fr' } as const

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
  Columns: ({ props, regions, h }) =>
    h.div(
      [h.Style({ display: 'grid', gridTemplateColumns: widths[props.ratio] })],
      [h.div([], [...regions.left]), h.div([], [...regions.right])],
    ),
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
      props: { ratio: '2:1' },
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
