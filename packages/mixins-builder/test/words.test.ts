/**
 * Every word the drawn Builder shows of its own is one of its words: drawn
 * with each replaced by a marker, no text of the editor's own is left in
 * English. What is left is the application's: its Blocks' words, its
 * commands' labels, its page and its data.
 */
import { Schema } from 'effect'
import { Block, Catalog, Composition, Content, NodeId } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { Builder, Message, type Model } from 'foldkit-builder'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { expect, it } from 'vitest'
import { BuilderView, type BuilderWords } from 'foldkit-mixins-builder'
import { PageBuilder, PageView, answer, isTimer } from './fixture.js'

const mark =
  (key: string) =>
  (...values: ReadonlyArray<string>) =>
    `«${key}:${values.join('|')}»`
const markers: BuilderWords = {
  panels: '«panels»',
  addPanel: '«addPanel»',
  layersPanel: '«layersPanel»',
  settingsPanel: '«settingsPanel»',
  palette: '«palette»',
  addBlock: mark('addBlock'),
  ungrouped: '«ungrouped»',
  patterns: '«patterns»',
  addsToEnd: '«addsToEnd»',
  addsAfter: mark('addsAfter'),
  addsInside: mark('addsInside'),
  selectAHolder: '«selectAHolder»',
  cannotGoAt: mark('cannotGoAt'),
  layers: '«layers»',
  properties: '«properties»',
  selectedBlock: '«selectedBlock»',
  selectToChange: '«selectToChange»',
  shortcuts: '«shortcuts»',
  treeUpDown: '«treeUpDown»',
  treeLeftRight: '«treeLeftRight»',
  unknownBlock: '«unknownBlock»',
  content: '«content»',
  style: '«style»',
  visibility: '«visibility»',
  interactions: '«interactions»',
  lookDefault: '«lookDefault»',
  lookAt: mark('lookAt'),
  lookUnchanged: '«lookUnchanged»',
  shownWhen: mark('shownWhen'),
  always: '«always»',
  onEvent: mark('onEvent'),
  runsNothing: '«runsNothing»',
  none: '«none»',
  withKeys: mark('withKeys'),
  keyName: mark('keyName'),
  ctrlKey: '«ctrlKey»',
  altKey: '«altKey»',
  shiftKey: '«shiftKey»',
  pageActions: '«pageActions»',
  crumbs: '«crumbs»',
  crumbPage: '«crumbPage»',
  viewports: '«viewports»',
  wide: '«wide»',
  medium: '«medium»',
  narrow: '«narrow»',
  previewAs: '«previewAs»',
  unset: '«unset»',
  canvas: '«canvas»',
  emptyPage: '«emptyPage»',
}

const send = (model: Model, message: Message): Model => {
  const result = PageBuilder.bundle.update(model, message, undefined)
  return (result.commands ?? [])
    .filter(command => !isTimer(command))
    .reduce((next, command) => send(next, answer(command)), result.model)
}
const id = NodeId.make
const Loose = Catalog.make({
  blocks: [
    Block.define('Note', {
      Props: Schema.Struct({ text: Schema.String }),
      provides: [Content.Section],
    }),
  ],
  roots: [Content.Section],
})

/** Each text the editor shows or names, but for the page drawn on its canvas. */
const shown = (root: Html): ReadonlyArray<string> => {
  const walk = (node: Html | string): ReadonlyArray<string> => {
    if (node === null) return []
    if (typeof node === 'string') return [node]
    // The page itself is the application's, drawn by its Renderer.
    if (Inert.value(node, 'data-composition-node') !== undefined) return []
    const named = ['aria-label', 'title'].flatMap(key => {
      const value = Inert.value(node, key)
      return typeof value === 'string' ? [value] : []
    })
    // A string child is a text node.
    const text = typeof node.text === 'string' ? [node.text] : []
    return [...named, ...text, ...(node.children ?? []).flatMap(walk)]
  }
  return walk(root).filter(text => text.trim() !== '')
}
/** The words a text was drawn with, by their markers. */
const wordsIn = (text: string): ReadonlyArray<string> =>
  [...text.matchAll(/«([a-zA-Z]+)/g)].flatMap(match => (match[1] === undefined ? [] : [match[1]]))

it('draws no word of its own but through its words', () => {
  const h = SlotView.inertBuilder<Message>()
  const page = PageBuilder.replace(
    PageBuilder.initial,
    Composition.Document.make({
      format: 1,
      roots: [id('s'), id('lost')],
      nodes: {
        [id('s')]: { block: 'Section', props: { tone: 'plain' }, regions: { body: [id('b')] } },
        [id('b')]: {
          block: 'Banner',
          props: { text: 'Hi', size: 'small', columns: 1, count: 1, shown: true },
          regions: {},
          appearance: { space: { base: 's', md: 'm' } },
          // No list chosen yet: the picker offers its blank.
          actions: { press: { action: 'subscribe', input: { note: '' } } },
        },
        [id('lost')]: { block: 'Carousel', props: {}, regions: {} },
      },
    }),
  )
  const states: ReadonlyArray<Model> = [
    PageBuilder.initial,
    page,
    send(page, Message.Selected({ id: id('s') })),
    send(page, Message.Selected({ id: id('b') })),
    send(page, Message.Selected({ id: id('lost') })),
  ]
  const drawn: Array<string> = states.flatMap(model =>
    shown(PageView({ ...model, words: markers }, h)),
  )
  // A Block given no group is filed under the palette's own word for none.
  const loose = Builder.make('Loose', {
    catalog: Loose,
    renderer: Renderer.make(Loose, { Note: ({ field, h }) => h.p([], [field('text')]) }),
    starters: { Note: { text: 'Hi' } },
  })
  drawn.push(...shown(BuilderView.define(loose)({ ...loose.initial, words: markers }, h)))
  // Every word is drawn somewhere, so a literal left beside it would show.
  const used = new Set(drawn.flatMap(wordsIn))
  expect(Object.keys(markers).filter(key => !used.has(key))).toEqual([])
  const left = new Set(drawn.filter(text => !text.includes('«')))
  expect(left).toEqual(
    new Set([
      // The Catalog's words: groups, Blocks, patterns.
      'Layout',
      'Section',
      'A band of the page',
      'Text',
      'Heading',
      'Promo banner',
      'A line that stands out',
      'Intro',
      'A section that opens with a heading',
      // The tree's keys, drawn as glyphs.
      '↑ ↓',
      '← →',
      // The command table's labels.
      'Move up',
      'Move down',
      'Move out',
      'Move in',
      'Duplicate',
      'Copy',
      'Cut',
      'Delete',
      'Undo',
      'Redo',
      'Paste',
      'Edit its text',
      'Select nothing',
      // The context's keys and values.
      'audience',
      'guest',
      'member',
      'beta',
      'true',
      'false',
      // The page: a layer's summary, and a Block the Catalog lacks, by its name.
      'Hi',
      '? Carousel',
      // The settings forms: props, their values, looks, the action and its input.
      'Size',
      'small',
      'large',
      'Columns',
      '1',
      '2',
      'Count',
      'Shown',
      'Tone',
      'plain',
      'accent',
      'Plain',
      'Loud',
      'Space',
      'Small',
      'M',
      'subscribe',
      'List',
      'news',
      'offers',
      'Note',
    ]),
  )
})
