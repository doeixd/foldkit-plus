/**
 * What a page may hold, and how each part looks: the site's vocabulary, in
 * code. A page stored in the database names these Blocks and holds their props;
 * it never holds a view.
 */
import { Schema } from 'effect'
import { Builder } from 'foldkit-builder'
import { Block, Catalog, Content, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { BuilderView } from 'foldkit-mixins-builder'

export const Section = Block.define('Section', {
  Props: Schema.Struct({ tone: Schema.Literals(['plain', 'accent']) }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
export const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String.check(Schema.isMinLength(1)) }),
  provides: [Content.Flow],
})
export const Button = Block.define('Button', {
  Props: Schema.Struct({ label: Schema.String, href: Url }),
  provides: [Content.Flow, Content.Interactive],
})

export const Site = Catalog.make({ blocks: [Section, Heading, Button], roots: [Content.Section] })

/** The same views draw the public page, the preview, and the editor's canvas. */
export const SiteRenderer = Renderer.make(Site, {
  Section: ({ props, regions, h }) =>
    h.section([h.DataAttribute('tone', props.tone)], [...regions.body]),
  Heading: ({ props, h }) => h.h2([], [props.text]),
  Button: ({ props, h }) => h.a([h.Class('button'), h.Href(props.href)], [props.label]),
})

export const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  starters: {
    Section: { tone: 'plain' },
    Heading: { text: 'New heading' },
    Button: { label: 'Read the blog', href: Url.make('/blog') },
  },
})

/** The Builder drawn: palette, layers, inspector, and the page in edit mode. */
export const PageEditing = BuilderView.define(PageBuilder)
