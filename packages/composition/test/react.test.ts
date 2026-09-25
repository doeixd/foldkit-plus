// @vitest-environment jsdom
/**
 * A React Block beside a Foldkit Block, on a running page: a Block's view is
 * any Foldkit Html, so it may be a `foldkit-react` island, and the React
 * component's event runs the node's action like a Foldkit button's would.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { ReactComponent } from 'foldkit-react'
import { createElement } from 'react'
import { expect, it, vi } from 'vitest'
import { Block, Catalog, Composition, Content, Region } from '../src/index.js'
import { Renderer } from '../src/foldkit/index.js'

const Message = defineMessageUnion({ Subscribed: { list: Schema.String } })
type Message = typeof Message.Type
const Model = Schema.Struct({ lists: Schema.Array(Schema.String) })
type Model = typeof Model.Type

const Subscribe = {
  name: 'subscribe',
  description: 'Subscribe to a list',
  input: Schema.Struct({ list: Schema.String }),
  toMessage: (input: { readonly list: string }) => Message.Subscribed(input),
}

const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String }),
  provides: [Content.Flow],
})
/** A Block drawn by a React component. */
const Signup = Block.define('Signup', {
  Props: Schema.Struct({ label: Schema.String }),
  provides: [Content.Flow],
  events: ['press'],
})
const Site = Catalog.make({
  blocks: [Section, Heading, Signup],
  roots: [Content.Section],
  actions: [Subscribe],
})

const Button = (props: { readonly label: string; readonly onPress?: () => void }) =>
  createElement('button', { className: 'signup', onClick: props.onPress }, props.label)
const ReactButton = ReactComponent.define(Button, { events: ['onPress'] })

const SiteRenderer = Renderer.forMessages<Message>().make(Site, {
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Heading: ({ props, h }) => h.h2([], [props.text]),
  Signup: ({ props, on, h }) => {
    const pressed = on('press')
    return ReactButton.view(
      {
        props: { label: props.label },
        messages: pressed === undefined ? {} : { onPress: () => pressed },
      },
      h,
    )
  },
})

const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['s'],
  nodes: {
    s: { block: 'Section', props: {}, regions: { body: ['h', 'join'] } },
    h: { block: 'Heading', props: { text: 'Newsletter' }, regions: {} },
    join: {
      block: 'Signup',
      props: { label: 'Join' },
      regions: {},
      actions: { press: { action: 'subscribe', input: { list: 'news' } } },
    },
  },
})

it('draws a React Block beside a Foldkit Block, its event running the node’s action', async () => {
  const container = document.createElement('div')
  container.id = 'page'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { lists: [] } }),
      update: (model: Model, message: Message) => ({
        model: { lists: [...model.lists, message.list] },
      }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.main(
          [h.DataAttribute('lists', model.lists.join(','))],
          Renderer.render(SiteRenderer, page, h),
        ),
    }),
  )
  try {
    await vi.waitFor(() => expect(document.querySelector('.signup')?.textContent).toBe('Join'))
    expect(document.querySelector('h2')?.textContent).toBe('Newsletter')
    document.querySelector<HTMLButtonElement>('.signup')?.click()
    await vi.waitFor(() =>
      expect(document.querySelector('main')?.getAttribute('data-lists')).toBe('news'),
    )
  } finally {
    handle.dispose()
    container.remove()
  }
})
