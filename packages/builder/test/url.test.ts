// @vitest-environment jsdom
/**
 * The selection in the URL, as the README's recipe puts it: a link names a
 * Block, which the parent sends the Builder as a selection, and a Subscription
 * over the Builder's selection writes the URL back. The Builder stays the
 * selection's only owner.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Composition, NodeId } from 'foldkit-composition'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { defineMessageUnion } from 'foldkit/message'
import * as Navigation from 'foldkit/navigation'
import * as Subscription from 'foldkit/subscription'
import { Url, fromString } from 'foldkit/url'
import { afterEach, expect, it } from 'vitest'
import { Message as BuilderMessage } from 'foldkit-builder'
import { PageBuilder, Site } from './fixture.js'

afterEach(() => window.history.replaceState({}, '', '/'))

const Page = Entity.define(
  'Page',
  Schema.Struct({ id: Schema.String, document: Composition.Document }),
)
const PageForm = Form.make(
  'PageForm',
  Entity.input(
    Page,
    Schema.Struct({ document: Composition.Document.check(Composition.valid(Site)) }),
  ),
  { inputs: { document: PageBuilder.input } },
)
const Slot = Bundle.declare(PageForm.bundle, 'page')
const Model = Schema.Struct({ ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases, UrlChanged: { url: Url } })
type Message = typeof Message.Type
const Parent = Bundle.parent({ Model, Message })
const placements = Parent.assemble(Parent.at(Slot, { onOut: () => model => ({ model }) }))

// --- The recipe ---

/** The Block a link names, as `?block=`. */
const blockIn = (url: Url): Option.Option<NodeId> =>
  Option.map(
    Option.filter(
      Option.fromNullOr(new URLSearchParams(Option.getOrElse(url.search, () => '')).get('block')),
      id => id !== '',
    ),
    NodeId.make,
  )

/** In: a navigation selects the Block it names, through the Builder's own `update`. */
const selectFrom = (url: Url) =>
  Message.GotPageMessage({
    message: PageForm.control('document').send(
      Option.match(blockIn(url), {
        onNone: () => BuilderMessage.Deselected(),
        onSome: id => BuilderMessage.Selected({ id }),
      }),
    ),
  })

const update = placements.update((model, message) =>
  message._tag === 'UrlChanged'
    ? {
        model,
        commands: [{ name: 'SelectFromUrl', effect: Effect.succeed(selectFrom(message.url)) }],
      }
    : { model },
)

/** Out: the Builder's selection, written into the URL whenever it changes. */
const selectionUrl = Subscription.make<Model, Message>()(entry => ({
  selectionUrl: entry(
    { block: Schema.Option(Schema.String) },
    {
      modelToDependencies: model => ({
        block: PageForm.control('document').field(model.page).value.selected,
      }),
      dependenciesToStream: ({ block }) =>
        // Nothing selected leaves the URL alone: a page still loading keeps its link.
        Option.match(block, {
          onNone: () => Stream.empty,
          onSome: id => Stream.fromEffect(Navigation.replaceUrl(`?block=${id}`)).pipe(Stream.drain),
        }),
    },
  ),
}))

// --- Driving it ---

/** Applies a Message, and each Message its Commands answer with, in turn. */
const send = (model: Model, message: Message): Model => {
  const result = update(model, message)
  return (result.commands ?? []).reduce(
    (next, command) => send(next, Effect.runSync(command.effect)),
    result.model,
  )
}
const selectedOf = (model: Model) => PageForm.control('document').field(model.page).value.selected
const urlOf = (href: string): Url => Option.getOrThrow(fromString(`https://example.com${href}`))

const page = Composition.Document.make({
  format: 1,
  roots: [NodeId.make('s')],
  nodes: {
    [NodeId.make('s')]: { block: 'Section', props: {}, regions: { body: [] } },
  },
})
const opened: Model = (() => {
  const initial = placements.initial({}).model
  return { ...initial, page: PageForm.fill(initial.page, { document: page }).model }
})()

it('selects the Block a link names, and nothing for one the page lacks', () => {
  expect(selectedOf(send(opened, Message.UrlChanged({ url: urlOf('/edit?block=s') })))).toEqual(
    Option.some('s'),
  )
  expect(selectedOf(send(opened, Message.UrlChanged({ url: urlOf('/edit?block=gone') })))).toEqual(
    Option.none(),
  )
})

it('writes the selection into the URL, and leaves it when nothing is selected', async () => {
  window.history.replaceState({}, '', '/edit')
  const [entry] = Object.values(selectionUrl)
  if (entry === undefined) throw new Error('no selection Subscription')
  const write = (model: Model) =>
    Effect.runPromise(Stream.runDrain(entry.dependenciesToStream(entry.modelToDependencies(model))))
  await write(send(opened, Message.UrlChanged({ url: urlOf('/edit?block=s') })))
  expect(`${window.location.pathname}${window.location.search}`).toBe('/edit?block=s')
  await write(opened)
  expect(window.location.search).toBe('?block=s')
})
