import { Effect, Option, Result, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Renderer, fieldName } from 'foldkit-composition/foldkit'
import * as ManagedResource from 'foldkit/managedResource'
import * as Subscription from 'foldkit/subscription'
import {
  Block,
  Catalog,
  Composition,
  Content,
  NodeId,
  Region,
  type Document,
} from 'foldkit-composition'
import { History } from 'foldkit-primitives/state'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Metadata } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import { Builder, Layers, Message, Model, inputOf, type DropZone } from 'foldkit-builder'
import { TreeNavigation } from 'foldkit-primitives/interaction'
import {
  ColorMessage,
  PageBuilder,
  Site,
  SiteRenderer,
  Stat,
  Subscribe,
  answer,
  isTimer,
} from './fixture.js'

const { update } = PageBuilder.bundle
const step = (model: Model, message: Message) => update(model, message, undefined)

/** The value, or a failed test saying what was missing: no assertion needed. */
const required = <A>(value: A | undefined, what: string): A => {
  if (value === undefined) throw new Error(`expected ${what}`)
  return value
}

/** What an Option holds, or a failed test saying what was missing. */
const some = <A>(value: Option.Option<A>, what: string): A =>
  Option.getOrThrowWith(value, () => new Error(`expected ${what}`))

/** Sends a Message, and the Message each Command answers with, until none is left. */
const send = (model: Model, message: Message): Model => {
  const result = step(model, message)
  return (result.commands ?? [])
    .filter(command => !isTimer(command))
    .reduce((next, command) => send(next, answer(command)), result.model)
}
type Offered = 'Section' | 'Heading'
const at = (model: Model, block: Offered) =>
  some(PageBuilder.placeFor(model.page.present, model.selected, block), `a place for ${block}`)
const insert = (model: Model, block: Offered) =>
  send(model, Message.InsertAsked({ block, at: at(model, block) }))
const only = (document: Document, block: string): NodeId =>
  NodeId.make(
    required(
      Object.entries(document.nodes).find(([, node]) => node.block === block),
      `a ${block}`,
    )[0],
  )

describe('the Builder, headless', () => {
  it('inserts a node with its starting props, under an id it mints, and selects it', () => {
    const asked = step(
      PageBuilder.initial,
      Message.InsertAsked({ block: 'Section', at: Composition.root(0) }),
    )
    // Nothing changes until the id arrives: minting is a Command.
    expect(asked.model).toBe(PageBuilder.initial)
    expect(asked.commands?.map(command => command.name)).toEqual(['PageBuilder.mint'])
    const withSection = send(
      PageBuilder.initial,
      answer(required(asked.commands?.[0], 'the mint Command')),
    )
    const section = only(withSection.page.present, 'Section')
    expect(withSection.page.present.roots).toEqual([section])
    expect(withSection.selected).toEqual(Option.some(section))
    expect(withSection.page.past).toEqual([PageBuilder.initial.page.present])
  })

  it('puts a new node inside the selection when it fits there, else after it', () => {
    const withSection = insert(PageBuilder.initial, 'Section')
    const section = only(withSection.page.present, 'Section')
    const withHeading = insert(withSection, 'Heading')
    const heading = only(withHeading.page.present, 'Heading')
    expect(withHeading.page.present.nodes[section]?.regions['body']).toEqual([heading])
    expect(withHeading.page.present.nodes[heading]?.props).toEqual({ text: 'New heading' })
    // With the heading selected, the next heading goes after it, in the same Section.
    const second = insert(withHeading, 'Heading')
    expect(second.page.present.nodes[section]?.regions['body']?.[0]).toBe(heading)
    expect(second.page.present.nodes[section]?.regions['body']).toHaveLength(2)
    // A Section cannot go inside a Section or among its Flow: it goes after the root.
    expect(PageBuilder.placeFor(second.page.present, second.selected, 'Section')).toEqual(
      Option.some(Composition.root(1)),
    )
  })

  it('takes no name Object has for a Block with starting props', () => {
    const refused = step(
      PageBuilder.initial,
      Message.InsertAsked({ block: 'constructor', at: Composition.root(0) }),
    ).model
    expect(Option.map(refused.refused, ({ code }) => code)).toEqual(
      Option.some('composition:unknown-block'),
    )
  })

  it('refuses a Block with no starting props, and forgets the refusal at the next edit', () => {
    const refused = step(
      PageBuilder.initial,
      Message.InsertAsked({ block: 'Button', at: Composition.root(0) }),
    ).model
    expect(Option.map(refused.refused, ({ message }) => message)).toEqual(
      Option.some('"Button" has no starting props, so it cannot be inserted'),
    )
    expect(insert(refused, 'Section').refused).toEqual(Option.none())
  })

  it('undoes typing a prop as one step, and redoes it', () => {
    const withHeading = insert(insert(PageBuilder.initial, 'Section'), 'Heading')
    const heading = only(withHeading.page.present, 'Heading')
    const typed = ['H', 'He', 'Hey'].reduce(
      (model, text) =>
        send(model, Message.Applied({ op: Composition.Op.setProp(heading, 'text', text) })),
      withHeading,
    )
    expect(typed.page.present.nodes[heading]?.props).toEqual({ text: 'Hey' })
    const undone = send(typed, Message.Undid())
    expect(undone.page.present).toBe(withHeading.page.present)
    expect(send(undone, Message.Redid()).page.present).toBe(typed.page.present)
  })

  it('reorders, duplicates and deletes the selected node', () => {
    let model = insert(insert(insert(PageBuilder.initial, 'Section'), 'Heading'), 'Heading')
    const section = only(model.page.present, 'Section')
    const body = required(model.page.present.nodes[section]?.regions['body'], 'the body')
    const first = required(body[0], 'the first heading')
    const second = required(body[1], 'the second heading')
    expect(PageBuilder.moveBy(model.page.present, second, 1)).toEqual(Option.none())
    model = send(
      model,
      Message.Applied({
        op: some(PageBuilder.moveBy(model.page.present, second, -1), 'a move'),
      }),
    )
    expect(model.page.present.nodes[section]?.regions['body']).toEqual([second, first])

    model = send(model, Message.DuplicateAsked({ id: section, at: Composition.root(1) }))
    expect(model.page.present.roots).toHaveLength(2)
    const copy = required(model.page.present.roots[1], 'the copy')
    expect(model.selected).toEqual(Option.some(copy))
    expect(model.page.present.nodes[copy]?.regions['body']).toHaveLength(2)
    expect(Composition.validate(Site, model.page.present)).toEqual([])

    model = send(model, Message.Applied({ op: Composition.Op.remove(copy) }))
    expect(model.selected).toEqual(Option.none())
    expect(model.page.present.roots).toEqual([section])
  })

  it('replaces the Document from outside, starting undo over, and settles a stored Model', () => {
    const edited = insert(insert(PageBuilder.initial, 'Section'), 'Heading')
    const replaced = PageBuilder.replace(edited, Composition.empty())
    expect(replaced.page.past).toEqual([])
    expect(replaced.selected).toEqual(Option.none())
    const settled = PageBuilder.settle({ ...edited, hovered: edited.selected })
    expect(settled.page.past).toEqual([])
    expect(settled.hovered).toEqual(Option.none())
    expect(settled.page.present).toBe(edited.page.present)
  })

  it('keeps its Model, undo History included, through its Schema', () => {
    const edited = insert(insert(PageBuilder.initial, 'Section'), 'Heading')
    const stored = JSON.parse(JSON.stringify(Schema.encodeSync(Model)(edited)))
    expect(Schema.decodeUnknownSync(Model)(stored)).toEqual(edited)
    expect(History.canUndo(edited.page)).toBe(true)
  })
})

