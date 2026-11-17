/**
 * A preset may hold behaviour: a mixin with a Mount, given in `presets`,
 * attaches to the buttons drawn with that preset and to no other.
 */
import { Schema, Stream } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MountAction } from 'foldkit/mount'
import * as Runtime from 'foldkit/runtime'
import { Behavior, Capability } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { Button, ButtonSlots } from '../src/index.js'

const Model = Schema.Struct({})

// What the Mount does when it runs: nothing but leave a mark a test can read.
const marks: MountAction<never> = {
  name: 'Marks',
  f: element => {
    element.setAttribute('data-preset-mounted', 'true')
    return Stream.empty
  },
}

const Marked = Behavior.forSlots(ButtonSlots)<unknown, never>(
  {
    button: Behavior.slot({
      requires: { capability: Capability.Interactive },
      mount: () => marks,
    }),
  },
  { name: 'Marked' },
).mixin

const App = Button.configure({ presets: { marked: { mixins: [Marked] } } })

let handle: { dispose: () => void } | undefined

afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

test('a Mount a preset carries runs on the button drawn with it, and on no other', async () => {
  const container = document.createElement('div')
  container.id = 'configure-mount'
  document.body.appendChild(container)
  handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>): Html =>
        h.div(
          [],
          [
            h.div([h.Id('with')], [App.view({ label: 'With', preset: 'marked' }, h)]),
            h.div([h.Id('without')], [App.view({ label: 'Without' }, h)]),
          ],
        ),
    }),
  )
  const button = (id: string) => document.querySelector(`#${id} button`)
  await vi.waitFor(() => expect(button('with')?.getAttribute('data-preset-mounted')).toBe('true'))
  expect(button('without')).not.toBeNull()
  expect(button('without')?.hasAttribute('data-preset-mounted')).toBe(false)
})
