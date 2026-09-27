/**
 * Everything the Builder says of its own is one of its words: made with each
 * replaced by a marker and taken through every edit, drag, copy and refusal,
 * it says nothing else. A Block is named by its label, the Catalog's word.
 */
import { Option } from 'effect'
import { Block, Catalog, Composition, NodeId } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import { expect, it } from 'vitest'
import { Builder, Message, type EditWords, type Model } from 'foldkit-builder'
import { Button, Heading, Section, Site, answer, isTimer } from './fixture.js'

const mark =
  (key: string) =>
  (...values: ReadonlyArray<string | number>) =>
    `«${key}:${values.join('|')}»`
const markers: EditWords = {
  at: mark('at'),
  thePage: '«thePage»',
  inRegion: mark('inRegion'),
  moved: mark('moved'),
  added: mark('added'),
  duplicated: mark('duplicated'),
  removed: mark('removed'),
  editedPage: '«editedPage»',
  undone: '«undone»',
  redone: '«redone»',
  notMoved: '«notMoved»',
  notAdded: '«notAdded»',
  copied: mark('copied'),
  cut: mark('cut'),
  nothingCopied: '«nothingCopied»',
  notAPage: '«notAPage»',
  noStartingProps: mark('noStartingProps'),
  startingPropsFail: mark('startingPropsFail'),
  notANode: mark('notANode'),
  unknownPattern: mark('unknownPattern'),
  copyChanged: mark('copyChanged'),
  refusal: refusal => `«refusal:${refusal.code}»`,
  moveUp: '«moveUp»',
  moveDown: '«moveDown»',
  moveOut: '«moveOut»',
  moveIn: '«moveIn»',
  duplicate: '«duplicate»',
  copy: '«copy»',
  cutCommand: '«cutCommand»',
  delete: '«delete»',
  undo: '«undo»',
  redo: '«redo»',
  paste: '«paste»',
  editText: '«editText»',
  deselect: '«deselect»',
}

// A Heading its Catalog calls a Title, so what is said names the label, not the stored name.
const Titled = Catalog.make({
  blocks: [Section, Heading.pipe(Block.words({ label: 'Title' })), Button],
  roots: Site.roots,
})
const Worded = Builder.make('Worded', {
  catalog: Titled,
  renderer: Renderer.make(Titled, {
    Section: ({ regions, h }) => h.section([], [...regions.body]),
    Heading: ({ props, h }) => h.h2([], [props.text]),
    Button: ({ props, h }) => h.span([], [props.label]),
  }),
  starters: { Section: {}, Heading: { text: 'New heading' } },
  words: markers,
})
const id = NodeId.make

it('says nothing of its own but through its words', () => {
  const said: Array<string> = []
  /** Sends a Message and each Message its Commands answer with, noting what it says or refuses. */
  const send = (model: Model, message: Message): Model => {
    const result = Worded.bundle.update(model, message, undefined)
    const next = (result.commands ?? [])
      .filter(command => !isTimer(command))
      .reduce((after, command) => send(after, answer(command)), result.model)
    said.push(
      ...Option.toArray(Option.fromUndefinedOr(next.announcer.pending?.message)),
      ...Option.toArray(Option.map(next.refused, refusal => refusal.message)),
    )
    return next
  }
  const page = Worded.replace(
    Worded.initial,
    Composition.Document.make({
      format: 1,
      roots: [id('s')],
      nodes: {
        [id('s')]: { block: 'Section', props: {}, regions: { body: [id('a'), id('b')] } },
        [id('a')]: { block: 'Heading', props: { text: 'A' }, regions: {} },
        [id('b')]: { block: 'Heading', props: { text: 'B' }, regions: {} },
      },
    }),
  )
  const into = Composition.region(id('s'), 'body', 0)
  const steps: ReadonlyArray<Message> = [
    Message.InsertAsked({ block: 'Heading', at: into }),
    Message.InsertAsked({ block: 'Section', at: Composition.root(1) }),
    Message.Applied({ op: Composition.Op.move(id('a'), Composition.region(id('s'), 'body', 2)) }),
    Message.DuplicateAsked({ id: id('a'), at: into }),
    Message.Applied({ op: Composition.Op.remove(id('b')) }),
    Message.Applied({ op: Composition.Op.batch([Composition.Op.setProp(id('a'), 'text', 'X')]) }),
    Message.Undid(),
    Message.Redid(),
    Message.DragStarted({ source: { _tag: 'Existing', id: id('a') } }),
    Message.DragCancelled(),
    Message.DragStarted({ source: { _tag: 'New', block: 'Heading' } }),
    Message.DragCancelled(),
    Message.CopyAsked({ id: id('a') }),
    Message.CutAsked({ id: id('a') }),
    Message.ClipboardRead({ text: Option.some('just text') }),
    // Refused: a Block with no starting props, a node the page lacks, a pattern the
    // Catalog lacks, a move `apply` refuses, and two mints that no longer fit.
    Message.InsertAsked({ block: 'Button', at: into }),
    Message.CopyAsked({ id: id('gone') }),
    Message.PatternAsked({ pattern: 'Outro', at: into }),
    Message.Applied({ op: Composition.Op.move(id('s'), Composition.region(id('s'), 'body', 0)) }),
    Message.Minted({ ids: [id('x')], request: { _tag: 'Insert', block: 'Button', at: into } }),
    Message.Minted({ ids: [], request: { _tag: 'Duplicate', id: id('s'), at: into } }),
  ]
  steps.reduce(send, page)
  // Nothing copied, from a Builder that holds no copy.
  send(Worded.initial, Message.ClipboardRead({ text: Option.none() }))
  said.push(...Worded.commands.map(command => command.label))

  expect(said.filter(text => !text.includes('«'))).toEqual([])
  // Every word was said, so a literal beside one would have shown.
  const used = new Set(said.flatMap(text => [...text.matchAll(/«([a-zA-Z]+)/g)].map(m => m[1])))
  expect(Object.keys(markers).filter(key => !used.has(key))).toEqual([])
  // A Block by its label, the Catalog's word.
  expect(said).toContain('«moved:Title|«at:3|3|«inRegion:Section|body»»»')
})