describe('the Builder as a form key', () => {
  const Page = Entity.define(
    'Page',
    Schema.Struct({ id: Schema.String, title: Schema.String, document: Composition.Document }),
  )
  const PageInput = Entity.input(
    Page,
    Schema.Struct({
      title: Page.fields.title.schema,
      document: Composition.Document.check(Composition.valid(Site)),
    }),
  )
  const PageForm = Form.make('PageForm', PageInput, { inputs: { document: PageBuilder.input } })
  const document = PageForm.control('document')
  type FormModel = typeof PageForm.initial
  const formSend = (model: FormModel, message: typeof PageForm.Message.Type): FormModel => {
    const result = PageForm.bundle.update(model, message, undefined)
    return (result.commands ?? [])
      .filter(command => !isTimer(command))
      .reduce((next, command) => formSend(next, answer(command)), result.model)
  }

  it('edits the page through the form, and only a change of the page is authored', () => {
    const withSection = formSend(
      PageForm.initial,
      document.send(Message.InsertAsked({ block: 'Section', at: Composition.root(0) })),
    )
    expect(document.field(withSection).value.page.present.roots).toHaveLength(1)
    expect(PageForm.authoredChanged(PageForm.initial, withSection)).toBe(true)
    const chosen = formSend(withSection, document.send(Message.PanelChosen({ panel: 'layers' })))
    expect(PageForm.authoredChanged(withSection, chosen)).toBe(false)
  })

  it('submits the page it holds, checked against the Catalog', () => {
    const titled = formSend(
      PageForm.initial,
      PageForm.Message.Changed({ key: 'title', value: 'Home' }),
    )
    const withSection = formSend(
      titled,
      document.send(Message.InsertAsked({ block: 'Section', at: Composition.root(0) })),
    )
    const submitted = PageForm.bundle.update(withSection, PageForm.Message.Submitted(), undefined)
    expect(submitted.outMessage).toEqual({
      _tag: 'Submitted',
      value: { title: 'Home', document: document.field(withSection).value.page.present },
    })
  })

  it('is filled with a stored page, starting its undo over', () => {
    const edited = formSend(
      PageForm.initial,
      document.send(Message.InsertAsked({ block: 'Section', at: Composition.root(0) })),
    )
    const stored = document.field(edited).value.page.present
    const filled = PageForm.fill(edited, { document: stored }).model
    expect(document.field(filled).value.page.present).toBe(stored)
    expect(document.field(filled).value.page.past).toEqual([])
    const decoded = Schema.decodeUnknownResult(PageInput.schema)({ title: 'x', document: stored })
    expect(Result.isSuccess(decoded)).toBe(true)
  })
})

describe('the keyboard, the layers and the announcer', () => {
  const plain = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
  const alt = { ...plain, altKey: true }
  const ctrl = { ...plain, ctrlKey: true }
  const press = (model: Model, key: string, modifiers = plain): Model => {
    return Option.match(PageBuilder.keyCommand(model, key, modifiers), {
      onNone: () => model,
      onSome: message => send(model, message),
    })
  }
  // Two sections: the first holds two headings.
  const twoSections = () => {
    let model = insert(insert(insert(PageBuilder.initial, 'Section'), 'Heading'), 'Heading')
    const first = only(model.page.present, 'Section')
    model = send(model, Message.Selected({ id: first }))
    model = insert(model, 'Section')
    return { model, first }
  }
  const body = (model: Model, section: NodeId) =>
    required(model.page.present.nodes[section]?.regions['body'], 'a body')

  it('moves the selected node with Alt and the arrows, out of its parent and into the one above', () => {
    const { model, first } = twoSections()
    const [upper, lower] = body(model, first)
    const selectedLower = send(
      model,
      Message.Selected({ id: required(lower, 'the lower heading') }),
    )
    const raised = press(selectedLower, 'ArrowUp', alt)
    expect(body(raised, first)).toEqual([lower, upper])
    // Out of the Section is refused: a heading cannot be a root, and nothing changes.
    const out = press(raised, 'ArrowLeft', alt)
    expect(out.page.present).toBe(raised.page.present)
    expect(Option.map(out.refused, ({ code }) => code)).toEqual(
      Option.some('composition:root-rejects'),
    )
    // Into the node above: the upper heading holds nothing, so nothing to move into.
    expect(PageBuilder.keyCommand(selectedLower, 'ArrowRight', alt)).toEqual(Option.none())
  })

  it('moves a node into the node above it, last in a Region that takes it, and back out', () => {
    const { model, first } = twoSections()
    const [upper] = body(model, first)
    // Put a Group between the two headings, then select the last heading.
    const withGroup = send(
      model,
      Message.Applied({
        op: Composition.Op.insert({
          id: NodeId.make('group'),
          block: 'Group',
          props: {},
          at: Composition.region(first, 'body', 1),
        }),
      }),
    )
    const last = required(body(withGroup, first)[2], 'the last heading')
    const into = press(send(withGroup, Message.Selected({ id: last })), 'ArrowRight', alt)
    expect(into.page.present.nodes[NodeId.make('group')]?.regions['items']).toEqual([last])
    expect(into.announcer.pending?.message).toBe('Moved Heading, 1 of 1 in Group items')
    // A second heading goes in last, after the first.
    const another = send(
      into,
      Message.Applied({
        op: Composition.Op.insert({
          id: NodeId.make('another'),
          block: 'Heading',
          props: { text: 'Another' },
          at: Composition.region(first, 'body', 2),
        }),
      }),
    )
    const both = press(another, 'ArrowRight', alt)
    expect(both.page.present.nodes[NodeId.make('group')]?.regions['items']).toEqual([
      last,
      NodeId.make('another'),
    ])
    const outAgain = press(into, 'ArrowLeft', alt)
    expect(body(outAgain, first)).toEqual([upper, NodeId.make('group'), last])
  })

  it('offers no move into the node above when none of its Regions would take the node', () => {
    const { model } = twoSections()
    const second = required(model.page.present.roots[1], 'the second section')
    const selected = send(model, Message.Selected({ id: second }))
    // A Section body takes Flow, and a Section is not Flow.
    expect(PageBuilder.keyCommand(selected, 'ArrowRight', alt)).toEqual(Option.none())
  })

  it('duplicates with Mod+D, removes with Delete, and undoes and redoes with Mod+Z and Mod+Y', () => {
    const { model } = twoSections()
    const second = required(model.page.present.roots[1], 'the second section')
    const selected = send(model, Message.Selected({ id: second }))
    const copied = press(selected, 'd', ctrl)
    expect(copied.page.present.roots).toHaveLength(3)
    const removed = press(copied, 'Delete')
    expect(removed.page.present.roots).toHaveLength(2)
    expect(press(removed, 'z', ctrl).page.present).toBe(copied.page.present)
    expect(press(press(removed, 'z', ctrl), 'Z', { ...ctrl, shiftKey: true }).page.present).toBe(
      removed.page.present,
    )
    expect(press(press(removed, 'z', ctrl), 'y', ctrl).page.present).toBe(removed.page.present)
    expect(
      PageBuilder.keyCommand({ ...removed, selected: Option.none() }, 'Delete', plain),
    ).toEqual(Option.none())
    expect(PageBuilder.keyCommand(removed, 'a', plain)).toEqual(Option.none())
    // Escape lets go of the selection, and with none there is nothing to let go.
    const released = press(removed, 'Escape')
    expect(released.selected).toEqual(Option.none())
    expect(PageBuilder.keyCommand(released, 'Escape', plain)).toEqual(Option.none())
  })

  it('runs a key through the command table, which an application may change', () => {
    const { model } = twoSections()
    const second = required(model.page.present.roots[1], 'the second section')
    const selected = send(model, Message.Selected({ id: second }))
    // Undo has nothing to do on a fresh page, so its key is not taken.
    expect(PageBuilder.keyCommand(PageBuilder.initial, 'z', ctrl)).toEqual(Option.none())
    // Shift is matched only where a key says: Delete takes it, undo does not.
    expect(PageBuilder.keyCommand(selected, 'Delete', { ...plain, shiftKey: true })).toEqual(
      Option.some(Message.Applied({ op: Composition.Op.remove(second) })),
    )
    // Delete by Mod+Backspace only, and no duplicating at all.
    const Rebound = Builder.make('Rebound', {
      catalog: Site,
      renderer: SiteRenderer,
      starters: { Section: {}, Heading: { text: 'New heading' } },
      commands: built =>
        built
          .filter(command => command.id !== 'duplicate')
          .map(command =>
            command.id === 'delete'
              ? { ...command, keys: [{ key: 'Backspace', mod: true }] }
              : command,
          ),
    })
    expect(Rebound.commands.map(command => command.id)).not.toContain('duplicate')
    expect(Rebound.keyCommand(selected, 'Delete', plain)).toEqual(Option.none())
    expect(Rebound.keyCommand(selected, 'd', ctrl)).toEqual(Option.none())
    expect(Rebound.keyCommand(selected, 'Backspace', ctrl)).toEqual(
      Option.some(Message.Applied({ op: Composition.Op.remove(second) })),
    )
    // A later command on the same key runs where the first has nothing to do.
    const Closing = Builder.make('Closing', {
      catalog: Site,
      renderer: SiteRenderer,
      starters: { Section: {} },
      commands: built => [
        ...built,
        {
          id: 'close-panel',
          label: 'Close panel',
          keys: [{ key: 'Escape' }],
          placement: ['keyboard'],
          run: () => Option.some(Message.PanelChosen({ panel: 'insert' })),
        },
      ],
    })
    expect(Closing.keyCommand(Closing.initial, 'Escape', plain)).toEqual(
      Option.some(Message.PanelChosen({ panel: 'insert' })),
    )
    expect(Closing.keyCommand(selected, 'Escape', plain)).toEqual(Option.some(Message.Deselected()))
  })

  it('selects the node the layers’ keyboard focus moves to', () => {
    const { model, first } = twoSections()
    const focused = send(model, Layers.wrapper.make(TreeNavigation.Message.Focused({ id: first })))
    expect(focused.selected).toEqual(Option.some(first))
    expect(focused.layers.current).toBe(first)
    const stray = send(model, Layers.wrapper.make(TreeNavigation.Message.Focused({ id: 'gone' })))
    expect(stray.selected).toEqual(model.selected)
  })

  it('keeps the layers’ keys where a removed node was: after it, else before, else its holder', () => {
    const { model, first } = twoSections()
    const [one, two] = body(model, first)
    const removed = (from: Model, id: NodeId | undefined) =>
      press(send(from, Message.Selected({ id: required(id, 'a heading') })), 'Delete')
    // The first of two: the one after it.
    expect(removed(model, one).layers.current).toBe(two)
    // The last of three: the one just before it.
    const three = insert(
      send(model, Message.Selected({ id: required(two, 'a heading') })),
      'Heading',
    )
    expect(removed(three, body(three, first)[2]).layers.current).toBe(two)
    // The last: the one before it; then the only one left: its Section.
    const lastGone = removed(model, two)
    expect(lastGone.layers.current).toBe(one)
    expect(removed(lastGone, one).layers.current).toBe(first)
    expect(removed(lastGone, one).selected).toEqual(Option.none())
  })

  it('starts the layers’ keys from a selection made anywhere else', () => {
    const { model, first } = twoSections()
    const selected = send(model, Message.Selected({ id: first }))
    expect(selected.layers.current).toBe(first)
    const cleared = send(selected, Message.Deselected())
    expect(cleared.layers.current).toBe(first)
  })

  it('says what an edit did, and says a refusal assertively', () => {
    const edited = step(
      insert(PageBuilder.initial, 'Section'),
      Message.InsertAsked({ block: 'Heading', at: Composition.root(0) }),
    )
    const minted = send(edited.model, answer(required(edited.commands?.[0], 'the mint')))
    const refusal = some(minted.refused, 'the refusal')
    expect(refusal.code).toBe('composition:root-rejects')
    expect(minted.announcer.pending).toEqual({
      message: refusal.message,
      politeness: 'assertive',
    })
    const added = insert(insert(PageBuilder.initial, 'Section'), 'Heading')
    expect(added.announcer.pending).toEqual({
      message: 'Added Heading, 1 of 1 in Section body',
      politeness: 'polite',
    })
  })
})

