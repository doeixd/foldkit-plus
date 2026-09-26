/**
 * The drawn Builder, rendered inert: what each Slot draws, the tree's ARIA,
 * the inspector's controls by prop kind, the canvas's frame and marks, and the
 * Behaviors attached to the layers, the tree and the canvas.
 */
import { Option, Schema } from 'effect'
import { Block, Catalog, Composition, Content, NodeId } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { Input } from 'foldkit-form'
import { Builder, Message, type Model } from 'foldkit-builder'
import { Attributes, A11y, Capability, SlotView, Style } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { BuilderSlots, BuilderView, layerId, rowsOf, viewportWidths } from 'foldkit-mixins-builder'
import { PageBuilder, PageView, Quote, Site, SiteRenderer, answer, isTimer } from './fixture.js'
import { Inert } from 'foldkit-mixins/testing'
import { FieldSlots, FormSlots, type Renderers } from 'foldkit-mixins-form'

const buttonNamed = (root: Html, name: string) =>
  Inert.all(root).find(node => node.sel === 'button' && Inert.text(node) === name)

const required = <A>(value: A | null | undefined, what: string): A => {
  if (value === undefined || value === null) throw new Error(`expected ${what}`)
  return value
}

/** What an Option holds, or a failed test saying what was missing. */
const some = <A>(value: Option.Option<A>, what: string): A =>
  Option.getOrThrowWith(value, () => new Error(`expected ${what}`))

const send = (model: Model, message: Message): Model => {
  const result = PageBuilder.bundle.update(model, message, undefined)
  return (result.commands ?? [])
    .filter(command => !isTimer(command))
    .reduce((next, command) => send(next, answer(command)), result.model)
}
const insert = (model: Model, block: 'Section' | 'Heading' | 'Banner') =>
  send(
    model,
    Message.InsertAsked({
      block,
      at: some(
        PageBuilder.placeFor(PageBuilder.document(model), model.selected, block),
        `a place for ${block}`,
      ),
    }),
  )
const h = SlotView.inertBuilder<Message>()
const draw = (model: Model) => PageView(model, h)

// A Section holding a Heading, then a Banner, with the Banner selected.
const page = insert(insert(insert(PageBuilder.initial, 'Section'), 'Heading'), 'Banner')
const section = required(PageBuilder.document(page).roots[0], 'the section')

