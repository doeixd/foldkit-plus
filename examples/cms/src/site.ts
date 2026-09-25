/**
 * What a page may hold, and how each part looks: the site's vocabulary, in
 * code. A page stored in the database names these Blocks and holds their props;
 * it never holds a view.
 */
import { Schema } from 'effect'
import { Builder } from 'foldkit-builder'
import { Cms } from 'foldkit-cms'
import { Block, Catalog, Content, Region, Url } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { QueryBlock } from 'foldkit-composition/remote'
import { Entity } from 'foldkit-entity'
import { Input } from 'foldkit-form'
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

/**
 * The site's pages, newest first: an author picks how many, and one page to
 * leave out (the page the list is on, say), never a query. The read goes
 * through Remote with the reader's authority, so it lists what that reader may
 * see of the worklist.
 */
export const LatestPages = QueryBlock.define('LatestPages', {
  Props: Schema.Struct({
    count: Schema.Literals([3, 5]),
    except: Schema.NullOr(Schema.String).annotate({ title: 'Leave out' }),
  }),
  provides: [Content.Flow],
  query: Cms.Entries,
  input: () => ({ type: 'pages', search: '', archived: false }),
  select: Entity.select(Cms.Entities.Entry, { id: true, label: true }),
  // One more than shown when one is left out, so the list is still `count` long.
  first: props => props.count + (props.except === null ? 0 : 1),
}).pipe(Block.annotate(BuilderView.controls({ except: Input.relationOne(Cms.Entities.Entry) })))

export const Site = Catalog.make({
  blocks: [Section, Heading, Button, LatestPages],
  roots: [Content.Section],
})

/** The same views draw the public page, the preview, and the editor's canvas. */
export const SiteRenderer = Renderer.make(Site, {
  Section: ({ props, regions, h }) =>
    h.section([h.DataAttribute('tone', props.tone)], [...regions.body]),
  Heading: ({ props, h }) => h.h2([], [props.text]),
  Button: ({ props, h }) => h.a([h.Class('button'), h.Href(props.href)], [props.label]),
  LatestPages: ({ props, data, h }) => {
    const rows = LatestPages.rows(data)
    return rows._tag === 'Ready' || rows._tag === 'Refreshing'
      ? h.ul(
          [],
          rows.value.items
            .filter(item => item.id !== props.except)
            .slice(0, props.count)
            .map(item => h.li([], [item.label])),
        )
      : h.p([], ['Loading pages'])
  },
})

export const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  starters: {
    Section: { tone: 'plain' },
    Heading: { text: 'New heading' },
    Button: { label: 'Read the blog', href: Url.make('/blog') },
    LatestPages: { count: 3, except: null },
  },
})

/** The Builder drawn: palette, layers, inspector, and the page in edit mode. */
export const PageEditing = BuilderView.define(PageBuilder)