describe('dragging a node', () => {
  const id = NodeId.make
  // A Section holding a Heading, an empty Group and a Heading; an empty Section after it.
  const page = PageBuilder.replace(
    PageBuilder.initial,
    Composition.Document.make({
      format: 1,
      roots: [id('s1'), id('s2')],
      nodes: {
        [id('s1')]: {
          block: 'Section',
          props: {},
          regions: { body: [id('h1'), id('g'), id('h2')] },
        },
        [id('h1')]: { block: 'Heading', props: { text: 'One' }, regions: {} },
        [id('g')]: { block: 'Group', props: {}, regions: { items: [] } },
        [id('h2')]: { block: 'Heading', props: { text: 'Two' }, regions: {} },
        [id('s2')]: { block: 'Section', props: {}, regions: { body: [] } },
      },
    }),
  )
  const document = page.page.present
  /** Where the node `dragged`, dragged over `target` in `zone`, would go. */
  const drop = (document: Document, dragged: NodeId, target: NodeId, zone: DropZone) =>
    PageBuilder.dropAt(document, { _tag: 'Existing', id: dragged }, target, zone)

  it('drops before, after or inside a node, counting places without the node dragged', () => {
    expect(drop(document, id('h1'), id('h2'), 'after')).toEqual(
      Option.some(Composition.region(id('s1'), 'body', 2)),
    )
    expect(drop(document, id('h2'), id('h1'), 'before')).toEqual(
      Option.some(Composition.region(id('s1'), 'body', 0)),
    )
    expect(drop(document, id('h1'), id('g'), 'inside')).toEqual(
      Option.some(Composition.region(id('g'), 'items', 0)),
    )
    expect(drop(document, id('s2'), id('s1'), 'before')).toEqual(Option.some(Composition.root(0)))
  })

  it('drops inside a node that takes nothing as after it, and nowhere the page refuses', () => {
    expect(drop(document, id('h1'), id('h2'), 'inside')).toEqual(
      Option.some(Composition.region(id('s1'), 'body', 2)),
    )
    // A Section fits neither in a Group nor among a Section's Flow.
    expect(drop(document, id('s2'), id('g'), 'inside')).toEqual(Option.none())
    expect(drop(document, id('h1'), id('h1'), 'after')).toEqual(Option.none())
    expect(drop(document, id('h1'), id('gone'), 'after')).toEqual(Option.none())
  })

  it('selects what it drags, and moves it on the drop as one undoable, announced edit', () => {
    const started = send(page, Message.DragStarted({ source: { _tag: 'Existing', id: id('h1') } }))
    expect(started.selected).toEqual(Option.some(id('h1')))
    const over = send(started, Message.DraggedOver({ id: id('g'), zone: 'inside' }))
    expect(over.drag).toEqual(
      Option.some({
        source: { _tag: 'Existing', id: id('h1') },
        over: Option.some({ id: id('g'), zone: 'inside' }),
        at: Option.some(Composition.region(id('g'), 'items', 0)),
      }),
    )
    // Nothing moves until the drop.
    expect(over.page).toBe(page.page)
    const dropped = send(over, Message.DragDropped())
    expect(dropped.drag).toEqual(Option.none())
    expect(dropped.page.present.nodes[id('g')]?.regions['items']).toEqual([id('h1')])
    expect(dropped.announcer.pending?.message).toBe('Moved Heading, 1 of 1 in Group items')
    expect(send(dropped, Message.Undid()).page.present).toBe(document)
  })

  it('moves nothing on a drop the page refuses, or a cancel, and says so', () => {
    const refused = send(
      send(page, Message.DragStarted({ source: { _tag: 'Existing', id: id('s2') } })),
      Message.DraggedOver({ id: id('g'), zone: 'inside' }),
    )
    expect(Option.flatMap(refused.drag, drag => drag.at)).toEqual(Option.none())
    // Over a Heading, which takes nothing inside, the drop is marked where it lands.
    const beside = send(
      send(page, Message.DragStarted({ source: { _tag: 'Existing', id: id('h1') } })),
      Message.DraggedOver({ id: id('h2'), zone: 'inside' }),
    )
    expect(Option.flatMap(beside.drag, drag => drag.over)).toEqual(
      Option.some({ id: id('h2'), zone: 'after' }),
    )
    const dropped = send(refused, Message.DragDropped())
    expect(dropped.page).toBe(page.page)
    expect(dropped.drag).toEqual(Option.none())
    expect(dropped.announcer.pending?.message).toBe('Not moved')
    const cancelled = send(refused, Message.DragCancelled())
    expect(cancelled.page).toBe(page.page)
    expect(cancelled.drag).toEqual(Option.none())
    expect(cancelled.announcer.pending?.message).toBe('Not moved')
  })

  it('lands a new Block from the palette as an insert would, and never where the page refuses it', () => {
    const heading = { _tag: 'New', block: 'Heading' } as const
    // Nothing is taken out first: before h2 is its place, the third of three.
    expect(PageBuilder.dropAt(document, heading, id('h2'), 'before')).toEqual(
      Option.some(Composition.region(id('s1'), 'body', 2)),
    )
    expect(PageBuilder.dropAt(document, heading, id('g'), 'inside')).toEqual(
      Option.some(Composition.region(id('g'), 'items', 0)),
    )
    // A Section fits nowhere inside a Group, nor after it among a Section's Flow.
    const section = { _tag: 'New', block: 'Section' } as const
    expect(PageBuilder.dropAt(document, section, id('g'), 'inside')).toEqual(Option.none())
    expect(PageBuilder.dropAt(document, section, id('s2'), 'after')).toEqual(
      Option.some(Composition.root(2)),
    )
    // Tried with an id the page does not hold, whatever its nodes are called.
    const withDragged = Composition.Document.make({
      ...document,
      roots: [...document.roots, id('dragged')],
      nodes: {
        ...document.nodes,
        [id('dragged')]: { block: 'Section', props: {}, regions: { body: [] } },
      },
    })
    expect(PageBuilder.dropAt(withDragged, heading, id('h2'), 'before')).toEqual(
      Option.some(Composition.region(id('s1'), 'body', 2)),
    )
  })

  it('adds a new Block where it is dropped, selected, and starts no drag of one with no starting props', () => {
    const selected = send(page, Message.Selected({ id: id('h1') }))
    const started = send(
      selected,
      Message.DragStarted({ source: { _tag: 'New', block: 'Heading' } }),
    )
    // What was selected stays so until the new node is there.
    expect(started.selected).toEqual(Option.some(id('h1')))
    const over = send(started, Message.DraggedOver({ id: id('h2'), zone: 'after' }))
    const dropped = send(over, Message.DragDropped())
    const body = required(dropped.page.present.nodes[id('s1')]?.regions['body'], 'a body')
    expect(body).toHaveLength(4)
    const added = required(body[3], 'the new heading')
    expect(dropped.page.present.nodes[added]).toEqual({
      block: 'Heading',
      props: { text: 'New heading' },
      regions: {},
    })
    expect(dropped.selected).toEqual(Option.some(added))
    expect(dropped.drag).toEqual(Option.none())
    // Buttons have no starting props, so the palette does not offer them to drag.
    expect(
      send(page, Message.DragStarted({ source: { _tag: 'New', block: 'Button' } })).drag,
    ).toEqual(Option.none())
  })

  it('says a new Block dragged away and let go was not added', () => {
    const started = send(page, Message.DragStarted({ source: { _tag: 'New', block: 'Heading' } }))
    const cancelled = send(started, Message.DragCancelled())
    expect(cancelled.announcer.pending?.message).toBe('Not added')
    expect(cancelled.page).toBe(page.page)
  })

  it('counts a drop onto a node’s own place as no move, and drops where the page is now', () => {
    // h1 is first; before g is where it already is.
    expect(drop(document, id('h1'), id('g'), 'before')).toEqual(Option.none())
    const over = send(
      send(page, Message.DragStarted({ source: { _tag: 'Existing', id: id('h2') } })),
      Message.DraggedOver({ id: id('h1'), zone: 'before' }),
    )
    expect(Option.flatMap(over.drag, drag => drag.at)).toEqual(
      Option.some(Composition.region(id('s1'), 'body', 0)),
    )
    // h1 goes before the drop. First in the body is still a place, but not the one
    // aimed at: before h1, which is not there.
    const gone = send(over, Message.Applied({ op: Composition.Op.remove(id('h1')) }))
    const dropped = send(gone, Message.DragDropped())
    expect(dropped.page.present).toBe(gone.page.present)
    expect(dropped.announcer.pending?.message).toBe('Not moved')
  })

  it('opens the rows above a node selected from elsewhere, so the tree shows it', () => {
    const closed = send(page, Layers.wrapper.make(TreeNavigation.Message.Closed({ id: id('s1') })))
    expect(closed.layers.toggled).toEqual([id('s1')])
    const selected = send(closed, Message.Selected({ id: id('h2') }))
    expect(selected.layers).toEqual({ current: id('h2'), toggled: [] })
  })

  it('ignores a drag of no node, drag news with no drag, and settles with none', () => {
    expect(
      send(page, Message.DragStarted({ source: { _tag: 'Existing', id: id('gone') } })).drag,
    ).toEqual(Option.none())
    expect(send(page, Message.DraggedOff())).toBe(page)
    expect(send(page, Message.DragDropped())).toBe(page)
    expect(send(page, Message.DragCancelled())).toBe(page)
    const dragging = send(page, Message.DragStarted({ source: { _tag: 'Existing', id: id('h1') } }))
    expect(PageBuilder.settle(dragging).drag).toEqual(Option.none())
    expect(PageBuilder.replace(dragging, document).drag).toEqual(Option.none())
  })
})