describe('the drawn Builder', () => {
  it('offers each Block with starting props, in its group, saying where it would go', () => {
    const items = (root: Html) =>
      Inert.all(root).filter(
        node => node.sel === 'button' && Inert.value(node, 'data-block') !== undefined,
      )
    const root = draw(PageBuilder.initial)
    const [palette] = Inert.all(root).filter(
      node => Inert.value(node, 'aria-label') === 'Add a block',
    )
    expect(
      Inert.all(palette)
        .filter(node => node.sel === 'h3')
        .map(Inert.text),
    ).toEqual(['Layout', 'Text'])
    // An empty page takes only a Section.
    expect(
      items(root).map(item => [
        Inert.value(item, 'aria-label'),
        Inert.text(item),
        Inert.value(item, 'title'),
        Inert.value(item, 'disabled'),
      ]),
    ).toEqual([
      ['Add Section', 'SectionA band of the page', 'Adds it to the end of the page', false],
      ['Add Heading', 'Heading', 'Select a block that can hold it', true],
      [
        'Add Promo banner',
        'Promo bannerA line that stands out',
        'Select a block that can hold it',
        true,
      ],
    ])
    const titles = (model: Model) => items(draw(model)).map(item => Inert.value(item, 'title'))
    // A Section cannot follow the Banner inside the Section, so it goes last on the page.
    expect(titles(page)).toEqual([
      'Adds it to the end of the page',
      'Adds it after the Promo banner',
      'Adds it after the Promo banner',
    ])
    expect(titles(send(page, Message.Selected({ id: section })))).toEqual([
      'Adds it to the end of the page',
      'Adds it inside the Section',
      'Adds it inside the Section',
    ])
  })

  it('draws the layers as a tree, the tab stop on the selected row', () => {
    const root = draw(page)
    const [tree] = Inert.byRole(root, 'tree')
    expect(Inert.value(tree, 'aria-label')).toBe('Layers')
    const rows = Inert.byRole(root, 'treeitem')
    // A toggle on the row that holds others, the Block's label, and its text in brief.
    expect(
      rows.map(row =>
        Inert.all(row)
          .filter(node => node.sel === 'span')
          .map(Inert.text),
      ),
    ).toEqual([
      ['', 'Section'],
      ['Heading', 'New heading'],
      ['Promo banner', 'Hello'],
    ])
    expect(rows.map(row => Inert.value(row, 'data-block'))).toEqual([
      'Section',
      'Heading',
      'Banner',
    ])
    expect(rows.map(row => Inert.value(row, 'aria-level'))).toEqual(['1', '2', '2'])
    expect(rows.map(row => Inert.value(row, 'aria-selected'))).toEqual(['false', 'false', 'true'])
    expect(Inert.value(rows[0], 'aria-expanded')).toBe('true')
    expect(Inert.value(rows[0], 'id')).toBe(layerId(PageBuilder, section))
    expect(rows.map(row => Inert.value(row, 'tabIndex'))).toEqual([-1, -1, 0])
  })

  it('quotes a node’s first text in brief, on one line', () => {
    const heading = required(
      PageBuilder.document(page).nodes[section]?.regions['body']?.[0],
      'the heading',
    )
    const long = send(
      page,
      Message.Applied({
        op: Composition.Op.setProp(
          heading,
          'text',
          'A heading\n  that runs on well past what a layer row has room to show',
        ),
      }),
    )
    const [, row] = Inert.byRole(draw(long), 'treeitem')
    expect(
      Inert.all(row)
        .filter(node => node.sel === 'span')
        .map(Inert.text),
    ).toEqual(['Heading', 'A heading that runs on well past what a…'])
    // A node whose text is empty says nothing beside its label.
    const empty = send(page, Message.Applied({ op: Composition.Op.setProp(heading, 'text', ' ') }))
    const [, bare] = Inert.byRole(draw(empty), 'treeitem')
    expect(
      Inert.all(bare)
        .filter(node => node.sel === 'span')
        .map(Inert.text),
    ).toEqual(['Heading'])
  })

  it('draws the selected node’s settings under its Block, in parts, each as its Schema calls for', () => {
    const root = draw(page)
    const [inspector] = Inert.all(root).filter(
      node => Inert.value(node, 'aria-label') === 'Properties',
    )
    // The head names the Block, says what it is for, and holds its actions.
    expect(
      Inert.all(inspector)
        .filter(node => node.sel === 'h2')
        .map(Inert.text),
    ).toEqual(['Promo banner'])
    expect(Inert.text(Inert.all(inspector).find(node => node.sel === 'p'))).toBe(
      'A line that stands out',
    )
    const parts = Inert.all(inspector)
      .filter(node => node.sel === 'h3')
      .map(Inert.text)
    expect(parts).toEqual(['Content', 'Style', 'Visibility', 'Interactions'])
    const fields = Inert.all(inspector)
      .filter(node => node.sel === 'label')
      .map(Inert.text)
    expect(fields).toEqual([
      'Text',
      'Size',
      'Columns',
      'Count',
      'Shown',
      'Space',
      'Space at md',
      'Shown when audience is',
      'Shown when beta is',
      'On press',
    ])
    const controls = Inert.all(inspector).filter(node =>
      ['input', 'select', 'code'].includes(node.sel ?? ''),
    )
    expect(
      controls.map(node => [node.sel, Inert.value(node, 'type') ?? Inert.value(node, 'type')]),
    ).toEqual([
      ['input', 'text'],
      ['select', undefined],
      ['select', undefined],
      // A number is typed as text, so "1." is kept while it is being typed.
      ['input', 'text'],
      ['input', 'checkbox'],
      ['select', undefined],
      ['select', undefined],
      ['select', undefined],
      ['select', undefined],
      ['select', undefined],
    ])
    // A look of a few values is buttons, the default pressed; a responsive one stays a select.
    const tone = Inert.all(inspector).find(node => Inert.value(node, 'aria-label') === 'Tone')
    expect(
      Inert.all(tone)
        .filter(node => node.sel === 'button')
        .map(button => [Inert.text(button), Inert.value(button, 'aria-pressed')]),
    ).toEqual([
      ['Default', 'true'],
      ['Plain', 'false'],
      ['Loud', 'false'],
    ])
    const space = Inert.all(controls[5]).filter(node => node.sel === 'option')
    // A value is named by the look's label for it, else spaced.
    expect(space.map(option => [Inert.value(option, 'value'), Inert.text(option)])).toEqual([
      ['', 'default'],
      ['s', 'Small'],
      ['m', 'M'],
    ])
    expect(Inert.value(controls[0], 'value')).toBe('Hello')
    // A number-literal prop is a select of its numbers, as text.
    expect(
      Inert.all(controls[2])
        .filter(node => node.sel === 'option')
        .map(option => [Inert.value(option, 'value'), Inert.value(option, 'selected')]),
    ).toEqual([
      ['1', true],
      ['2', false],
    ])
    expect(Inert.value(controls[3], 'value')).toBe('1')
  })

  it('says how to begin with nothing selected, and lists the shortcuts', () => {
    const root = draw(send(page, Message.Deselected()))
    const [inspector] = Inert.all(root).filter(
      node => Inert.value(node, 'aria-label') === 'Properties',
    )
    expect(Inert.text(Inert.all(inspector).find(node => node.sel === 'p'))).toBe(
      'Select a block on the page or in the layers to change it.',
    )
    const keys = Inert.all(inspector)
      .filter(node => node.sel === 'dt')
      .map(Inert.text)
    expect(keys).toEqual([
      '↑ ↓',
      '← →',
      'Alt+↑',
      'Alt+↓',
      'Alt+←',
      'Alt+→',
      'Ctrl+D',
      'Ctrl+C',
      'Ctrl+X',
      'Delete',
      'Ctrl+Z',
      'Ctrl+Shift+Z',
      'Ctrl+V',
      'Escape',
    ])
    expect(Inert.all(root).some(node => Inert.value(node, 'aria-label') === 'Selected block')).toBe(
      false,
    )
  })

  it('names keys as a Mac does, for an author on one', () => {
    const root = PageView({ ...send(page, Message.Deselected()), platform: 'mac' }, h)
    const keys = Inert.all(root)
      .filter(node => node.sel === 'dt')
      .map(Inert.text)
    expect(keys).toEqual([
      '↑ ↓',
      '← →',
      '⌥↑',
      '⌥↓',
      '⌥←',
      '⌥→',
      '⌘D',
      '⌘C',
      '⌘X',
      'Delete',
      '⌘Z',
      '⇧⌘Z',
      '⌘V',
      'Escape',
    ])
    expect(
      Inert.value(buttonNamed(PageView({ ...page, platform: 'mac' }, h), 'Duplicate'), 'title'),
    ).toBe('Duplicate (⌘D)')
  })

  it('draws the node’s actions and the toolbar from the Builder’s commands', () => {
    // No duplicating, and delete moved to the toolbar.
    const Trimmed = Builder.make('Trimmed', {
      catalog: Site,
      renderer: SiteRenderer,
      starters: { Section: { tone: 'plain' } },
      commands: built =>
        built
          .filter(command => command.id !== 'duplicate')
          .map(command =>
            command.id === 'delete' ? { ...command, placement: ['toolbar'] as const } : command,
          ),
    })
    const root = Inert.draw(BuilderView.define(Trimmed), page)
    const actionsOf = (label: string) =>
      Inert.all(Inert.all(root).find(node => Inert.value(node, 'aria-label') === label))
        .filter(node => node.sel === 'button')
        .map(Inert.text)
    expect(actionsOf('Selected block')).toEqual([
      'Move up',
      'Move down',
      'Move out',
      'Move in',
      'Copy',
      'Cut',
    ])
    // In the table's order, where delete comes first.
    expect(actionsOf('Page actions')).toEqual(['Delete', 'Undo', 'Redo', 'Paste'])
  })

  it('draws the canvas with the data its inputs give each node, as a published page is', () => {
    const fed = PageBuilder.replace(
      PageBuilder.initial,
      Composition.Document.make({
        format: 1,
        roots: [NodeId.make('s')],
        nodes: {
          [NodeId.make('s')]: {
            block: 'Section',
            props: { tone: 'plain' },
            regions: { body: [NodeId.make('f')] },
          },
          [NodeId.make('f')]: { block: 'Feed', props: {}, regions: {} },
        },
      }),
    )
    const feed = (root: Html) =>
      Inert.text(Inert.all(root).find(node => Inert.classes(node).includes('feed')))
    expect(feed(draw(fed))).toBe('waiting for its rows')
    expect(feed(PageView({ ...fed, data: { f: 'three posts' } }, h))).toBe('three posts')
  })

  it('shows a Block the Catalog lacks with its props, and edits none of them', () => {
    const unknown = PageBuilder.replace(
      PageBuilder.initial,
      Composition.Document.make({
        format: 1,
        roots: [NodeId.make('c')],
        nodes: {
          [NodeId.make('c')]: { block: 'Carousel', props: { interval: 5 }, regions: {} },
        },
      }),
    )
    const root = draw(send(unknown, Message.Selected({ id: NodeId.make('c') })))
    const [inspector] = Inert.all(root).filter(
      node => Inert.value(node, 'aria-label') === 'Properties',
    )
    expect(
      Inert.all(inspector)
        .filter(node => node.sel === 'h2')
        .map(Inert.text),
    ).toEqual(['? Carousel'])
    expect(Inert.text(Inert.all(inspector).find(node => node.sel === 'p'))).toBe(
      'This block is not in this version of the application, so its settings cannot be edited here.',
    )
    expect(
      Inert.all(inspector)
        .filter(node => node.sel === 'code')
        .map(Inert.text),
    ).toEqual(['5'])
    expect(
      Inert.all(inspector).some(node => ['input', 'select', 'textarea'].includes(node.sel ?? '')),
    ).toBe(false)
  })

  it('shows a stored value its choices lack as one, not as the blank', () => {
    const banner = some(page.selected, 'the banner')
    const odd = send(
      page,
      Message.Applied({
        op: Composition.Op.batch([
          Composition.Op.setWhen(banner, [{ isNull: 'beta' }, { eq: ['audience', 'member'] }]),
        ]),
      }),
    )
    // Stored straight into the page, as an older version or another tool might have.
    const stray = PageBuilder.replace(
      odd,
      Composition.Document.make({
        ...PageBuilder.document(odd),
        nodes: {
          ...PageBuilder.document(odd).nodes,
          [banner]: {
            ...required(PageBuilder.document(odd).nodes[banner], 'the banner node'),
            appearance: { tone: 'shouty' },
            actions: { press: { action: 'deleteAll' } },
          },
        },
      }),
    )
    const root = draw(send(stray, Message.Selected({ id: banner })))
    const chosen = (suffix: string) =>
      Inert.all(
        Inert.all(root).find(node => String(Inert.value(node, 'id') ?? '').endsWith(suffix)),
      )
        .filter(node => node.sel === 'option' && Inert.value(node, 'selected') === true)
        .map(Inert.text)
    const tone = Inert.all(root).find(node =>
      String(Inert.value(node, 'id') ?? '').endsWith('-appearance-tone'),
    )
    expect(
      Inert.all(tone)
        .filter(node => node.sel === 'button' && Inert.value(node, 'aria-pressed') === 'true')
        .map(button => [Inert.text(button), Inert.value(button, 'disabled')]),
    ).toEqual([['? shouty', true]])
    expect(chosen('-on-press')).toEqual(['? deleteAll'])
    expect(chosen('-when-audience')).toEqual(['member'])
  })

  it('labels a prop by its title, and draws the control its Block asked for', () => {
    const quoted = PageBuilder.replace(
      PageBuilder.initial,
      Composition.Document.make({
        format: 1,
        roots: [NodeId.make('s')],
        nodes: {
          [NodeId.make('s')]: {
            block: 'Section',
            props: { tone: 'plain' },
            regions: { body: [NodeId.make('q')] },
          },
          [NodeId.make('q')]: {
            block: 'Quote',
            props: { text: 'Less is more', source: 'Mies', ref: 'r1' },
            regions: {},
          },
        },
      }),
    )
    const root = draw(send(quoted, Message.Selected({ id: NodeId.make('q') })))
    const [inspector] = Inert.all(root).filter(
      node => Inert.value(node, 'aria-label') === 'Properties',
    )
    expect(
      Inert.all(inspector)
        .filter(node => node.sel === 'label')
        .map(Inert.text),
    ).toEqual(['Quotation', 'Source', 'Shown when audience is', 'Shown when beta is'])
    expect(
      Inert.all(inspector)
        .filter(node => node.sel === 'textarea' || node.sel === 'input')
        .map(node => [node.sel, Inert.value(node, 'value')]),
    ).toEqual([
      ['textarea', 'Less is more'],
      ['input', 'Mies'],
    ])
  })

  it('previews the page as a context, and marks what it hides there', () => {
    const banner = some(page.selected, 'the banner')
    const members = send(
      page,
      Message.Applied({
        op: Composition.Op.setWhen(banner, [Composition.when.eq('audience', 'member')]),
      }),
    )
    const root = draw(members)
    const [preview] = Inert.all(root).filter(
      node => Inert.value(node, 'aria-label') === 'Preview as',
    )
    const selects = Inert.all(preview).filter(node => node.sel === 'select')
    const options = selects.map(select =>
      Inert.all(select)
        .filter(node => node.sel === 'option')
        .map(option => [Inert.value(option, 'value'), Inert.value(option, 'selected')]),
    )
    expect(options).toEqual([
      [
        ['', false],
        ['guest', true],
        ['member', false],
      ],
      [
        ['', true],
        ['true', false],
        ['false', false],
      ],
    ])
    const hidden = Inert.all(root).find(
      node => Inert.value(node, 'data-composition-hidden') !== undefined,
    )
    expect(Inert.value(hidden, 'data-composition-node')).toBe(banner)
    // The inspector shows the condition it holds.
    const [inspector] = Inert.all(root).filter(
      node => Inert.value(node, 'aria-label') === 'Properties',
    )
    const when = Inert.all(inspector).find(
      node => Inert.value(node, 'id') === `PageBuilder-${banner}-when-audience`,
    )
    expect(
      Inert.all(when)
        .filter(node => node.sel === 'option' && Inert.value(node, 'selected') === true)
        .map(Inert.text),
    ).toEqual(['member'])
    // As a member, it shows.
    const asMember = draw(
      send(members, Message.PreviewChosen({ key: 'audience', value: 'member' })),
    )
    expect(
      Inert.all(asMember).some(node => Inert.value(node, 'data-composition-hidden') !== undefined),
    ).toBe(false)
  })

  it('draws the page in edit mode, in a frame as wide as the viewport, marking the selection', () => {
    const narrow = send(page, Message.ViewportChosen({ viewport: 'narrow' }))
    const root = draw(narrow)
    const frame = Inert.all(root).find(
      node => node.sel === 'div' && Inert.value(node, 'data-viewport') !== undefined,
    )
    expect(Inert.value(frame, 'data-viewport')).toBe('narrow')
    // The width is a variable on the frame, read by the Builder's default rule.
    expect(frame?.data?.style).toMatchObject({ '--fk-frame-width': viewportWidths.narrow })
    const frameClasses = Object.keys(frame?.data?.class ?? {}).join(' ')
    expect(Style.usedIn(`class="${frameClasses}"`)).toContain('max-width:var(--fk-frame-width)')
    const selected = Inert.all(frame).find(
      node => Inert.value(node, 'data-composition-mark') === 'selected',
    )
    expect(Inert.value(selected, 'data-composition-node')).toBe(
      some(narrow.selected, 'the selection'),
    )
    expect(Inert.value(buttonNamed(root, 'Narrow'), 'aria-pressed')).toBe('true')
    expect(Inert.text(frame)).toBe('New headingHello')
  })

  it('marks the row and the node a drag is over, only where the drop would land', () => {
    const heading = required(
      PageBuilder.document(page).nodes[section]?.regions['body']?.[0],
      'the heading',
    )
    const banner = some(page.selected, 'the banner')
    const dragging = send(page, Message.DragStarted({ source: { _tag: 'Existing', id: heading } }))
    const over = send(dragging, Message.DraggedOver({ id: banner, zone: 'after' }))
    const root = draw(over)
    const rows = Inert.byRole(root, 'treeitem')
    expect(rows.map(row => Inert.value(row, 'data-builder-row'))).toEqual([
      section,
      heading,
      banner,
    ])
    expect(rows.map(row => Inert.value(row, 'data-builder-drop'))).toEqual([
      undefined,
      undefined,
      'after',
    ])
    expect(rows.map(row => Inert.value(row, 'data-builder-dragging'))).toEqual([
      undefined,
      '',
      undefined,
    ])
    const dropped = Inert.all(root).find(
      node => Inert.value(node, 'data-composition-drop') !== undefined,
    )
    expect(Inert.value(dropped, 'data-composition-node')).toBe(banner)
    expect(Inert.value(dropped, 'data-composition-drop')).toBe('after')
    // A Heading may not go before the Section, at the root: nothing is marked.
    const refused = draw(send(dragging, Message.DraggedOver({ id: section, zone: 'before' })))
    expect(
      Inert.all(refused).some(node => Inert.value(node, 'data-builder-drop') !== undefined),
    ).toBe(false)
    expect(
      Inert.all(refused).some(node => Inert.value(node, 'data-composition-drop') !== undefined),
    ).toBe(false)
  })

  it('shows a refusal, and the live region the Builder speaks through', () => {
    const refused = send(
      page,
      Message.Applied({
        op: Composition.Op.move(some(page.selected, 'the banner'), Composition.root(0)),
      }),
    )
    const root = draw(refused)
    expect(Inert.text(Inert.byRole(root, 'alert')[0])).toBe(
      'a root must be Section, and "' + some(page.selected, 'the banner') + '" is a Banner',
    )
    expect(Inert.all(root).some(node => Inert.value(node, 'aria-live') === 'assertive')).toBe(true)
  })

  it('says how to begin on an empty page, and nothing of it once there is a block', () => {
    const hint = (model: Model) =>
      Inert.all(draw(model))
        .filter(node => Inert.text(node).startsWith('This page is empty.') && node.sel === 'p')
        .map(Inert.text)
    expect(hint(PageBuilder.initial)).toEqual([
      'This page is empty. Add a block to begin: the palette offers what can go here.',
    ])
    expect(hint(page)).toEqual([])
  })

  it('says where the selection is, from the page down, the last one current', () => {
    const crumbs = (model: Model) => {
      const [trail] = Inert.all(draw(model)).filter(
        node => Inert.value(node, 'aria-label') === 'Where the selection is',
      )
      return Inert.all(trail)
        .filter(node => node.sel === 'button')
        .map(button => [Inert.text(button), Inert.value(button, 'aria-current')])
    }
    expect(crumbs(page)).toEqual([
      ['Page', undefined],
      ['Section', undefined],
      ['Promo banner', 'location'],
    ])
    expect(crumbs(send(page, Message.Deselected()))).toEqual([['Page', 'location']])
  })

  it('offers the selected node’s actions as the shortcuts would send them', () => {
    const root = draw(page)
    expect(Inert.value(buttonNamed(root, 'Move up'), 'disabled')).toBe(false)
    expect(Inert.value(buttonNamed(root, 'Duplicate'), 'title')).toBe('Duplicate (Ctrl+D)')
    expect(Inert.value(buttonNamed(root, 'Move down'), 'disabled')).toBe(true)
    expect(Inert.value(buttonNamed(root, 'Undo'), 'disabled')).toBe(false)
    expect(Inert.value(buttonNamed(root, 'Redo'), 'disabled')).toBe(true)
  })
})

