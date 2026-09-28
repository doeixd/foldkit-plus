import { Effect, Option, Result, Schema } from 'effect'
import { inertHtml, type Html } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Action, Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'
import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  Block,
  Catalog,
  Composition,
  Content,
  NodeId,
  Region,
  isSafeUrl,
} from 'foldkit-composition'
import { Renderer, fieldOf } from 'foldkit-composition/foldkit'
import { SlotView, Style } from 'foldkit-mixins'
import { ArticleKit, Columns, ColumnsLook, Site, SiteRenderer, body, homePage } from './site.js'
import { Inert } from 'foldkit-mixins/testing'

const id = NodeId.make
const page = (roots: ReadonlyArray<string>, nodes: Readonly<Record<string, unknown>>) =>
  Schema.decodeUnknownSync(Composition.Document)({ format: 1, roots, nodes })

describe('drawing a Document', () => {
  it('draws each root with its Block’s view, and each Region’s children in order', () => {
    const [hero, about] = Renderer.render(SiteRenderer, homePage, inertHtml)
    expect(hero?.sel).toBe('header')
    expect(Inert.classes(hero)).toEqual(['hero'])
    expect(Inert.all(hero).map(node => node.sel)).toContain('h1')
    expect(Inert.text(hero)).toBe('Build what comes nextA page as dataStart')
    const link = Inert.all(hero).find(node => node.sel === 'a')
    expect(Inert.value(link, 'href')).toBe('/start')

    expect(about?.sel).toBe('section')
    expect(Inert.value(Inert.all(about)[0], 'data-tone')).toBe('plain')
    expect(Inert.text(about)).toBe('Composition is a stored page.')
    const image = Inert.all(about).find(node => node.sel === 'img')
    expect(Inert.value(image, 'src')).toBe('https://example.com/photo.jpg')
  })

  it('marks each node in edit mode, and changes nothing else', () => {
    const [hero] = Renderer.render(SiteRenderer, homePage, inertHtml, { mode: 'edit' })
    const marked = Inert.all(hero).filter(
      node => Inert.value(node, 'data-composition-node') !== undefined,
    )
    expect(marked.map(node => Inert.value(node, 'data-composition-node'))).toEqual([
      'hero',
      'start',
    ])
    expect(marked[0]?.data?.style).toEqual({ display: 'contents' })
    const [inner] = marked[0]?.children ?? []
    expect(typeof inner === 'string' ? inner : Inert.classes(inner)).toEqual(['hero'])
  })

  it('marks the selected, hovered and drop target nodes in edit mode, for a stylesheet', () => {
    const [hero] = Renderer.render(SiteRenderer, homePage, inertHtml, {
      mode: 'edit',
      selected: Option.some(id('start')),
      hovered: Option.some(id('hero')),
      drop: Option.some({ id: id('start'), zone: 'before' }),
    })
    const marked = Inert.all(hero).filter(
      node => Inert.value(node, 'data-composition-node') !== undefined,
    )
    expect(marked.map(node => Inert.value(node, 'data-composition-mark'))).toEqual([
      'hovered',
      'selected',
    ])
    expect(marked.map(node => Inert.value(node, 'data-composition-drop'))).toEqual([
      undefined,
      'before',
    ])
    // Hovered and selected at once, the node is marked selected.
    const [both] = Renderer.render(SiteRenderer, homePage, inertHtml, {
      mode: 'edit',
      selected: Option.some(id('hero')),
      hovered: Option.some(id('hero')),
    })
    expect(
      Inert.all(both).flatMap(node => Inert.value(node, 'data-composition-mark') ?? []),
    ).toEqual(['selected'])
    const [viewed] = Renderer.render(SiteRenderer, homePage, inertHtml, {
      selected: Option.some(id('start')),
    })
    expect(
      Inert.all(viewed).some(node => Inert.value(node, 'data-composition-mark') !== undefined),
    ).toBe(false)
  })

  it('draws a layout Block with the look its node chose, and its stylesheet holds the layout', () => {
    const [, about] = Renderer.render(SiteRenderer, homePage, inertHtml)
    const columns = Inert.all(about).find(node => node.data?.style?.['gap'] !== undefined)
    expect(columns?.data?.style).toEqual({
      gap: 'var(--fk-space-lg)',
      '--fk-l-threshold': '30rem',
    })
    const [left, right] = columns?.children ?? []
    const flex = (node: typeof left) =>
      node === undefined || typeof node === 'string' ? undefined : node.data?.style?.['flex-grow']
    expect([flex(left), flex(right)]).toEqual(['2', '1'])
    const [layout] = Inert.classes(columns)
    expect(Style.stylesheet(...ColumnsLook.styles)).toContain(`.${layout}{display:flex`)
    expect(Columns.appearance['gap']?.kind).toBe('token')
  })

  it('holds Columns three deep, draws each level, and moves across them', () => {
    const deep = page(['s'], {
      s: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['c1'] } },
      c1: { block: 'Columns', props: {}, regions: { left: ['c2'], right: [] } },
      c2: { block: 'Columns', props: {}, regions: { left: ['c3'], right: [] } },
      c3: { block: 'Columns', props: {}, regions: { left: ['img'], right: [] } },
      img: { block: 'Image', props: { src: '/a.png', alt: 'A' }, regions: {} },
    })
    expect(Composition.validate(Site, deep)).toEqual([])
    const [section] = Renderer.render(SiteRenderer, deep, inertHtml)
    expect(Inert.all(section).filter(node => node.sel === 'img')).toHaveLength(1)
    // Each level is a layout of its own, the image inside the third.
    const [layout] = Inert.classes(
      Inert.all(section).find(node => node.sel === 'div' && Inert.classes(node).length > 0),
    )
    expect(
      Inert.all(section).filter(
        node => node.sel === 'div' && Inert.classes(node).includes(layout ?? ''),
      ),
    ).toHaveLength(3)
    const moved = Composition.apply(
      Site,
      deep,
      Composition.Op.move(id('img'), Composition.region(id('c1'), 'right', 0)),
    )
    expect(
      Result.isSuccess(moved) && moved.success.document.nodes[id('c1')]?.regions['right'],
    ).toEqual([id('img')])
    const cycle = Composition.apply(
      Site,
      deep,
      Composition.Op.move(id('c1'), Composition.region(id('c3'), 'right', 0)),
    )
    expect(Result.isFailure(cycle) && cycle.failure.code).toBe('composition:cycle')
  })

  it('leaves out a node whose when does not hold, and marks it for an author', () => {
    const Audience = Catalog.make({
      blocks: Site.blocks,
      roots: Site.roots,
      context: Schema.Struct({ audience: Schema.Literals(['guest', 'member']) }),
    })
    const Drawn = Renderer.make(Audience, SiteRenderer.entries)
    const members = page(['hero'], {
      hero: {
        block: 'Hero',
        props: { title: 'Welcome back' },
        regions: { actions: [] },
        when: [{ eq: ['audience', 'member'] }],
      },
    })
    const count = (context?: Readonly<Record<string, unknown>>) =>
      Renderer.render(Drawn, members, inertHtml, context === undefined ? {} : { context }).filter(
        node => node !== null,
      ).length
    expect(count({ audience: 'member' })).toBe(1)
    expect(count({ audience: 'guest' })).toBe(0)
    // Drawn without its context, a page fails closed.
    expect(count()).toBe(0)
    const [marked] = Renderer.render(Drawn, members, inertHtml, {
      mode: 'edit',
      context: { audience: 'guest' },
    })
    expect(Inert.value(Inert.all(marked)[0], 'data-composition-hidden')).toBe('')
    const [shown] = Renderer.render(Drawn, members, inertHtml, {
      mode: 'edit',
      context: { audience: 'member' },
    })
    expect(Inert.value(Inert.all(shown)[0], 'data-composition-hidden')).toBeUndefined()
  })

  it('hands a view the Message its node’s action makes, checked first', () => {
    const Message = defineMessageUnion({ Subscribed: { list: Schema.String } })
    const Subscribe = Action.define({
      name: 'subscribe',
      description: 'Subscribe to the newsletter',
      input: Schema.Struct({ list: Schema.String }),
      toMessage: input => Message.Subscribed(input),
    })
    const Cta = Block.define('Cta', {
      Props: Schema.Struct({ label: Schema.String }),
      provides: [Content.Section],
      events: ['press'],
    })
    const Actions = Catalog.make({ blocks: [Cta], roots: [Content.Section], actions: [Subscribe] })
    const h = SlotView.inertBuilder<typeof Message.Type>()
    const pressed: Array<Option.Option<typeof Message.Type>> = []
    const Drawn = Renderer.forMessages<typeof Message.Type>().make(Actions, {
      Cta: ({ props, on, h }) => {
        pressed.push(on('press'), on('hover'))
        return h.p([], [props.label])
      },
    })
    const cta = (actions: unknown) =>
      page(['c'], { c: { block: 'Cta', props: { label: 'Join' }, regions: {}, actions } })
    Renderer.render(Drawn, cta({ press: { action: 'subscribe', input: { list: 'news' } } }), h)
    Renderer.render(Drawn, cta({ press: { action: 'subscribe', input: { list: 3 } } }), h)
    Renderer.render(Drawn, cta({ press: { action: 'gone' } }), h)
    // An event the Block does not have runs nothing, whatever is stored for it.
    Renderer.render(Drawn, cta({ hover: { action: 'subscribe', input: { list: 'x' } } }), h)
    // A Renderer whose views dispatch nothing, such as an editor's canvas, is given no Message.
    const given: Array<unknown> = []
    const Static = Renderer.make(Actions, {
      Cta: ({ props, on, h }) => {
        given.push(on('press'))
        return h.p([], [props.label])
      },
    })
    Renderer.render(
      Static,
      cta({ press: { action: 'subscribe', input: { list: 'news' } } }),
      inertHtml,
    )
    expect(given).toEqual([Option.none()])
    // @ts-expect-error a dispatching Renderer must route every Message the Catalog's actions make
    Renderer.forMessages<{ readonly _tag: 'Other' }>().make(Actions, {
      Cta: ({ props, h }) => h.p([], [props.label]),
    })
    expect(pressed).toEqual([
      Option.some(Message.Subscribed({ list: 'news' })),
      Option.none(),
      Option.none(),
      Option.none(),
      Option.none(),
      Option.none(),
      Option.none(),
      Option.none(),
    ])
  })

  it('draws a node whose view throws as a placeholder, and the rest of the page', () => {
    const Fragile = Renderer.make(Site, {
      ...SiteRenderer.entries,
      Image: () => {
        throw new Error('no image today')
      },
    })
    const drawn = page(['s'], {
      s: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['i', 'b'] } },
      i: { block: 'Image', props: { src: '/a.png', alt: 'A' }, regions: {} },
      b: { block: 'Button', props: { label: 'Go', href: '/go' }, regions: {} },
    })
    const [viewed] = Renderer.render(Fragile, drawn, inertHtml)
    expect(Inert.all(viewed).flatMap(node => (node.sel === undefined ? [] : [node.sel]))).toEqual([
      'section',
      'a',
    ])
    const [edited] = Renderer.render(Fragile, drawn, inertHtml, { mode: 'edit' })
    const placeholder = Inert.all(edited).find(
      node => Inert.value(node, 'data-composition-placeholder') === 'Image',
    )
    expect(Inert.text(placeholder)).toContain('it could not be drawn: Error: no image today')
  })

  it('draws what it cannot as a placeholder: nothing for a visitor, a label for an author', () => {
    const broken = page(['s'], {
      s: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['old', 'bad', 'gone'] } },
      old: { block: 'Carousel', props: {}, regions: {} },
      bad: { block: 'Image', props: { src: 'javascript:alert(1)', alt: 'x' }, regions: {} },
    })
    const [viewed] = Renderer.render(SiteRenderer, broken, inertHtml)
    // Nothing is drawn for a visitor: the section is there, and empty.
    expect(Inert.all(viewed).map(node => node.sel)).toEqual(['section'])

    const [edited] = Renderer.render(SiteRenderer, broken, inertHtml, { mode: 'edit' })
    const placeholders = Inert.all(edited).filter(
      node => Inert.value(node, 'data-composition-placeholder') !== undefined,
    )
    expect(placeholders.map(node => Inert.text(node))).toEqual([
      'Carousel: this Block is not in this version of the application',
      'Image: its settings are not valid',
      'Missing: this node is not in the page',
    ])
  })

  it('draws a node reached twice once, so a cycle ends', () => {
    const cyclic = page(['a'], {
      a: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['b'] } },
      b: { block: 'Columns', props: { ratio: '1:1' }, regions: { left: ['b'], right: [] } },
    })
    const [section] = Renderer.render(SiteRenderer, cyclic, inertHtml)
    expect(Inert.all(section).filter(node => node.sel === 'div').length).toBe(3)
  })

  it('requires a view for every Block of the Catalog', () => {
    const Lonely = Block.define('Lonely', { Props: Schema.Struct({}), provides: [Content.Section] })
    const catalog = Catalog.make({ blocks: [Lonely], roots: [Content.Section] })
    // @ts-expect-error: the Catalog has Lonely, and no view is given for it.
    expect(() => Renderer.make(catalog, {})).toThrow('Renderer.make: no view for "Lonely"')
  })

  it('types a Renderer whose views dispatch the application’s Messages', () => {
    const Message = defineMessageUnion({ Pressed: { label: Schema.String } })
    const Press = Block.define('Press', {
      Props: Schema.Struct({ label: Schema.String }),
      provides: [Content.Section],
    })
    const catalog = Catalog.make({ blocks: [Press], roots: [Content.Section] })
    const renderer = Renderer.forMessages<typeof Message.Type>().make(catalog, {
      Press: ({ props, h }) =>
        h.button([h.OnClick(Message.Pressed({ label: props.label }))], [props.label]),
    })
    expectTypeOf(renderer.entries.Press).parameter(0).toHaveProperty('h')
    expectTypeOf(renderer).toExtend<Renderer<typeof Press, typeof Message.Type>>()
  })
})