describe('copy, cut and paste', () => {
  const id = NodeId.make
  // A Section holding a Heading and a Card titled by a Heading; an empty Section after it.
  const page = PageBuilder.replace(
    PageBuilder.initial,
    Composition.Document.make({
      format: 1,
      roots: [id('s1'), id('s2')],
      nodes: {
        [id('s1')]: { block: 'Section', props: {}, regions: { body: [id('h1'), id('c')] } },
        [id('h1')]: { block: 'Heading', props: { text: 'One' }, regions: {} },
        [id('c')]: { block: 'Card', props: {}, regions: { title: [id('t')] } },
        [id('t')]: { block: 'Heading', props: { text: 'Title' }, regions: {} },
        [id('s2')]: { block: 'Section', props: {}, regions: { body: [] } },
      },
    }),
  )
  const document = page.page.present
  const clip = (tree: unknown) => JSON.stringify({ format: 'foldkit-composition', tree })
  /** A paste of `text` read from the system clipboard, with `selected` selected. */
  const paste = (model: Model, text: string) =>
    send(model, Message.ClipboardRead({ text: Option.some(text) }))

  it('pastes a copy of a node and all it holds under new ids, by the selection', () => {
    const copied = send(
      send(page, Message.Selected({ id: id('c') })),
      Message.CopyAsked({ id: id('c') }),
    )
    expect(copied.page).toBe(page.page)
    expect(copied.announcer.pending?.message).toBe('Copied Card')
    // Into the empty Section: with it selected, the copy goes inside it.
    const into = send(copied, Message.Selected({ id: id('s2') }))
    // No system clipboard here, so the paste takes the Builder's own copy.
    const pasted = send(into, Message.PasteAsked())
    const body = required(pasted.page.present.nodes[id('s2')]?.regions['body'], 'a body')
    const card = required(body[0], 'the pasted Card')
    expect(card).not.toBe(id('c'))
    const title = required(pasted.page.present.nodes[card]?.regions['title']?.[0], 'its title')
    expect(title).not.toBe(id('t'))
    expect(pasted.page.present.nodes[title]?.props).toEqual({ text: 'Title' })
    expect(pasted.selected).toEqual(Option.some(card))
    // The original is where it was, and a second paste mints ids again.
    expect(pasted.page.present.nodes[id('s1')]).toEqual(document.nodes[id('s1')])
    const twice = send(pasted, Message.PasteAsked())
    expect(Object.keys(twice.page.present.nodes)).toHaveLength(
      Object.keys(document.nodes).length + 4,
    )
  })

  it('pastes what the system clipboard holds over its own copy', () => {
    const copied = send(page, Message.CopyAsked({ id: id('c') }))
    const selected = send(copied, Message.Selected({ id: id('h1') }))
    const pasted = paste(
      selected,
      clip({
        root: 'x',
        nodes: { x: { block: 'Heading', props: { text: 'Elsewhere' }, regions: {} } },
      }),
    )
    // After the selected Heading, among the Section's body.
    const body = required(pasted.page.present.nodes[id('s1')]?.regions['body'], 'a body')
    expect(body).toHaveLength(3)
    expect(pasted.page.present.nodes[required(body[1], 'the pasted Heading')]?.props).toEqual({
      text: 'Elsewhere',
    })
  })

  it('refuses a paste whole when any of it does not hold together or fit the Catalog', () => {
    const heading = (text: unknown) => ({ block: 'Heading', props: { text }, regions: {} })
    const refusals: ReadonlyArray<readonly [string, string]> = [
      [
        clip({ root: 'x', nodes: { x: { block: 'Carousel', props: {}, regions: {} } } }),
        'Carousel',
      ],
      [
        clip({
          root: 'g',
          nodes: {
            g: { block: 'Group', props: {}, regions: { items: ['a', 'b'] } },
            a: heading('A'),
            b: heading(7),
          },
        }),
        'text',
      ],
      // A child it names but does not hold.
      [
        clip({
          root: 'g',
          nodes: {
            g: { block: 'Group', props: {}, regions: { items: ['a', 'gone'] } },
            a: heading('A'),
          },
        }),
        'gone',
      ],
      [
        clip({ root: 'x', nodes: { x: heading('A') } }).replace('}}}}', '}}},"extra":1}'),
        'no part of a page',
      ],
      ['just some text', 'no part of a page'],
      // Named by the ids copied, not by those a paste would mint.
      [
        clip({ root: 'x', nodes: { x: heading('A'), stray: heading('B') } }),
        '"stray", which its root does not reach',
      ],
    ]
    for (const [text, why] of refusals) {
      const refused = paste(page, text)
      expect(refused.page).toBe(page.page)
      expect(some(refused.refused, `a refusal of ${text}`).message).toContain(why)
    }
  })

  it('says so when nothing was copied and the system clipboard cannot be read', () => {
    const refused = send(page, Message.PasteAsked())
    expect(some(refused.refused, 'a refusal')).toEqual({
      code: 'builder:nothing-to-paste',
      message: 'Nothing has been copied',
    })
  })

  it('cuts a node into the clipboard, and does not cut one its Region needs', () => {
    const cut = send(page, Message.CutAsked({ id: id('c') }))
    expect(cut.page.present.nodes[id('c')]).toBeUndefined()
    expect(cut.announcer.pending?.message).toBe('Cut Card')
    const back = send(send(cut, Message.Selected({ id: id('h1') })), Message.PasteAsked())
    expect(Object.keys(back.page.present.nodes)).toHaveLength(Object.keys(document.nodes).length)
    // A Card's title is all it holds: it stays, and what was copied before stays copied.
    const copied = send(page, Message.CopyAsked({ id: id('h1') }))
    const kept = send(copied, Message.CutAsked({ id: id('t') }))
    expect(kept.page).toBe(page.page)
    expect(kept.clipboard).toBe(copied.clipboard)
    expect(some(kept.refused, 'a refusal').code).toBe('composition:region-cardinality')
  })

  it('pastes a cut node back with nothing selected, last where the page takes it', () => {
    // The cut leaves nothing selected; a Heading is no root, so it goes last in a body.
    const cut = send(
      send(page, Message.Selected({ id: id('h1') })),
      Message.CutAsked({ id: id('h1') }),
    )
    expect(cut.selected).toEqual(Option.none())
    const pasted = send(cut, Message.PasteAsked())
    expect(pasted.refused).toEqual(Option.none())
    const body = required(pasted.page.present.nodes[id('s2')]?.regions['body'], 'a body')
    expect(pasted.page.present.nodes[required(body[0], 'the pasted Heading')]?.props).toEqual({
      text: 'One',
    })
  })

  it('refuses a paste the page has no place for before it mints an id', () => {
    const result = step(
      PageBuilder.initial,
      Message.ClipboardRead({
        text: Option.some(
          clip({
            root: 'x',
            nodes: { x: { block: 'Heading', props: { text: 'A' }, regions: {} } },
          }),
        ),
      }),
    )
    // The refusal is said, and nothing is minted.
    expect((result.commands ?? []).map(command => command.name)).toEqual(['PageBuilder.announce'])
    expect(some(result.model.refused, 'a refusal')).toEqual({
      code: 'builder:no-place',
      message: 'There is no place on this page for a Heading',
    })
  })

  it('offers no duplicate where the Region holds all it may', () => {
    const inTitle = send(page, Message.Selected({ id: id('t') }))
    expect(PageBuilder.commands.find(each => each.id === 'duplicate')?.run(inTitle)).toEqual(
      Option.none(),
    )
    const inBody = send(page, Message.Selected({ id: id('h1') }))
    expect(
      Option.isSome(
        required(
          PageBuilder.commands.find(each => each.id === 'duplicate'),
          'duplicate',
        ).run(inBody),
      ),
    ).toBe(true)
  })

  it('runs copy, cut and paste from their keys', () => {
    const selected = send(page, Message.Selected({ id: id('h1') }))
    const key = (key: string) =>
      PageBuilder.keyCommand(selected, key, {
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
      })
    expect(key('c')).toEqual(Option.some(Message.CopyAsked({ id: id('h1') })))
    expect(key('x')).toEqual(Option.some(Message.CutAsked({ id: id('h1') })))
    expect(key('v')).toEqual(Option.some(Message.PasteAsked()))
  })
})