describe('its customization contract', () => {
  // A Featured node selected, with its pickers' choices given: options and checkboxes.
  const featured = send(
    PageBuilder.replace(
      PageBuilder.initial,
      Composition.Document.make({
        format: 1,
        roots: [NodeId.make('s')],
        nodes: {
          [NodeId.make('s')]: {
            block: 'Section',
            props: { tone: 'plain' },
            regions: { body: [NodeId.make('f')] },
          },
          [NodeId.make('f')]: {
            block: 'Featured',
            props: { category: null, maker: 'c1', tags: ['t1'] },
            regions: {},
          },
        },
      }),
    ),
    Message.Selected({ id: NodeId.make('f') }),
  )
  const options = {
    'Featured.category': [{ value: 'c1', label: 'Oak' }],
    'Featured.tags': [{ value: 't1', label: 'Pine' }],
  }

  // The page on the canvas is the application's markup, and the live region's
  // is LiveAnnounce's, visually hidden: neither is the Builder's to publish.
  it.each([
    ['an empty page', PageBuilder.initial],
    ['a node with every kind of prop selected', page],
    ['nothing selected', send(page, Message.Deselected())],
    ['a node with pickers selected', { ...featured, options }],
  ])('draws everything through its Slots, with no fixed inline style: %s', (_, model) => {
    const root = Inert.draw(PageView, model)
    const inside = ['frame', 'live']
    expect(Inert.unslotted(root, { inside })).toEqual([])
    expect(Inert.fixedInline(root, { inside })).toEqual([])
  })
})