describe('text edited in place', () => {
  const Title = Block.define('Title', {
    Props: Schema.Struct({
      text: Schema.String,
      tagLine: Schema.String,
      level: Schema.Number,
      note: Schema.optional(Schema.String),
      mood: Schema.Literals(['calm', 'loud']),
    }),
    provides: [Content.Section],
  })
  const Stack = Block.define('Stack', {
    Props: Schema.Struct({ name: Schema.String }),
    regions: { items: Region.many({ accepts: [Content.Section] }) },
    provides: [Content.Section],
  })
  const Titles = Catalog.make({ blocks: [Title, Stack], roots: [Content.Section] })
  const TitleRenderer = Renderer.make(Titles, {
    // Draws its name as plain text, and what it holds draws fields of its own.
    Stack: ({ props, regions, h }) => h.div([], [props.name, ...regions.items]),
    Title: ({ field, h }) =>
      h.header([], [h.h1([], [field('text', { label: 'Title' })]), h.p([], [field('tagLine')])]),
  })
  const titles = page(['t', 'u'], {
    t: {
      block: 'Title',
      props: { text: 'Hello there', tagLine: 'Hi', level: 1, mood: 'calm' },
      regions: {},
    },
    u: {
      block: 'Title',
      props: { text: 'Other', tagLine: 'Also', level: 1, mood: 'calm' },
      regions: {},
    },
  })
  const fields = (roots: ReadonlyArray<Html>) =>
    roots.flatMap(root =>
      Inert.all(root).filter(node => Inert.value(node, 'data-composition-field') !== undefined),
    )

  it('draws a field as its text for a visitor, and marked by node and prop for an editor', () => {
    const [viewed] = Renderer.render(TitleRenderer, titles, inertHtml)
    expect(Inert.text(viewed)).toBe('Hello thereHi')
    expect(
      Inert.all(viewed)
        .filter(node => node.sel !== undefined)
        .map(node => node.sel),
    ).toEqual(['header', 'h1', 'p'])
    const [marked] = fields(Renderer.render(TitleRenderer, titles, inertHtml, { mode: 'edit' }))
    expect(Inert.text(marked)).toBe('Hello there')
    expect(Inert.value(marked, 'contenteditable')).toBeUndefined()
    const name = String(Inert.value(marked, 'data-composition-field'))
    expect(fieldOf(name)).toEqual(Option.some({ id: id('t'), key: 'text' }))
    // An id with the separator a naive name would split on is still one id.
    expect(fieldOf(JSON.stringify(['a:b', 'text']))).toEqual(
      Option.some({ id: id('a:b'), key: 'text' }),
    )
    expect(fieldOf('t:text')).toEqual(Option.none())
    expect(fieldOf(JSON.stringify(['', 'text']))).toEqual(Option.none())
  })

  it('draws the field being edited editable, with the text it had when editing began', () => {
    const editing = Option.some({ id: id('t'), key: 'text', initial: 'Hello' })
    // The node's other field, and the other node's same field, are drawn as they were.
    const [edited, sibling, other] = fields(
      Renderer.render(TitleRenderer, titles, inertHtml, { mode: 'edit', editing }),
    )
    expect(Inert.value(sibling, 'contenteditable')).toBeUndefined()
    // Frozen: the page holds more by now, and the browser shows what was typed.
    expect(Inert.text(edited)).toBe('Hello')
    expect(Inert.value(edited, 'contenteditable')).toBe('plaintext-only')
    expect(Inert.value(edited, 'role')).toBe('textbox')
    expect(Inert.value(edited, 'aria-label')).toBe('Title')
    // Keyed apart, so the browser's element is replaced when editing begins and ends.
    expect(edited?.key).toBeDefined()
    expect(other?.key).toBeUndefined()
    expect(Inert.value(other, 'contenteditable')).toBeUndefined()
    // A visitor's page ignores it.
    const visited = Renderer.render(TitleRenderer, titles, inertHtml, { editing })
    expect(Inert.text(visited[0])).toBe('Hello thereHi')
    expect(fields(visited)).toEqual([])
    // A field given no label is named by its prop, spaced.
    const [, tagLine] = fields(
      Renderer.render(TitleRenderer, titles, inertHtml, {
        mode: 'edit',
        editing: Option.some({ id: id('t'), key: 'tagLine', initial: 'Hi' }),
      }),
    )
    expect(Inert.value(tagLine, 'aria-label')).toBe('Tag line')
  })

  it('says which text props a node draws as fields, and not those of what it holds', () => {
    const stacked = page(['s'], {
      s: { block: 'Stack', props: { name: 'All' }, regions: { items: ['t'] } },
      t: {
        block: 'Title',
        props: { text: 'Hello', tagLine: 'Hi', level: 1, mood: 'calm' },
        regions: {},
      },
    })
    expect(Renderer.fields(TitleRenderer, stacked, id('t'))).toEqual(['text', 'tagLine'])
    expect(Renderer.fields(TitleRenderer, stacked, id('s'))).toEqual([])
    expect(Renderer.fields(TitleRenderer, stacked, id('gone'))).toEqual([])
  })

  it('takes only a prop that is text', () => {
    Renderer.make(Titles, {
      Stack: ({ h }) => h.div([], []),
      Title: ({ field, h }) =>
        h.h1(
          [],
          [
            // @ts-expect-error: a number is no text
            field('level'),
            // @ts-expect-error: text that may be absent is no field
            field('note'),
            // @ts-expect-error: no such prop
            field('title'),
            // @ts-expect-error: one of a few names is no free text
            field('mood'),
          ],
        ),
    })
  })
})