describe('patterns', () => {
  const id = NodeId.make
  const page = PageBuilder.replace(
    PageBuilder.initial,
    Composition.Document.make({
      format: 1,
      roots: [id('s1'), id('s2')],
      nodes: {
        [id('s1')]: { block: 'Section', props: {}, regions: { body: [id('h1')] } },
        [id('h1')]: { block: 'Heading', props: { text: 'One' }, regions: {} },
        [id('s2')]: { block: 'Section', props: {}, regions: { body: [] } },
      },
    }),
  )

  it('adds a pattern under new ids where its root’s Block would go, and selects it', () => {
    const selected = send(page, Message.Selected({ id: id('s1') }))
    // A Section goes beside a Section: just after the selected one, not last.
    const at = some(
      PageBuilder.patternAt(selected.page.present, selected.selected, 'Intro'),
      'a place',
    )
    expect(at).toEqual(Composition.root(1))
    const added = send(selected, Message.PatternAsked({ pattern: 'Intro', at }))
    const intro = required(added.page.present.roots[1], 'the new Section')
    expect(intro).not.toBe(id('intro'))
    const title = required(added.page.present.nodes[intro]?.regions['body']?.[0], 'its heading')
    expect(added.page.present.nodes[title]).toEqual({
      block: 'Heading',
      props: { text: 'Welcome' },
      regions: {},
    })
    expect(added.selected).toEqual(Option.some(intro))
    expect(added.announcer.pending?.message).toBe('Added Section, 2 of 3 in the page')
    // One undo step takes it all away.
    expect(send(added, Message.Undid()).page.present).toBe(page.page.present)
  })

  it('refuses a pattern the Catalog lacks, and finds no place for one', () => {
    const refused = send(page, Message.PatternAsked({ pattern: 'Outro', at: Composition.root(1) }))
    expect(some(refused.refused, 'a refusal').code).toBe('composition:unknown-pattern')
    expect(refused.page).toBe(page.page)
    expect(PageBuilder.patternAt(page.page.present, page.selected, 'Outro')).toEqual(Option.none())
  })
})

