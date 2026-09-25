/**
 * The drawn Builder, rendered inert: what each Slot draws, the tree's ARIA,
 * the inspector's controls by prop kind, the canvas's frame and marks, and the
 * Behaviors attached to the layers, the tree and the canvas.
 */
import { Block, Composition, NodeId } from 'foldkit-composition'
import { Input } from 'foldkit-form'
import { Metadata } from 'foldkit-metadata'
import { Message, type Model } from 'foldkit-builder'
import { Attributes, A11y, Capability, SlotView } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { BuilderSlots, BuilderView, layerId, rowsOf, viewportWidths } from 'foldkit-mixins-builder'
import { PageBuilder, PageView, Quote, answer, isTimer } from './fixture.js'

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
const classOf = (node: Node | undefined): ReadonlyArray<string> =>
  Object.keys(node?.data?.class ?? {}).filter(name => node?.data?.class?.[name] === true)
const prop = (node: Node | undefined, key: string): unknown => node?.data?.props?.[key]
const byRole = (root: Html, role: string) => all(root).filter(node => attr(node, 'role') === role)
const buttonNamed = (root: Html, name: string) =>
  all(root).find(node => node.sel === 'button' && text(node) === name)

const required = <A>(value: A | null | undefined, what: string): A => {
  if (value === undefined || value === null) throw new Error(`expected ${what}`)
  return value
}

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
      at: required(
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
  it('offers each Block with starting props, for where the selection says it goes', () => {
    const root = draw(PageBuilder.initial)
    expect(
      all(root)
        .filter(node => node.sel === 'button' && text(node).startsWith('Add '))
        .map(text),
    ).toEqual(['Add Section', 'Add Heading', 'Add Banner'])
    // An empty page takes only a Section.
    expect(prop(buttonNamed(root, 'Add Heading'), 'disabled')).toBe(true)
    expect(prop(buttonNamed(root, 'Add Section'), 'disabled')).toBe(false)
  })

  it('draws the layers as a tree, the tab stop on the selected row', () => {
    const root = draw(page)
    const [tree] = byRole(root, 'tree')
    expect(attr(tree, 'aria-label')).toBe('Layers')
    const rows = byRole(root, 'treeitem')
    expect(rows.map(text)).toEqual(['Section', 'Heading', 'Banner'])
    expect(rows.map(row => attr(row, 'aria-level'))).toEqual(['1', '2', '2'])
    expect(rows.map(row => attr(row, 'aria-selected'))).toEqual(['false', 'false', 'true'])
    expect(attr(rows[0], 'aria-expanded')).toBe('true')
    expect(prop(rows[0], 'id')).toBe(layerId(PageBuilder, section))
    expect(rows.map(row => prop(row, 'tabIndex'))).toEqual([-1, -1, 0])
  })

  it('draws the selected node’s props, each as the control its Schema calls for', () => {
    const root = draw(page)
    const [inspector] = all(root).filter(node => attr(node, 'aria-label') === 'Properties')
    const fields = all(inspector)
      .filter(node => node.sel === 'label')
      .map(text)
    expect(fields).toEqual([
      'text',
      'size',
      'count',
      'shown',
      'tone',
      'space',
      'space at md',
      'when audience',
      'when beta',
      'on press',
    ])
    const controls = all(inspector).filter(node =>
      ['input', 'select', 'code'].includes(node.sel ?? ''),
    )
    expect(controls.map(node => [node.sel, attr(node, 'type') ?? prop(node, 'type')])).toEqual([
      ['input', undefined],
      ['select', undefined],
      ['input', undefined],
      ['input', 'checkbox'],
      ['select', undefined],
      ['select', undefined],
      ['select', undefined],
      ['select', undefined],
      ['select', undefined],
      ['select', undefined],
    ])
    // The look's axis offers its values and a blank for the default, which is chosen.
    const tone = all(controls[4]).filter(node => node.sel === 'option')
    expect(tone.map(option => [prop(option, 'value'), text(option)])).toEqual([
      ['', 'default'],
      ['plain', 'plain'],
      ['loud', 'loud'],
    ])
    expect(tone.map(option => prop(option, 'selected'))).toEqual([true, false, false])
    expect(prop(controls[0], 'value')).toBe('Hello')
    expect(prop(controls[2], 'value')).toBe('1')
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
    const feed = (root: Html) => text(all(root).find(node => classOf(node).includes('feed')))
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
    const [inspector] = all(root).filter(node => attr(node, 'aria-label') === 'Properties')
    expect(text(inspector)).toBe(
      'This block is not in this version of the application, so its settings cannot be edited here.interval5',
    )
    expect(
      all(inspector).some(node => ['input', 'select', 'textarea'].includes(node.sel ?? '')),
    ).toBe(false)
  })

  it('shows a stored value its choices lack as one, not as the blank', () => {
    const banner = required(page.selected, 'the banner')
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
      all(all(root).find(node => String(prop(node, 'id') ?? '').endsWith(suffix)))
        .filter(node => node.sel === 'option' && prop(node, 'selected') === true)
        .map(text)
    expect(chosen('-appearance-tone')).toEqual(['? shouty'])
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
    const [inspector] = all(root).filter(node => attr(node, 'aria-label') === 'Properties')
    expect(
      all(inspector)
        .filter(node => node.sel === 'label')
        .map(text),
    ).toEqual(['Quotation', 'source', 'when audience', 'when beta'])
    expect(
      all(inspector)
        .filter(node => node.sel === 'textarea' || node.sel === 'input')
        .map(node => [node.sel, prop(node, 'value')]),
    ).toEqual([
      ['textarea', 'Less is more'],
      ['input', 'Mies'],
    ])
  })

  it('keeps every prop two annotations ask for, the later one winning a prop', () => {
    const annotated = Block.annotate(
      BuilderView.controls({ source: Input.multiline(), ref: Input.text() }),
    )(Quote)
    expect(Metadata.summarize(annotated.metadata)).toEqual([
      {
        name: 'foldkit-mixins-builder/controls',
        entries: ['text: Multiline, ref: Text, source: Multiline'],
      },
    ])
  })

  it('previews the page as a context, and marks what it hides there', () => {
    const banner = required(page.selected, 'the banner')
    const members = send(
      page,
      Message.Applied({
        op: Composition.Op.setWhen(banner, [Composition.when.eq('audience', 'member')]),
      }),
    )
    const root = draw(members)
    const [preview] = all(root).filter(node => attr(node, 'aria-label') === 'Preview as')
    const selects = all(preview).filter(node => node.sel === 'select')
    const options = selects.map(select =>
      all(select)
        .filter(node => node.sel === 'option')
        .map(option => [prop(option, 'value'), prop(option, 'selected')]),
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
    const hidden = all(root).find(node => attr(node, 'data-composition-hidden') !== undefined)
    expect(attr(hidden, 'data-composition-node')).toBe(banner)
    // The inspector shows the condition it holds.
    const [inspector] = all(root).filter(node => attr(node, 'aria-label') === 'Properties')
    const when = all(inspector).find(
      node => prop(node, 'id') === `PageBuilder-${banner}-when-audience`,
    )
    expect(
      all(when)
        .filter(node => node.sel === 'option' && prop(node, 'selected') === true)
        .map(text),
    ).toEqual(['member'])
    // As a member, it shows.
    const asMember = draw(
      send(members, Message.PreviewChosen({ key: 'audience', value: 'member' })),
    )
    expect(all(asMember).some(node => attr(node, 'data-composition-hidden') !== undefined)).toBe(
      false,
    )
  })

  it('draws the page in edit mode, in a frame as wide as the viewport, marking the selection', () => {
    const narrow = send(page, Message.ViewportChosen({ viewport: 'narrow' }))
    const root = draw(narrow)
    const frame = all(root).find(node => attr(node, 'data-viewport') !== undefined)
    expect(attr(frame, 'data-viewport')).toBe('narrow')
    expect(frame?.data?.style).toMatchObject({ 'max-width': viewportWidths.narrow })
    const selected = all(frame).find(node => attr(node, 'data-composition-selected') !== undefined)
    expect(attr(selected, 'data-composition-node')).toBe(narrow.selected)
    expect(attr(buttonNamed(root, 'narrow'), 'aria-pressed')).toBe('true')
    expect(text(frame)).toBe('New headingHello')
  })

  it('marks the row and the node a drag is over, only where the drop would land', () => {
    const heading = required(
      PageBuilder.document(page).nodes[section]?.regions['body']?.[0],
      'the heading',
    )
    const banner = required(page.selected, 'the banner')
    const dragging = send(page, Message.DragStarted({ id: heading }))
    const over = send(dragging, Message.DraggedOver({ over: { id: banner, zone: 'after' } }))
    const root = draw(over)
    const rows = byRole(root, 'treeitem')
    expect(rows.map(row => attr(row, 'data-builder-row'))).toEqual([section, heading, banner])
    expect(rows.map(row => attr(row, 'data-builder-drop'))).toEqual([undefined, undefined, 'after'])
    expect(rows.map(row => attr(row, 'data-builder-dragging'))).toEqual([undefined, '', undefined])
    const dropped = all(root).find(node => attr(node, 'data-composition-drop') !== undefined)
    expect(attr(dropped, 'data-composition-node')).toBe(banner)
    expect(attr(dropped, 'data-composition-drop')).toBe('after')
    // A Heading may not go before the Section, at the root: nothing is marked.
    const refused = draw(
      send(dragging, Message.DraggedOver({ over: { id: section, zone: 'before' } })),
    )
    expect(all(refused).some(node => attr(node, 'data-builder-drop') !== undefined)).toBe(false)
    expect(all(refused).some(node => attr(node, 'data-composition-drop') !== undefined)).toBe(false)
  })

  it('shows a refusal, and the live region the Builder speaks through', () => {
    const refused = send(
      page,
      Message.Applied({
        op: Composition.Op.move(required(page.selected, 'the banner'), Composition.root(0)),
      }),
    )
    const root = draw(refused)
    expect(text(byRole(root, 'alert')[0])).toBe(
      'a root must be Section, and "' + page.selected + '" is a Banner',
    )
    expect(all(root).some(node => attr(node, 'aria-live') === 'assertive')).toBe(true)
  })

  it('offers the selected node’s actions as the shortcuts would send them', () => {
    const root = draw(page)
    expect(prop(buttonNamed(root, 'Move up'), 'disabled')).toBe(false)
    expect(prop(buttonNamed(root, 'Move down'), 'disabled')).toBe(true)
    expect(prop(buttonNamed(root, 'Undo'), 'disabled')).toBe(false)
    expect(prop(buttonNamed(root, 'Redo'), 'disabled')).toBe(true)
  })
})

describe('its Behaviors', () => {
  const builders = SlotView.buildersFor(BuilderSlots, PageView.mixins, { input: page, h })

  it('takes the editor’s shortcuts on the layers panel', () => {
    const handler = Attributes.find(builders.layers.attrs(), 'OnKeyDownPreventDefault')?.f
    if (handler === undefined) throw new Error('no shortcuts on the layers panel')
    const up = handler('ArrowUp', { shiftKey: false, ctrlKey: false, altKey: true, metaKey: false })
    expect(up._tag === 'Some' && up.value._tag).toBe('Applied')
    expect(
      handler('x', { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false })._tag,
    ).toBe('None')
  })

  it('moves focus in the tree, and watches the tree and the canvas for the pointer', () => {
    expect(Attributes.find(builders.tree.attrs(), 'OnKeyDownFocus')).toBeDefined()
    expect(Attributes.find(builders.tree.attrs(), 'OnMount')).toBeDefined()
    expect(Attributes.find(builders.canvas.attrs(), 'OnMount')).toBeDefined()
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