describe('URLs a page may hold', () => {
  it('accepts the web’s schemes and relative URLs, and nothing that runs', () => {
    for (const safe of [
      'https://example.com',
      'http://x',
      'mailto:a@b.c',
      'tel:+1',
      '/a',
      'a/b',
      '#x',
      '?q',
      '//cdn.example',
    ])
      expect(isSafeUrl(safe)).toBe(true)
    for (const unsafe of [
      'javascript:alert(1)',
      ' JaVa\tScRiPt:alert(1)',
      'java\nscript:alert(1)',
      'data:text/html,<script>',
      'vbscript:msgbox',
      'file:///etc/passwd',
    ])
      expect(isSafeUrl(unsafe)).toBe(false)
  })

  it('refuses an unsafe URL where a Block holds one, in validation and in an edit', () => {
    const unsafe = page(['s'], {
      s: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['i'] } },
      i: { block: 'Image', props: { src: 'javascript:alert(1)', alt: 'x' }, regions: {} },
    })
    expect(Composition.validate(Site, unsafe)[0]?.message).toContain(
      '"javascript:alert(1)" is not a URL a page may hold',
    )
    const edit = Composition.apply(
      Site,
      homePage,
      Composition.Op.setProp(id('photo'), 'src', 'data:image/svg+xml,<svg onload=x>'),
    )
    expect(Result.isFailure(edit) && edit.failure.code).toBe('composition:invalid-props')
  })
})