describe('text edited in place', () => {
  const id = NodeId.make
  const page = PageBuilder.replace(
    PageBuilder.initial,
    Composition.Document.make({
      format: 1,
      roots: [id('s1')],
      nodes: {
        [id('s1')]: {
          block: 'Section',
          props: {},
          regions: { body: [id('h1'), id('h2'), id('st')] },
        },
        [id('h1')]: { block: 'Heading', props: { text: 'One' }, regions: {} },
        [id('h2')]: { block: 'Heading', props: { text: 'Two' }, regions: {} },
        // Text its view draws as plain text, not as a field.
        [id('st')]: {
          block: 'Stat',
          props: {
            value: 3,
            caption: 'Wins',
            frame: { width: 1 },
            rank: '1',
            note: null,
            source: null,
          },
          regions: {},
        },
      },
    }),
  )
  const title = fieldName(id('h1'), 'text')
  const textOf = (model: Model) => model.page.present.nodes[id('h1')]?.props['text']
  const plain = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }
  /** The heading selected, editing begun by Enter, and `texts` typed one after another. */
  const typed = (model: Model, texts: ReadonlyArray<string>) => {
    const selected = send(model, Message.Selected({ id: id('h1') }))
    const begun = send(selected, some(PageBuilder.keyCommand(selected, 'Enter', plain), 'Enter'))
    return texts.reduce(
      (next, text) => send(next, Message.FieldTyped({ field: title, text })),
      begun,
    )
  }

  it('begins on Enter with the text as it was, and keeps each change as one undo step', () => {
    const begun = typed(page, [])
    expect(begun.editing).toEqual(
      Option.some({ id: id('h1'), key: 'text', initial: 'One', typed: false }),
    )
    const done = send(
      typed(page, ['One!', 'One!!']),
      Message.EditingCommitted({ field: title, text: 'One!!' }),
    )
    expect(textOf(done)).toBe('One!!')
    expect(done.editing).toEqual(Option.none())
    expect(textOf(send(done, Message.Undid()))).toBe('One')
    // A second session of the same prop is a step of its own.
    const again = send(
      typed(done, ['One!!?']),
      Message.EditingCommitted({ field: title, text: 'One!!?' }),
    )
    expect(textOf(send(again, Message.Undid()))).toBe('One!!')
  })

  it('puts the text back on Escape, and leaves no step, as it does for text that ends where it began', () => {
    const cancelled = send(typed(page, ['On', 'O']), Message.EditingCancelled({ field: title }))
    expect(cancelled.page.present).toBe(page.page.present)
    expect(History.canUndo(cancelled.page)).toBe(false)
    expect(History.canRedo(cancelled.page)).toBe(false)
    const back = send(
      typed(page, ['On', 'One']),
      Message.EditingCommitted({ field: title, text: 'One' }),
    )
    expect(History.canUndo(back.page)).toBe(false)
    expect(back.editing).toEqual(Option.none())
  })

  it('takes a commit whose text no change had reported', () => {
    const done = send(typed(page, []), Message.EditingCommitted({ field: title, text: 'Uno' }))
    expect(textOf(done)).toBe('Uno')
    expect(textOf(send(done, Message.Undid()))).toBe('One')
  })

  it('leaves the keys to the text while it is edited', () => {
    const editing = typed(page, ['On'])
    expect(PageBuilder.keyCommand(editing, 'Delete', plain)).toEqual(Option.none())
    expect(PageBuilder.keyCommand(editing, 'z', { ...plain, ctrlKey: true })).toEqual(Option.none())
    // Not editing, Delete removes the selected node.
    const selected = send(page, Message.Selected({ id: id('h1') }))
    expect(Option.isSome(PageBuilder.keyCommand(selected, 'Delete', plain))).toBe(true)
  })

  it('edits only a field the page draws, and hears only the field being edited', () => {
    // A Section draws no text; a name that is not a field, or a prop that is not text, is no field.
    const onSection = send(page, Message.Selected({ id: id('s1') }))
    expect(PageBuilder.keyCommand(onSection, 'Enter', plain)).toEqual(Option.none())
    for (const field of [
      'h1',
      fieldName(id('h1'), 'colour'),
      fieldName(id('gone'), 'text'),
      fieldName(id('st'), 'caption'),
    ])
      expect(send(page, Message.EditingAsked({ field })).editing).toEqual(Option.none())
    const editing = typed(page, [])
    const other = send(
      editing,
      Message.FieldTyped({ field: fieldName(id('h2'), 'text'), text: 'X' }),
    )
    expect(other.page).toBe(editing.page)
  })

  it('ends when the selection moves to another node', () => {
    const moved = send(typed(page, ['On']), Message.Selected({ id: id('h2') }))
    expect(moved.editing).toEqual(Option.none())
  })

  it('ends at an undo, which changes the page under the field', () => {
    const undone = send(typed(page, ['On!']), Message.Undid())
    expect(undone.editing).toEqual(Option.none())
    expect(textOf(undone)).toBe('One')
  })

  it('puts the text back on Escape when another edit came between', () => {
    const between = send(
      typed(page, ['On!']),
      Message.Applied({ op: Composition.Op.setProp(id('h1'), 'text', 'On!') }),
    )
    const cancelled = send(between, Message.EditingCancelled({ field: title }))
    expect(textOf(cancelled)).toBe('One')
    expect(cancelled.editing).toEqual(Option.none())
  })

  it('leaves another edit alone when the field is left as it was shown', () => {
    const between = send(
      typed(page, []),
      Message.Applied({ op: Composition.Op.setProp(id('h1'), 'text', 'Z') }),
    )
    for (const ended of [
      Message.EditingCancelled({ field: title }),
      Message.EditingCommitted({ field: title, text: 'One' }),
    ]) {
      const left = send(between, ended)
      expect(textOf(left)).toBe('Z')
      expect(left.page).toBe(between.page)
      expect(left.editing).toEqual(Option.none())
    }
  })

  it('records no empty step for a commit the page already holds', () => {
    const between = send(
      typed(page, ['On!']),
      Message.Applied({ op: Composition.Op.setProp(id('h1'), 'text', 'On!') }),
    )
    const done = send(between, Message.EditingCommitted({ field: title, text: 'On!' }))
    expect(done.page.past).toHaveLength(between.page.past.length)
  })

  it('keeps the session when asked again for the field being edited', () => {
    const again = send(typed(page, ['On!']), Message.EditingAsked({ field: title }))
    const cancelled = send(
      send(again, Message.FieldTyped({ field: title, text: 'On!!' })),
      Message.EditingCancelled({ field: title }),
    )
    expect(textOf(cancelled)).toBe('One')
    expect(History.canUndo(cancelled.page)).toBe(false)
  })
})

describe('previewing the page', () => {
  it('starts from the preview it was given, and sets and unsets one key at a time', () => {
    const Previewing = Builder.make('Previewing', {
      catalog: Site,
      renderer: SiteRenderer,
      starters: { Section: {} },
      preview: { audience: 'guest' },
    })
    expect(Previewing.initial.preview).toEqual({ audience: 'guest' })
    expect(PageBuilder.initial.preview).toEqual({})
    const member = send(
      Previewing.initial,
      Message.PreviewChosen({ key: 'audience', value: 'member' }),
    )
    expect(member.preview).toEqual({ audience: 'member' })
    const flagged = send(member, Message.PreviewChosen({ key: 'beta', value: true }))
    expect(flagged.preview).toEqual({ audience: 'member', beta: true })
    expect(send(flagged, Message.PreviewCleared({ key: 'audience' })).preview).toEqual({
      beta: true,
    })
    // A context value may itself be null, which is not the key unset.
    expect(send(flagged, Message.PreviewChosen({ key: 'audience', value: null })).preview).toEqual({
      audience: null,
      beta: true,
    })
  })
})

describe('a control of the application’s own in the inspector', () => {
  it('edits a prop through the Bundle behind it, with no Builder code', () => {
    const swatch = NodeId.make('swatch')
    const s = NodeId.make('s')
    const page = send(
      PageBuilder.replace(
        PageBuilder.initial,
        Composition.Document.make({
          format: 1,
          roots: [s],
          nodes: {
            [s]: { block: 'Section', props: {}, regions: { body: [swatch] } },
            [swatch]: { block: 'Swatch', props: { tint: '#000000' }, regions: {} },
          },
        }),
      ),
      Message.Selected({ id: swatch }),
    )
    const { props } = some(PageBuilder.inspecting(page), 'the swatch inspected')
    const chose = props.settings.control('tint', ColorMessage.Chose({ hex: '#ff0000' }))
    const picked = send(
      page,
      Message.Inspected({
        id: swatch,
        form: props.key,
        message: props.settings.encodeMessage(chose),
      }),
    )
    expect(picked.page.present.nodes[swatch]?.props).toEqual({ tint: '#ff0000' })
  })

  // A color picker's Model and Messages, and what else it may run.
  const HexModel = Schema.Struct({ hex: Schema.String })
  type HexModel = typeof HexModel.Type
  const Hexes = ManagedResource.tag<string>()('hexes')
  const running = {
    Subscriptions: {
      subscriptions: () =>
        Subscription.make<HexModel, typeof ColorMessage.Type>()(entry => ({
          tick: entry(
            { hex: Schema.String },
            {
              modelToDependencies: model => ({ hex: model.hex }),
              dependenciesToStream: () => Stream.empty,
            },
          ),
        })),
    },
    Resources: {
      resources: () =>
        ManagedResource.make<HexModel, typeof ColorMessage.Type>()(entry => ({
          hexes: entry(Schema.Option(Schema.String), {
            resource: Hexes,
            modelToMaybeRequirements: model => Option.some(model.hex),
            acquire: hex => Effect.succeed(hex),
            release: () => Effect.void,
            onAcquired: () => ColorMessage.Opened(),
            onReleased: () => ColorMessage.Opened(),
            onAcquireError: () => ColorMessage.Opened(),
          }),
        })),
    },
  }

  it.each(Object.entries(running))(
    'refuses one with %s where the Builder is made, as the inspector cannot run them',
    (_, runs) => {
      const Picker = Bundle.make({
        name: 'Picker',
        Model: HexModel,
        Message: ColorMessage,
        init: () => ({ model: { hex: '#000000' } }),
        update: (model: HexModel) => ({ model }),
        ...runs,
      })
      const Tinted = Block.define('Tinted', {
        Props: Schema.Struct({ tint: Schema.String }),
        provides: [Content.Section],
      }).pipe(
        Block.annotate(
          Builder.controls({
            tint: Input.bundle('Picker', {
              bundle: Picker,
              value: model => model.hex,
              fill: (model, hex) => ({ ...model, hex }),
            }),
          }),
        ),
      )
      const Tints = Catalog.make({ blocks: [Tinted], roots: [Content.Section] })
      expect(() =>
        Builder.make('Tints', {
          catalog: Tints,
          renderer: Renderer.make(Tints, { Tinted: ({ props, h }) => h.p([], [props.tint]) }),
          starters: {},
        }),
      ).toThrow('"TintedSettings" has a control with Subscriptions or Resources')
    },
  )
})

