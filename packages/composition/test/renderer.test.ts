import { Effect, Result, Schema } from 'effect'
import { inertHtml, type Html } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Action, Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Block, Catalog, Composition, Content, NodeId, isSafeUrl } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { SlotView, Style } from 'foldkit-mixins'
import { ArticleKit, Columns, ColumnsLook, Site, SiteRenderer, body, homePage } from './site.js'

type Node = Exclude<Html, null>

const all = (node: Html | undefined): ReadonlyArray<Node> =>
  node === null || node === undefined
    ? []
    : [
        node,
        ...(node.children ?? []).flatMap(child => (typeof child === 'string' ? [] : all(child))),
      ]
const text = (node: Html | undefined): string =>
  all(node)
    .map(each => each.text ?? '')
    .join('')
const attr = (node: Node | undefined, key: string): unknown => node?.data?.attrs?.[key]
const prop = (node: Node | undefined, key: string): unknown => node?.data?.props?.[key]
const classes = (node: Html | undefined): ReadonlyArray<string> =>
  node === null || node === undefined ? [] : Object.keys(node.data?.class ?? {})

const id = NodeId.make
const page = (roots: ReadonlyArray<string>, nodes: Readonly<Record<string, unknown>>) =>
  Schema.decodeUnknownSync(Composition.Document)({ format: 1, roots, nodes })

describe('drawing a Document', () => {
  it('draws each root with its Block’s view, and each Region’s children in order', () => {
    const [hero, about] = Renderer.render(SiteRenderer, homePage, inertHtml)
    expect(hero?.sel).toBe('header')
    expect(classes(hero)).toEqual(['hero'])
    expect(all(hero).map(node => node.sel)).toContain('h1')
    expect(text(hero)).toBe('Build what comes nextA page as dataStart')
    const link = all(hero).find(node => node.sel === 'a')
    expect(prop(link, 'href')).toBe('/start')

    expect(about?.sel).toBe('section')
    expect(attr(all(about)[0], 'data-tone')).toBe('plain')
    expect(text(about)).toBe('Composition is a stored page.')
    const image = all(about).find(node => node.sel === 'img')
    expect(prop(image, 'src')).toBe('https://example.com/photo.jpg')
  })

  it('marks each node in edit mode, and changes nothing else', () => {
    const [hero] = Renderer.render(SiteRenderer, homePage, inertHtml, { mode: 'edit' })
    const marked = all(hero).filter(node => attr(node, 'data-composition-node') !== undefined)
    expect(marked.map(node => attr(node, 'data-composition-node'))).toEqual(['hero', 'start'])
    expect(marked[0]?.data?.style).toEqual({ display: 'contents' })
    const [inner] = marked[0]?.children ?? []
    expect(typeof inner === 'string' ? inner : classes(inner)).toEqual(['hero'])
  })

  it('marks the selected, hovered and drop target nodes in edit mode, for a stylesheet', () => {
    const [hero] = Renderer.render(SiteRenderer, homePage, inertHtml, {
      mode: 'edit',
      selected: id('start'),
      hovered: id('hero'),
      drop: { id: id('start'), zone: 'before' },
    })
    const marked = all(hero).filter(node => attr(node, 'data-composition-node') !== undefined)
    expect(marked.map(node => attr(node, 'data-composition-selected'))).toEqual([undefined, ''])
    expect(marked.map(node => attr(node, 'data-composition-hovered'))).toEqual(['', undefined])
    expect(marked.map(node => attr(node, 'data-composition-drop'))).toEqual([undefined, 'before'])
    const [viewed] = Renderer.render(SiteRenderer, homePage, inertHtml, { selected: id('start') })
    expect(all(viewed).some(node => attr(node, 'data-composition-selected') !== undefined)).toBe(
      false,
    )
  })

  it('draws a layout Block with the look its node chose, and its stylesheet holds the layout', () => {
    const [, about] = Renderer.render(SiteRenderer, homePage, inertHtml)
    const columns = all(about).find(node => node.data?.style?.['gap'] !== undefined)
    expect(columns?.data?.style).toEqual({
      gap: 'var(--fk-space-lg)',
      '--fk-l-threshold': '30rem',
    })
    const [left, right] = columns?.children ?? []
    const flex = (node: typeof left) =>
      node === undefined || typeof node === 'string' ? undefined : node.data?.style?.['flex-grow']
    expect([flex(left), flex(right)]).toEqual(['2', '1'])
    const [layout] = classes(columns)
    expect(Style.stylesheet(...ColumnsLook.styles)).toContain(`.${layout}{display:flex`)
    expect(Columns.appearance['gap']?.kind).toBe('token')
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
    expect(attr(all(marked)[0], 'data-composition-hidden')).toBe('')
    const [shown] = Renderer.render(Drawn, members, inertHtml, {
      mode: 'edit',
      context: { audience: 'member' },
    })
    expect(attr(all(shown)[0], 'data-composition-hidden')).toBeUndefined()
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
    const pressed: Array<typeof Message.Type | undefined> = []
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
    expect(pressed).toEqual([
      Message.Subscribed({ list: 'news' }),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('draws what it cannot as a placeholder: nothing for a visitor, a label for an author', () => {
    const broken = page(['s'], {
      s: { block: 'Section', props: { tone: 'plain' }, regions: { body: ['old', 'bad', 'gone'] } },
      old: { block: 'Carousel', props: {}, regions: {} },
      bad: { block: 'Image', props: { src: 'javascript:alert(1)', alt: 'x' }, regions: {} },
    })
    const [viewed] = Renderer.render(SiteRenderer, broken, inertHtml)
    // Nothing is drawn for a visitor: the section is there, and empty.
    expect(all(viewed).map(node => node.sel)).toEqual(['section'])

    const [edited] = Renderer.render(SiteRenderer, broken, inertHtml, { mode: 'edit' })
    const placeholders = all(edited).filter(
      node => attr(node, 'data-composition-placeholder') !== undefined,
    )
    expect(placeholders.map(node => text(node))).toEqual([
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
    expect(all(section).filter(node => node.sel === 'div').length).toBe(3)
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