describe('rich text as a Block’s prop', () => {
  const italic = Schema.encodeSync(Schema.toCodecJson(Schema.Unknown))({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 't', text: 'Hi', marks: ['Italic'] }],
      },
    ],
  })

  it('checks the body against the Block’s Kit, at the body’s path', () => {
    const document = page(['s'], {
      s: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['copy'] } },
      copy: { block: 'Text', props: { body: italic }, regions: {} },
    })
    const [finding] = Composition.validate(Site, document)
    expect(finding?.code).toBe('composition:nested')
    expect(finding?.path.slice(0, 5)).toEqual(['nodes', 'copy', 'props', 'body', 't'])
    expect(finding?.message).toContain('Italic')
    expect(ArticleKit.marks.map(mark => mark.name)).toEqual(['Bold'])
  })

  it('refuses an edit that puts a body the Kit does not accept', () => {
    const edit = Composition.apply(
      Site,
      homePage,
      Composition.Op.setProp(id('copy'), 'body', italic),
    )
    expect(Result.isFailure(edit) && edit.failure.code).toBe('composition:nested')
    const fine = Composition.apply(
      Site,
      homePage,
      Composition.Op.setProp(id('copy'), 'body', body('Still fine')),
    )
    expect(Result.isSuccess(fine)).toBe(true)
  })
})