describe('the inspector, a form over each action an event runs', () => {
  const s = NodeId.make('s')
  const stat = NodeId.make('stat')
  const props = {
    value: 3,
    caption: 'posts',
    frame: { width: 2 },
    rank: '1',
    note: '',
    source: null,
  }
  const running = { action: 'subscribe', input: { list: 'news', times: 1, note: 'hi' } }
  const page = PageBuilder.replace(
    PageBuilder.initial,
    Composition.Document.make({
      format: 1,
      roots: [s],
      nodes: {
        [s]: { block: 'Section', props: {}, regions: { body: [stat] } },
        [stat]: { block: 'Stat', props, actions: { press: running }, regions: {} },
      },
    }),
  )
  const selected = send(page, Message.Selected({ id: stat }))
  const inspected = (model: Model) => some(PageBuilder.inspecting(model), 'a node inspected')
  const press = (model: Model) => required(inspected(model).on['press'], 'the press input')
  /** Types `value` into `key` of the press's input. */
  const type = (model: Model, key: string, value: string): Model => {
    const { key: form, settings } = press(model)
    return send(
      model,
      Message.Inspected({
        id: stat,
        form,
        message: settings.encodeMessage(settings.form.Message.Changed({ key, value })),
      }),
    )
  }
  const field = (model: Model, key: string) => {
    const { settings, model: form } = press(model)
    return settings.form.field(form, key)
  }
  const actions = (model: Model) => model.page.present.nodes[stat]?.actions

  it('draws a form for the input of each event that runs an action, and none for one that does not', () => {
    const { on } = inspected(selected)
    expect(Object.keys(on)).toEqual(['press'])
    expect(
      press(selected).settings.form.controls.map(each => [each.key, each.control.kind]),
    ).toEqual([
      ['list', 'Select'],
      ['times', 'Number'],
      ['note', 'Text'],
    ])
    expect(field(selected, 'note').value).toBe('hi')
  })

  it('sets the action again with the changed input over the rest', () => {
    const typed = type(selected, 'times', '4')
    expect(actions(typed)).toEqual({
      press: { action: 'subscribe', input: { list: 'news', times: 4, note: 'hi' } },
    })
    expect(typed.page.past).toHaveLength(selected.page.past.length + 1)
  })

  it('sets nothing from an input field that does not decode, and says why at the field', () => {
    const typed = type(selected, 'times', 'many')
    expect(typed.page).toBe(selected.page)
    expect(field(typed, 'times')).toEqual({
      _tag: 'Invalid',
      value: 'many',
      errors: ['Enter a number'],
    })
  })

  it('starts a newly chosen action’s input from its fields’ empty values, as stored', () => {
    expect(inputOf(Stat, 'hold', Subscribe).seed()).toEqual({ list: 'news', times: 0, note: '' })
    // A field drawn as an `Option` starts as the `null` it is stored as, not left out.
    const Tagged = {
      ...Subscribe,
      name: 'tagged',
      input: Schema.Struct({ tag: Schema.OptionFromNullOr(Schema.String) }),
    }
    expect(inputOf(Stat, 'hold', Tagged).seed()).toEqual({ tag: null })
  })

  it('names each event’s form for its event, so two that run one action draw apart', () => {
    const { settings } = press(selected)
    const both = send(
      selected,
      Message.Applied({ op: Composition.Op.setAction(stat, 'hold', running) }),
    )
    const hold = required(inspected(both).on['hold'], 'the hold input')
    expect([settings.form.bundle.name, hold.settings.form.bundle.name]).toEqual([
      'Stat-press-subscribe',
      'Stat-hold-subscribe',
    ])
  })

  it('refills an input field when the action changes another way, and forgets one it no longer runs', () => {
    const typed = type(selected, 'note', 'there')
    expect(field(send(typed, Message.Undid()), 'note').value).toBe('hi')
    const stopped = send(
      typed,
      Message.Applied({ op: Composition.Op.setAction(stat, 'press', null) }),
    )
    expect(inspected(stopped).on).toEqual({})
    // It held only that form, so it holds nothing now.
    expect(stopped.inspector).toEqual(Option.none())
  })
})

describe('the inspector, a form over the selected node', () => {
  // A Section holding a Stat and a Heading, the Stat selected.
  const s = NodeId.make('s')
  const stat = NodeId.make('stat')
  const heading = NodeId.make('heading')
  const page = PageBuilder.replace(
    PageBuilder.initial,
    Composition.Document.make({
      format: 1,
      roots: [s],
      nodes: {
        [s]: { block: 'Section', props: {}, regions: { body: [stat, heading] } },
        [stat]: {
          block: 'Stat',
          props: {
            value: 3,
            caption: 'posts',
            frame: { width: 2 },
            rank: '1',
            note: '',
            source: null,
          },
          regions: {},
        },
        [heading]: { block: 'Heading', props: { text: 'Hello' }, regions: {} },
      },
    }),
  )
  const selected = send(page, Message.Selected({ id: stat }))
  /** The selected node's id and its props form. */
  const inspecting = (model: Model) => {
    const { id, props } = some(PageBuilder.inspecting(model), 'a node inspected')
    return { id, ...props }
  }
  /** Types `value` into the selected node's `key` field. */
  const type = (model: Model, key: string, value: string): Model => {
    const { id, settings } = inspecting(model)
    return send(
      model,
      Message.Inspected({
        id,
        form: 'props',
        message: settings.encodeMessage(settings.form.Message.Changed({ key, value })),
      }),
    )
  }
  /** What the selected node's `key` field shows, and whether it is in error. */
  const field = (model: Model, key: string) => {
    const { settings, model: form } = inspecting(model)
    return settings.form.field(form, key)
  }
  const props = (model: Model, id: NodeId) => model.page.present.nodes[id]?.props

  it('fills its fields from the node, labelled, with the controls the Block asks for', () => {
    // A prop no control fits is shown as stored, not edited.
    expect(inspecting(selected).settings.shown(props(selected, stat) ?? {})).toEqual([
      { key: 'frame', label: 'Frame', value: { width: 2 } },
    ])
    const { settings } = inspecting(selected)
    expect(settings.form.controls.map(each => [each.key, each.control.kind, each.label])).toEqual([
      ['value', 'Number', 'Value'],
      ['caption', 'Multiline', 'What it counts'],
      ['rank', 'Text', 'Rank'],
      ['note', 'Text', 'Note'],
      ['source', 'Text', 'Source'],
    ])
    // Its words are the prop's, which its stored side does not carry.
    expect(settings.form.controls.find(each => each.key === 'source')?.description).toBe(
      'Where the number comes from',
    )
    expect(field(selected, 'value').value).toBe('3')
    expect(field(selected, 'caption').value).toBe('posts')
  })

  it('keeps every prop two control hints ask for, the later one winning a prop', () => {
    const annotated = Block.annotate(
      Builder.controls({ caption: Input.text(), value: Input.hidden() }),
    )(Stat)
    expect(Metadata.summarize(annotated.metadata)).toEqual([
      { name: 'foldkit-builder/controls', entries: ['caption: Text, value: Hidden'] },
    ])
  })

  it('sets a prop from a field that decodes, typing a word as one undo step', () => {
    const typed = type(type(selected, 'caption', 'po'), 'caption', 'people')
    expect(props(typed, stat)).toEqual({
      value: 3,
      caption: 'people',
      frame: { width: 2 },
      rank: '1',
      note: '',
      source: null,
    })
    expect(typed.page.past).toHaveLength(selected.page.past.length + 1)
    expect(props(type(selected, 'value', '12'), stat)).toEqual({
      value: 12,
      caption: 'posts',
      frame: { width: 2 },
      rank: '1',
      note: '',
      source: null,
    })
  })

  it('sets nothing from a field that does not decode, and says why at the field', () => {
    const typed = type(selected, 'value', 'abc')
    expect(typed.page).toBe(selected.page)
    expect(field(typed, 'value')).toEqual({
      _tag: 'Invalid',
      value: 'abc',
      errors: ['Enter a number'],
    })
    // Typed back to what the node holds: nothing to set, so no step to undo.
    expect(type(typed, 'value', '3').page).toBe(selected.page)
    // What the prop's own Schema checks is said at the field too.
    const long = type(selected, 'caption', 'posts and comments')
    expect(long.page).toBe(selected.page)
    expect(field(long, 'caption')).toMatchObject({ _tag: 'Invalid', value: 'posts and comments' })
    expect(JSON.stringify(field(long, 'caption'))).toContain('Keep it short')
    // A check past a transformation too: the rank is stored as text, and checked as a number.
    const negative = type(selected, 'rank', '-1')
    expect(negative.page).toBe(selected.page)
    expect(JSON.stringify(field(negative, 'rank'))).toContain('Above zero')
    expect(props(type(selected, 'rank', '4'), stat)?.['rank']).toBe('4')
  })

  it('refills a field when the node changes another way, but keeps text that does not decode', () => {
    const typed = type(selected, 'caption', 'people')
    const undone = send(typed, Message.Undid())
    expect(field(undone, 'caption').value).toBe('posts')

    const held = type(type(selected, 'caption', 'people'), 'value', 'abc')
    const undoneHeld = send(held, Message.Undid())
    expect(field(undoneHeld, 'caption').value).toBe('posts')
    expect(field(undoneHeld, 'value').value).toBe('abc')
  })

  it('shows a stored prop that no longer decodes, with its error, and fills the rest', () => {
    // Stored before the Block's Schema changed, say: the page no longer holds it that way.
    const stored = PageBuilder.replace(
      PageBuilder.initial,
      Composition.Document.make({
        format: 1,
        roots: [s],
        nodes: {
          [s]: { block: 'Section', props: {}, regions: { body: [stat] } },
          [stat]: {
            block: 'Stat',
            props: {
              value: 'many',
              caption: 'posts',
              frame: { width: 2 },
              rank: '1',
              note: '',
              source: null,
            },
            regions: {},
          },
        },
      }),
    )
    const shown = send(stored, Message.Selected({ id: stat }))
    expect(field(shown, 'value')).toEqual({
      _tag: 'Invalid',
      value: 'many',
      errors: ['Enter a number'],
    })
    expect(field(shown, 'caption').value).toBe('posts')
  })

  it('reads a Builder saved before it held anything, and saves what it holds', () => {
    const { inspector: _, ...before } = Schema.encodeSync(Model)(selected)
    expect(Schema.decodeUnknownSync(Model)(before).inspector).toEqual(Option.none())
    const held = type(selected, 'value', 'abc')
    const saved = JSON.parse(JSON.stringify(Schema.encodeSync(Model)(held)))
    expect(field(Schema.decodeUnknownSync(Model)(saved), 'value').value).toBe('abc')
  })

  it('ignores a form Message for a node no longer selected', () => {
    const { settings } = inspecting(selected)
    const late = Message.Inspected({
      id: heading,
      form: 'props',
      message: settings.encodeMessage(settings.form.Message.Changed({ key: 'value', value: '9' })),
    })
    expect(send(selected, late)).toEqual(selected)
  })

  it('forgets what it held when the selection moves', () => {
    const held = type(selected, 'value', 'abc')
    const moved = send(held, Message.Selected({ id: heading }))
    expect(moved.inspector).toEqual(Option.none())
    expect(field(moved, 'text').value).toBe('Hello')
    // Back on the Stat, its field shows the node again.
    expect(field(send(moved, Message.Selected({ id: stat })), 'value').value).toBe('3')
  })
})

