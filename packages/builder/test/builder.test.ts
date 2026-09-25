import { Result, Schema } from 'effect'
import { Composition, NodeId, type Document } from 'foldkit-composition'
import { History } from 'foldkit-primitives/state'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { describe, expect, it } from 'vitest'
import { Builder, Layers, Message, Model } from 'foldkit-builder'
import { TreeNavigation } from 'foldkit-primitives/interaction'
import { PageBuilder, Site, SiteRenderer, answer, isTimer } from './fixture.js'

const { update } = PageBuilder.bundle
const step = (model: Model, message: Message) => update(model, message, undefined)

/** The value, or a failed test saying what was missing: no assertion needed. */
const required = <A>(value: A | undefined, what: string): A => {
  if (value === undefined) throw new Error(`expected ${what}`)
  return value
}

/** Sends a Message, and the Message each Command answers with, until none is left. */
const send = (model: Model, message: Message): Model => {
  const result = step(model, message)
  return (result.commands ?? [])
    .filter(command => !isTimer(command))
    .reduce((next, command) => send(next, answer(command)), result.model)
}
type Offered = 'Section' | 'Heading'
const at = (model: Model, block: Offered) =>
  required(PageBuilder.placeFor(model.page.present, model.selected, block), `a place for ${block}`)
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
    expect(withSection.selected).toBe(section)
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
      Composition.root(1),
    )
  })

  it('refuses a Block with no starting props, and forgets the refusal at the next edit', () => {
    const refused = step(
      PageBuilder.initial,
      Message.InsertAsked({ block: 'Button', at: Composition.root(0) }),
    ).model
    expect(refused.refused?.message).toBe(
      '"Button" has no starting props, so it cannot be inserted',
    )
    expect(insert(refused, 'Section').refused).toBeNull()
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
    expect(PageBuilder.moveBy(model.page.present, second, 1)).toBeUndefined()
    model = send(
      model,
      Message.Applied({
        op: required(PageBuilder.moveBy(model.page.present, second, -1), 'a move'),
      }),
    )
    expect(model.page.present.nodes[section]?.regions['body']).toEqual([second, first])

    model = send(model, Message.DuplicateAsked({ id: section, at: Composition.root(1) }))
    expect(model.page.present.roots).toHaveLength(2)
    const copy = required(model.page.present.roots[1], 'the copy')
    expect(model.selected).toBe(copy)
    expect(model.page.present.nodes[copy]?.regions['body']).toHaveLength(2)
    expect(Composition.validate(Site, model.page.present)).toEqual([])

    model = send(model, Message.Applied({ op: Composition.Op.remove(copy) }))
    expect(model.selected).toBeNull()
    expect(model.page.present.roots).toEqual([section])
  })

  it('replaces the Document from outside, starting undo over, and settles a stored Model', () => {
    const edited = insert(insert(PageBuilder.initial, 'Section'), 'Heading')
    const replaced = PageBuilder.replace(edited, Composition.empty())
    expect(replaced.page.past).toEqual([])
    expect(replaced.selected).toBeNull()
    const settled = PageBuilder.settle({ ...edited, hovered: edited.selected })
    expect(settled.page.past).toEqual([])
    expect(settled.hovered).toBeNull()
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
    const message = PageBuilder.keyCommand(model, key, modifiers)
    return message === undefined ? model : send(model, message)
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
    expect(out.refused?.code).toBe('composition:root-rejects')
    // Into the node above: the upper heading holds nothing, so nothing to move into.
    expect(PageBuilder.keyCommand(selectedLower, 'ArrowRight', alt)).toBeUndefined()
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
    expect(PageBuilder.keyCommand(selected, 'ArrowRight', alt)).toBeUndefined()
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
    expect(PageBuilder.keyCommand({ ...removed, selected: null }, 'Delete', plain)).toBeUndefined()
    expect(PageBuilder.keyCommand(removed, 'a', plain)).toBeUndefined()
  })

  it('selects the node the layers’ keyboard focus moves to', () => {
    const { model, first } = twoSections()
    const focused = send(model, Layers.wrapper.make(TreeNavigation.Message.Focused({ id: first })))
    expect(focused.selected).toBe(first)
    expect(focused.layers.current).toBe(first)
    const stray = send(model, Layers.wrapper.make(TreeNavigation.Message.Focused({ id: 'gone' })))
    expect(stray.selected).toBe(model.selected)
  })

  it('starts the layers’ keys from a selection made anywhere else', () => {
    const { model, first } = twoSections()
    const selected = send(model, Message.Selected({ id: first }))
    expect(selected.layers.current).toBe(first)
    const cleared = send(selected, Message.Selected({ id: null }))
    expect(cleared.layers.current).toBe(first)
  })

  it('says what an edit did, and says a refusal assertively', () => {
    const edited = step(
      insert(PageBuilder.initial, 'Section'),
      Message.InsertAsked({ block: 'Heading', at: Composition.root(0) }),
    )
    const minted = send(edited.model, answer(required(edited.commands?.[0], 'the mint')))
    expect(minted.refused?.code).toBe('composition:root-rejects')
    expect(minted.announcer.pending).toEqual({
      message: minted.refused?.message,
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

  it('drops before, after or inside a node, counting places without the node dragged', () => {
    const drop = PageBuilder.dropAt
    expect(drop(document, id('h1'), id('h2'), 'after')).toEqual(
      Composition.region(id('s1'), 'body', 2),
    )
    expect(drop(document, id('h2'), id('h1'), 'before')).toEqual(
      Composition.region(id('s1'), 'body', 0),
    )
    expect(drop(document, id('h1'), id('g'), 'inside')).toEqual(
      Composition.region(id('g'), 'items', 0),
    )
    expect(drop(document, id('s2'), id('s1'), 'before')).toEqual(Composition.root(0))
  })

  it('drops inside a node that takes nothing as after it, and nowhere the page refuses', () => {
    const drop = PageBuilder.dropAt
    expect(drop(document, id('h1'), id('h2'), 'inside')).toEqual(
      Composition.region(id('s1'), 'body', 2),
    )
    // A Section fits neither in a Group nor among a Section's Flow.
    expect(drop(document, id('s2'), id('g'), 'inside')).toBeUndefined()
    expect(drop(document, id('h1'), id('h1'), 'after')).toBeUndefined()
    expect(drop(document, id('h1'), id('gone'), 'after')).toBeUndefined()
  })

  it('selects what it drags, and moves it on the drop as one undoable, announced edit', () => {
    const started = send(page, Message.DragStarted({ id: id('h1') }))
    expect(started.selected).toBe(id('h1'))
    const over = send(started, Message.DraggedOver({ over: { id: id('g'), zone: 'inside' } }))
    expect(over.drag).toEqual({
      id: id('h1'),
      over: { id: id('g'), zone: 'inside' },
      at: Composition.region(id('g'), 'items', 0),
    })
    // Nothing moves until the drop.
    expect(over.page).toBe(page.page)
    const dropped = send(over, Message.DragDropped())
    expect(dropped.drag).toBeNull()
    expect(dropped.page.present.nodes[id('g')]?.regions['items']).toEqual([id('h1')])
    expect(dropped.announcer.pending?.message).toBe('Moved Heading, 1 of 1 in Group items')
    expect(send(dropped, Message.Undid()).page.present).toBe(document)
  })

  it('moves nothing on a drop the page refuses, or a cancel, and says so', () => {
    const refused = send(
      send(page, Message.DragStarted({ id: id('s2') })),
      Message.DraggedOver({ over: { id: id('g'), zone: 'inside' } }),
    )
    expect(refused.drag?.at).toBeNull()
    // Over a Heading, which takes nothing inside, the drop is marked where it lands.
    const beside = send(
      send(page, Message.DragStarted({ id: id('h1') })),
      Message.DraggedOver({ over: { id: id('h2'), zone: 'inside' } }),
    )
    expect(beside.drag?.over).toEqual({ id: id('h2'), zone: 'after' })
    const dropped = send(refused, Message.DragDropped())
    expect(dropped.page).toBe(page.page)
    expect(dropped.drag).toBeNull()
    expect(dropped.announcer.pending?.message).toBe('Not moved')
    const cancelled = send(refused, Message.DragCancelled())
    expect(cancelled.page).toBe(page.page)
    expect(cancelled.drag).toBeNull()
    expect(cancelled.announcer.pending?.message).toBe('Not moved')
  })

  it('counts a drop onto a node’s own place as no move, and drops where the page is now', () => {
    // h1 is first; before g is where it already is.
    expect(PageBuilder.dropAt(document, id('h1'), id('g'), 'before')).toBeUndefined()
    const over = send(
      send(page, Message.DragStarted({ id: id('h2') })),
      Message.DraggedOver({ over: { id: id('h1'), zone: 'before' } }),
    )
    expect(over.drag?.at).toEqual(Composition.region(id('s1'), 'body', 0))
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
    expect(send(page, Message.DragStarted({ id: id('gone') })).drag).toBeNull()
    expect(send(page, Message.DraggedOver({ over: null }))).toBe(page)
    expect(send(page, Message.DragDropped())).toBe(page)
    expect(send(page, Message.DragCancelled())).toBe(page)
    const dragging = send(page, Message.DragStarted({ id: id('h1') }))
    expect(PageBuilder.settle(dragging).drag).toBeNull()
    expect(PageBuilder.replace(dragging, document).drag).toBeNull()
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
    expect(send(flagged, Message.PreviewChosen({ key: 'audience', value: null })).preview).toEqual({
      beta: true,
    })
  })
})