describe('a published page, served through foldkit-ssr', () => {
  const Model = Schema.Struct({ page: Composition.Document, likes: Schema.Number })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({ Liked: {} })
  type Message = typeof Message.Type
  const initial: Model = { page: Composition.empty(), likes: 0 }
  const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
  const config = {
    Model,
    init: () => ({ model: { page: homePage, likes: 3 } }),
    update: (model: Model) => ({ model: { ...model, likes: model.likes + 1 } }),
    view: (model: Model, h: Parameters<typeof SiteRenderer.entries.Hero>[0]['h']) => ({
      title: 'Home',
      body: h.main([], [SSR.static('page', ih => Renderer.render(SiteRenderer, model.page, ih))]),
    }),
    container: null,
  }
  // The browser owns the likes, and nothing of the page.
  const plan = SSR.plan(App, { id: 'home', state: Projection.pick(App.model.likes) })

  it('renders the page on the server and sends the browser none of the Document', async () => {
    const result = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    const html = SSR.page(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      result,
    )
    expect(html).toContain('Build what comes next')
    expect(html).toContain('Composition is a stored page.')
    expect(result.envelope).toContain('"plan":"home"')
    for (const stored of [
      'Build what comes next',
      'Composition is a stored page.',
      '"roots"',
      'hero',
    ])
      expect(result.envelope).not.toContain(stored)
  })
})