describe('the inspector, where a value is cleared or refused', () => {
  const Sheet = Block.define('Sheet', {
    Props: Schema.Struct({}),
    regions: { body: Region.many({ accepts: [Content.Flow] }) },
    provides: [Content.Section],
  })
  const Range = Block.define('Range', {
    Props: Schema.Struct({
      min: Schema.Number,
      max: Schema.Number,
      step: Schema.optional(Schema.Number),
    }).check(Schema.makeFilter(range => (range.min <= range.max ? undefined : 'min above max'))),
    provides: [Content.Flow],
    events: ['press'],
  })
  const Notify = {
    name: 'notify',
    description: 'Send a note',
    input: Schema.Struct({ to: Schema.String, times: Schema.optional(Schema.Number) }),
    toMessage: (input: { readonly to: string; readonly times?: number | undefined }) => input,
  }
  const catalog = Catalog.make({
    blocks: [Sheet, Range],
    actions: [Notify],
    roots: [Content.Section],
  })
  const Ranges = Builder.make('Ranges', {
    catalog,
    renderer: Renderer.make(catalog, {
      Sheet: ({ regions, h }) => h.section([], [...regions.body]),
      Range: ({ h }) => h.div([], []),
    }),
    starters: { Sheet: {} },
  })
  const s = NodeId.make('s')
  const r = NodeId.make('r')
  const page = Ranges.replace(
    Ranges.initial,
    Composition.Document.make({
      format: 1,
      roots: [s],
      nodes: {
        [s]: { block: 'Sheet', props: {}, regions: { body: [r] } },
        [r]: {
          block: 'Range',
          props: { min: 1, max: 5, step: 2 },
          // `old` is a key the action's input no longer names.
          actions: { press: { action: 'notify', input: { to: 'ann', times: 3, old: true } } },
          regions: {},
        },
      },
    }),
  )
  /** Ranges has no Commands this needs answered: a refusal's timer is left unrun. */
  const send = (model: Model, message: Message): Model =>
    Ranges.bundle.update(model, message, undefined).model
  const selected = send(page, Message.Selected({ id: r }))
  const inspected = (model: Model) => some(Ranges.inspecting(model), 'the range inspected')
  const formOf = (model: Model, form: string) =>
    form === 'props'
      ? inspected(model).props
      : required(inspected(model).on['press'], 'the press input')
  const type = (model: Model, form: string, key: string, value: string): Model => {
    const { key: named, settings } = formOf(model, form)
    return send(
      model,
      Message.Inspected({
        id: r,
        form: named,
        message: settings.encodeMessage(settings.form.Message.Changed({ key, value })),
      }),
    )
  }
  const node = (model: Model) => required(model.page.present.nodes[r], 'the range')

  it('shows what the node holds again when the node refuses a value', () => {
    const refused = type(selected, 'props', 'min', '9')
    expect(Option.isSome(refused.refused)).toBe(true)
    expect(node(refused).props).toEqual({ min: 1, max: 5, step: 2 })
    const { settings, model } = formOf(refused, 'props')
    expect(settings.form.field(model, 'min').value).toBe('1')
    // Typing on is not refused again: the field keeps what is typed while the refusal still shows.
    const typedOn = type(refused, 'props', 'min', '1.0')
    expect(Option.isSome(typedOn.refused)).toBe(true)
    const again = formOf(typedOn, 'props')
    expect(again.settings.form.field(again.model, 'min').value).toBe('1.0')
  })

  it('takes away an optional prop, and an optional input, whose field is emptied', () => {
    const cleared = type(selected, 'props', 'step', '')
    expect(node(cleared).props).toEqual({ min: 1, max: 5 })
    const input = type(selected, 'press', 'times', '')
    expect(node(input).actions?.['press']).toEqual({ action: 'notify', input: { to: 'ann' } })
  })

  it('takes nothing away for a required field emptied: the field says it is required', () => {
    const emptied = type(selected, 'props', 'min', '')
    expect(emptied.page).toBe(selected.page)
    expect(emptied.refused).toEqual(Option.none())
    const { settings, model } = formOf(emptied, 'props')
    expect(settings.form.field(model, 'min')).toMatchObject({ _tag: 'Invalid', value: '' })
  })

  it('keeps only the keys the action’s input names when it writes the input', () => {
    const typed = type(selected, 'press', 'to', 'bo')
    expect(node(typed).actions?.['press']).toEqual({
      action: 'notify',
      input: { to: 'bo', times: 3 },
    })
  })

  it('takes no held form Message with a key its variant lacks', () => {
    const { settings } = formOf(selected, 'props')
    expect(
      settings.decodeMessage({ _tag: 'Changed', key: 'min', value: '2', extra: true }),
    ).toEqual(Option.none())
    expect(Option.isSome(settings.decodeMessage({ _tag: 'Changed', key: 'min', value: '2' }))).toBe(
      true,
    )
  })
})
