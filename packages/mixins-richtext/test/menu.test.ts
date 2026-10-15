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
import { Inert, type Node } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'

const Message = defineMessageUnion({ Chose: { entry: Schema.String } })
type Message = typeof Message.Type

const items = (root: Html): ReadonlyArray<Node> =>
  Inert.all(root).filter(node => node.data?.attrs?.['data-entry'] !== undefined)
const nodeFor = (root: Html, entry: string): Node | undefined =>
  items(root).find(node => node.data?.attrs?.['data-entry'] === entry)
/** Each item's first words, its label: an icon before it draws none. */
const labels = (root: Html): ReadonlyArray<string> =>
  items(root).map(node => Inert.all(node).find(each => (each.text ?? '').length > 0)?.text ?? '')
const texts = (root: Html): ReadonlyArray<string> =>
  Inert.all(root).flatMap(node => (node.text === undefined ? [] : [node.text]))

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
): Html => view(input(overrides), SlotView.inertBuilder())

describe('the slash menu view', () => {
  it('draws an item per match, in order, the highlighted one current', () => {
    const root = render(undefined, { index: 1 })
    expect(labels(root)).toEqual(['Paragraph', 'Heading 1'])
    expect(nodeFor(root, 'paragraph')?.data?.attrs?.['aria-current']).toBe('false')
    expect(nodeFor(root, 'heading-1')?.data?.attrs?.['aria-current']).toBe('true')
    expect(
      Inert.all(root).find(node => node.data?.attrs?.['role'] === 'menu')?.data?.attrs?.['role'],
    ).toBe('menu')
    expect(nodeFor(root, 'heading-1')?.data?.attrs?.['role']).toBe('menuitem')
  })

  it('narrows to the query, and marks the first match when the index is stale', () => {
    const root = render(undefined, { textBefore: '/h1', index: 4 })
    expect(labels(root)).toEqual(['Heading 1'])
    expect(Inert.children(Inert.children(root)[0])).toHaveLength(1)
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
      'Quote',
      'Bulleted list',
      'Numbered list',
      'Code block',
      'Bold',
      'Italic',
      'Code',
    ])
  })

  it('heads each group while no query narrows it, and lists the best matches first after', () => {
    const grouped = (): ReadonlyArray<SlashEntry<Message>> => [
      { ...catalogue()[0]!, group: 'Text', description: 'Plain text' },
      {
        id: 'bold',
        label: 'Bold',
        keywords: ['strong'],
        message: Message.Chose({ entry: 'bold' }),
        group: 'Formatting',
      },
      { ...catalogue()[1]!, group: 'Text' },
    ]
    const all = render(undefined, { entries: grouped() })
    // A group's entries come together, under one heading, in the order the keys move.
    expect(labels(all)).toEqual(['Paragraph', 'Heading 1', 'Bold'])
    expect(texts(all)).toEqual([
      'Text',
      'Paragraph',
      'Plain text',
      'Heading 1',
      'Formatting',
      'Bold',
    ])
    // `/b` starts no label but Bold's; a word in a label beats a keyword; no headings.
    const narrowed = render(undefined, { entries: grouped(), textBefore: '/b' })
    expect(texts(narrowed)).toEqual(['Bold'])
    // A label's start beats a keyword's, whatever the catalogue's order.
    const ranked = render(undefined, {
      entries: [
        {
          id: 'other',
          label: 'Other',
          keywords: ['heading-like'],
          message: Message.Chose({ entry: 'other' }),
        },
        ...catalogue(),
      ],
      textBefore: '/head',
    })
    expect(labels(ranked)).toEqual(['Heading 1', 'Other'])
  })

  it('says when nothing matches', () => {
    expect(texts(render(undefined, { textBefore: '/zzz' }))).toEqual(['No matches'])
  })

  it('is an empty list outside a query, and when nothing matches', () => {
    expect(items(render(undefined, { textBefore: 'a sentence' }))).toEqual([])
    expect(items(render(undefined, { textBefore: '/zzz' }))).toEqual([])
  })

  it('takes a Style on its slots', () => {
    const styled = slashMenuView<Message>().pipe(
      Style.attach(Style.forSlots(SlashMenuSlots)({ item: Style.class('entry') })),
    )
    expect(Inert.classes(nodeFor(render(styled), 'paragraph'))).toEqual(['entry'])
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

describe('its customization contract', () => {
  it.each([
    ['a menu with matches', input()],
    ['a menu with none', input({ textBefore: '/nothing' })],
  ])('draws everything through its Slots, with no fixed inline style: %s', (_, drawn) => {
    const root = Inert.draw(slashMenuView<Message>(), drawn)
    expect(Inert.unslotted(root)).toEqual([])
    expect(Inert.fixedInline(root)).toEqual([])
  })
})