describe('the settings forms’ look', () => {
  it('attaches the Styles it is given to every Block’s settings form', () => {
    const Looked = BuilderView.define(PageBuilder, {
      settings: {
        field: Style.attach(Style.forSlots(FieldSlots)({ root: Style.class('setting') })),
        form: Style.attach(Style.forSlots(FormSlots)({ root: Style.class('settings') })),
      },
    })
    const [inspector] = Inert.all(Inert.draw(Looked, page)).filter(
      node => Inert.value(node, 'aria-label') === 'Properties',
    )
    const classed = (name: string) =>
      Inert.all(inspector).filter(node => Inert.classes(node).includes(name))
    expect(classed('settings')).toHaveLength(1)
    // One per prop the Banner's form draws.
    expect(classed('setting')).toHaveLength(5)
  })
})

describe('a control kind of the application’s own', () => {
  // An amount in cents, in a currency: a kind an application registers once.
  const Cents = Input.kind<{ readonly currency: string }>('Cents', {
    draft: 'text',
    parse: text => (/^\d+$/.test(text) ? Number(text) : undefined),
    unparsed: 'Enter a whole number of cents',
  })
  const renderers = <Message>(): Renderers<Message> => ({
    [Cents.kind]: ({ control, state, draft, change, slots, h }) =>
      h.input(
        slots.text.attrs([
          ...state,
          h.Value(String(draft)),
          h.OnInput(change),
          h.DataAttribute('currency', Cents.is(control) ? control.data.currency : ''),
        ]),
      ),
  })
  const Price = Block.define('Price', {
    Props: Schema.Struct({ cents: Schema.Number }),
    provides: [Content.Section],
  }).pipe(Block.annotate(Builder.controls({ cents: Cents.of({ currency: 'USD' }) })))
  const Prices = Catalog.make({ blocks: [Price], roots: [Content.Section] })
  const Priced = Builder.make('Priced', {
    catalog: Prices,
    renderer: Renderer.make(Prices, { Price: ({ props, h }) => h.p([], [String(props.cents)]) }),
    starters: { Price: { cents: 100 } },
  })
  const price = NodeId.make('price')
  const selected = Priced.bundle.update(
    Priced.replace(
      Priced.initial,
      Composition.Document.make({
        format: 1,
        roots: [price],
        nodes: { [price]: { block: 'Price', props: { cents: 250 }, regions: {} } },
      }),
    ),
    Message.Selected({ id: price }),
    undefined,
  ).model

  it('draws it in the inspector with the renderers the Builder is given', () => {
    const View = BuilderView.define(Priced, { settings: { renderers } })
    const [field] = Inert.all(Inert.draw(View, selected)).filter(
      node => Inert.value(node, 'data-currency') === 'USD',
    )
    expect(Inert.value(field, 'value')).toBe('250')
  })

  it('says which renderer is missing when it is not given one', () => {
    expect(() => Inert.draw(BuilderView.define(Priced), selected)).toThrow(
      'no renderer for a "Cents" control ("cents")',
    )
  })
})

