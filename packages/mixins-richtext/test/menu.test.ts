// @vitest-environment jsdom
/**
 * The slash menu's view: what it draws for a caret, that its slots carry each entry's
 * id, and that a click sends the entry's own Message — while the highlight, the query,
 * and the keys stay `slashMenu`'s and `slashMove`'s.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Behavior, Capability, SlotView, Style } from 'foldkit-mixins'
import { Scene } from 'foldkit/test'
import type { HtmlBuilder } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import {
  SlashMenuSlots,
  slashEntries,
  slashMenuView,
  type SlashEntry,
  type SlashMenuInput,
} from '../src/index.js'

const Message = defineMessageUnion({ Chose: { entry: Schema.String } })
type Message = typeof Message.Type

/** A rendered vnode, as much of it as these tests read. */
interface Node {
  readonly sel?: string
  readonly text?: string
  readonly data?: {
    readonly attrs?: Readonly<Record<string, unknown>>
    readonly class?: Readonly<Record<string, boolean>>
    readonly on?: { readonly click?: unknown }
  }
  readonly children?: ReadonlyArray<Node>
}

const all = (node: Node): ReadonlyArray<Node> => [node, ...(node.children ?? []).flatMap(all)]
const items = (root: Node): ReadonlyArray<Node> =>
  all(root).filter(node => node.data?.attrs?.['data-entry'] !== undefined)
const nodeFor = (root: Node, entry: string): Node | undefined =>
  items(root).find(node => node.data?.attrs?.['data-entry'] === entry)
const labels = (root: Node): ReadonlyArray<string> =>
  items(root).map(node => node.text ?? node.children?.[0]?.text ?? '')
const classes = (node: Node | undefined): ReadonlyArray<string> =>
  Object.keys(node?.data?.class ?? {})

const catalogue = (): ReadonlyArray<SlashEntry<Message>> => [
  {
    id: 'paragraph',
    label: 'Paragraph',
    keywords: ['text'],
    message: Message.Chose({ entry: 'paragraph' }),
  },
  {
    id: 'heading-1',
    label: 'Heading 1',
    keywords: ['h1'],
    message: Message.Chose({ entry: 'heading-1' }),
  },
]

const input = (overrides: Partial<SlashMenuInput<Message>> = {}): SlashMenuInput<Message> => ({
  entries: catalogue(),
  textBefore: '/',
  index: 0,
  ...overrides,
})

const render = (
  view = slashMenuView<Message>(),
  overrides: Partial<SlashMenuInput<Message>> = {},
): Node => view(input(overrides), SlotView.inertBuilder()) as unknown as Node

describe('the slash menu view', () => {
  it('draws an item per match, in order, the highlighted one current', () => {
    const root = render(undefined, { index: 1 })
    expect(labels(root)).toEqual(['Paragraph', 'Heading 1'])
    expect(nodeFor(root, 'paragraph')?.data?.attrs?.['aria-current']).toBe('false')
    expect(nodeFor(root, 'heading-1')?.data?.attrs?.['aria-current']).toBe('true')
    expect(
      all(root).find(node => node.data?.attrs?.['role'] === 'menu')?.data?.attrs?.['role'],
    ).toBe('menu')
    expect(nodeFor(root, 'heading-1')?.data?.attrs?.['role']).toBe('menuitem')
  })

  it('narrows to the query, and marks the first match when the index is stale', () => {
    const root = render(undefined, { textBefore: '/h1', index: 4 })
    expect(labels(root)).toEqual(['Heading 1'])
    expect(root.children?.[0]?.children?.length).toBe(1)
    expect(nodeFor(root, 'heading-1')?.data?.attrs?.['aria-current']).toBe('true')
  })

  it('draws the catalogue this package ships', () => {
    const root = render(undefined, {
      entries: slashEntries(message => Message.Chose({ entry: message._tag })),
    })
    expect(labels(root)).toEqual([
      'Paragraph',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bold',
      'Italic',
      'Code',
    ])
  })

  it('is an empty list outside a query, and when nothing matches', () => {
    expect(items(render(undefined, { textBefore: 'a sentence' }))).toEqual([])
    expect(items(render(undefined, { textBefore: '/zzz' }))).toEqual([])
  })

  it('takes a Style on its slots', () => {
    const styled = slashMenuView<Message>().pipe(
      Style.attach(Style.forSlots(SlashMenuSlots)({ item: Style.class('entry') })),
    )
    expect(classes(nodeFor(render(styled), 'paragraph'))).toEqual(['entry'])
  })

  it('hands a Behavior each entry id as its slot item id', () => {
    const labelled = slashMenuView<Message>().pipe(
      Behavior.attach(
        Behavior.forSlots(SlashMenuSlots)<SlashMenuInput<Message>, Message>({
          item: Behavior.slot({
            requires: { capability: Capability.Interactive },
            attributes: ({ item, h }) => [h.DataAttribute('entry-id', item?.id ?? '')],
          }),
        }),
      ),
    )
    const root = render(labelled)
    expect(nodeFor(root, 'paragraph')?.data?.attrs?.['data-entry-id']).toBe('paragraph')
    expect(nodeFor(root, 'heading-1')?.data?.attrs?.['data-entry-id']).toBe('heading-1')
  })
})

describe('the slash menu in an application', () => {
  interface Model {
    readonly textBefore: string
    readonly index: number
    readonly last: string
  }
  const update = (model: Model, message: Message): { readonly model: Model } => ({
    model: { ...model, last: message.entry },
  })
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        slashMenuView<Message>()(
          { entries: catalogue(), textBefore: model.textBefore, index: model.index },
          h,
        ),
        h.p([h.Id('last')], [model.last]),
      ],
    )

  it('sends the entry its own item was drawn for', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ textBefore: '/', index: 0, last: '' }),
      Scene.click('[data-entry="heading-1"]'),
      Scene.expect(Scene.selector('#last')).toHaveText('heading-1'),
    )
  })
})
