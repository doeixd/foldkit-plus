/**
 * The drawn Builder, rendered inert: what each Slot draws, the tree's ARIA,
 * the inspector's controls by prop kind, the canvas's frame and marks, and the
 * Behaviors attached to the layers, the tree and the canvas.
 */
import { Composition, NodeId } from 'foldkit-composition'
import { Message, type Model } from 'foldkit-builder'
import { Attributes, A11y, Capability, SlotView } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { BuilderSlots, layerId, rowsOf, viewportWidths } from 'foldkit-mixins-builder'
import { PageBuilder, PageView, answer, isTimer } from './fixture.js'

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
    expect(fields).toEqual(['text', 'size', 'count', 'shown'])
    const controls = all(inspector).filter(node =>
      ['input', 'select', 'code'].includes(node.sel ?? ''),
    )
    expect(controls.map(node => [node.sel, attr(node, 'type') ?? prop(node, 'type')])).toEqual([
      ['input', undefined],
      ['select', undefined],
      ['input', undefined],
      ['input', 'checkbox'],
    ])
    expect(prop(controls[0], 'value')).toBe('Hello')
    expect(prop(controls[2], 'value')).toBe('1')
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

  it('moves focus in the tree, and watches the canvas for the node under the pointer', () => {
    expect(Attributes.find(builders.tree.attrs(), 'OnKeyDownFocus')).toBeDefined()
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
    expect(NodeId.make(section)).toBe(section)
  })
})