describe('a layout of its own', () => {
  const parts = BuilderView.parts(PageBuilder)
  // The page and its palette only, beside an element of the application's own.
  const Compact = BuilderView.assemble((_input, slots, h, draw) =>
    h.div(slots.root.attrs(), [h.h1([], ['Home page']), draw(parts.Palette), draw(parts.Canvas)]),
  )

  it('draws only the parts it places, around its own markup', () => {
    const root = Inert.draw(Compact, page)
    expect(Inert.text(Inert.byTag(root, 'h1')[0])).toBe('Home page')
    expect(Inert.bySlot(root, 'palette')).toHaveLength(1)
    expect(Inert.bySlot(root, 'canvas')).toHaveLength(1)
    expect(Inert.bySlot(root, 'tree')).toEqual([])
    expect(Inert.bySlot(root, 'inspector')).toEqual([])
  })

  it('brings the Behaviors of the parts it places', () => {
    const [canvas] = Inert.bySlot(Inert.draw(Compact, page), 'canvas')
    // The shortcuts come with the Canvas part, not with the default layout.
    expect(Object.keys(canvas?.data?.on ?? {})).toContain('keydown')
  })
})

describe('its Behaviors', () => {
  // Each part's Behaviors, resolved as the part resolves them.
  const parts = BuilderView.parts(PageBuilder)
  const layers = SlotView.buildersFor(BuilderSlots, parts.Layers.mixins, { input: page, h })
  const canvas = SlotView.buildersFor(BuilderSlots, parts.Canvas.mixins, { input: page, h })

  it.each([
    ['layers', layers.layers],
    ['canvas', canvas.canvas],
  ] as const)('takes the editor’s shortcuts on the %s', (slot, builder) => {
    const handler = Attributes.find(builder.attrs(), 'OnKeyDownPreventDefault')?.f
    if (handler === undefined) throw new Error(`no shortcuts on the ${slot}`)
    const up = handler('ArrowUp', { shiftKey: false, ctrlKey: false, altKey: true, metaKey: false })
    expect(up._tag === 'Some' && up.value._tag).toBe('Applied')
    expect(
      handler('x', { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false })._tag,
    ).toBe('None')
  })

  it('moves focus in the tree, and watches the tree and the canvas for the pointer', () => {
    expect(Attributes.find(layers.tree.attrs(), 'OnKeyDownFocus')).toBeDefined()
    expect(Attributes.find(layers.tree.attrs(), 'OnMount')).toBeDefined()
    expect(Attributes.find(canvas.canvas.attrs(), 'OnMount')).toBeDefined()
  })

  it('meets the tree’s accessibility contract', () => {
    const TreePattern = A11y.pattern({
      tree: { capability: Capability.Interactive },
      row: { capability: Capability.Focusable },
    })
    expect(A11y.validate(TreePattern, BuilderSlots)).toEqual([])
  })

  it('lists every node as a row, in document order, with its parent', () => {
    expect(
      rowsOf(PageBuilder.document(page)).map(row => [row.parent === null, row.branch]),
    ).toEqual([
      [true, true],
      [false, false],
      [false, false],
    ])
  })
})
