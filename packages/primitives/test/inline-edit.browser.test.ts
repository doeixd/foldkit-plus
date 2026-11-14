/**
 * InlineEdit in a real browser with real keys: starting, typing faster than
 * a frame, Enter, Escape, leaving the field, a refusal, where focus goes,
 * two items, a modal dialog around the list, and an input method.
 */
import { Match, Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { InlineEdit } from '../src/interaction/index.js'

const Item = Schema.Struct({ id: Schema.String, title: Schema.String })
type Item = typeof Item.Type

const Title = Bundle.declare(InlineEdit.bundle, 'title')
const Model = Schema.Struct({ ...Title.fields, items: Schema.Array(Item) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Title.cases, ClickedOutside: {} })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })

const args = { id: 'titles', blur: 'commit' } as const
const placed = Page.at(Title, {
  args,
  onOut:
    (out: InlineEdit.Committed) =>
    (model: Model): Update.Return<Model, Message> =>
      out.value.trim() === ''
        ? placed.helpers.refuse(out, 'A title is needed')(model)
        : {
            model: {
              ...model,
              items: model.items.map(item =>
                item.id === out.id ? { ...item, title: out.value } : item,
              ),
            },
          },
})
const placements = Page.assemble(placed)

const ListSlots = Slots.define({
  title: Slot.make({ capability: Capability.Focusable }),
  field: Slot.make({ capability: Capability.TextInput, events: [Event.KeyDown] }),
  error: Slot.make({ capability: Capability.Base }),
})
const editor = InlineEdit.behavior(Title, args)(ListSlots)<Model, Message>({
  display: 'title',
  input: 'field',
  error: 'error',
  value: (model, id) => model.items.find(item => item.id === id)?.title ?? '',
})

const update = placements.update(
  (model: Model, message: Bundle.OwnMessage<Message, typeof placements.placements>) =>
    Match.valueTags(message, {
      ClickedOutside: (): Update.Return<Model, Message> => ({ model }),
    }),
)

const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(ListSlots, [editor.mixin], { input: model, h })
  const editing = Option.getOrNull(model.title.editing)
  return h.div(
    [],
    [
      h.ul(
        [],
        model.items.map((item, index) =>
          h.li(
            [h.Key(item.id)],
            editing?.id === item.id
              ? [
                  h.input(builders.field.attrs([h.AriaLabel(`Rename ${item.title}`)])),
                  ...Option.match(InlineEdit.errorOf(model.title), {
                    onNone: () => [],
                    onSome: error => [h.p(builders.error.attrs(), [error])],
                  }),
                ]
              : [
                  h.button(
                    builders.title.attrs([h.Type('button')], {
                      index,
                      id: item.id,
                      count: model.items.length,
                    }),
                    [item.title],
                  ),
                ],
          ),
        ),
      ),
      h.button([h.Id('outside'), h.OnClick(Message.ClickedOutside())], ['Elsewhere']),
    ],
  )
}

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const start = async (host: HTMLElement = document.body) => {
  const container = document.createElement('div')
  container.id = 'inline-edit'
  host.append(container)
  dispose = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () =>
        placements.initial({
          items: [
            { id: 'a', title: 'Plan' },
            { id: 'b', title: 'Build' },
          ],
        }),
      update,
      view,
      slow: false,
    }),
  ).dispose
  await vi.waitFor(() => expect(display('a')).not.toBeNull())
}

const display = (id: string) => document.getElementById(InlineEdit.displayId(args, id))
const field = () => document.getElementById(InlineEdit.inputId(args)) as HTMLInputElement | null
const titles = () => Array.from(document.querySelectorAll('li')).map(item => item.textContent ?? '')

it('Enter starts with the text selected, typing replaces it, Enter saves and focus comes back', async () => {
  await start()
  display('a')!.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(field()))
  expect(field()!.value).toBe('Plan')
  expect([field()!.selectionStart, field()!.selectionEnd]).toEqual([0, 4])
  await userEvent.keyboard('Ship{Enter}')
  await vi.waitFor(() => expect(titles()).toEqual(['Ship', 'Build']))
  await vi.waitFor(() => expect(document.activeElement).toBe(display('a')))
})

it('F2 and a double click start too', async () => {
  await start()
  display('b')!.focus()
  await userEvent.keyboard('{F2}')
  await vi.waitFor(() => expect(document.activeElement).toBe(field()))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(document.activeElement).toBe(display('b')))
  await userEvent.dblClick(display('a')!)
  await vi.waitFor(() => expect(document.activeElement).toBe(field()))
  expect(field()!.value).toBe('Plan')
})

it('keeps every key typed straight after the one that starts the edit', async () => {
  await start()
  display('a')!.focus()
  await userEvent.keyboard('{Enter}Roadmap{Enter}')
  await vi.waitFor(() => expect(titles()).toEqual(['Roadmap', 'Build']))
  display('b')!.focus()
  await userEvent.keyboard('Deploy{Enter}')
  await vi.waitFor(() => expect(titles()).toEqual(['Roadmap', 'Deploy']))
})

it('Escape puts the value back and returns focus', async () => {
  await start()
  display('a')!.focus()
  await userEvent.keyboard('{Enter}Gone{Escape}')
  await vi.waitFor(() => expect(document.activeElement).toBe(display('a')))
  expect(titles()).toEqual(['Plan', 'Build'])
})

it('leaving the field saves it and leaves focus where it went', async () => {
  await start()
  display('a')!.focus()
  await userEvent.keyboard('{Enter}Later')
  await userEvent.click(document.getElementById('outside')!)
  await vi.waitFor(() => expect(titles()).toEqual(['Later', 'Build']))
  expect(document.activeElement?.id).toBe('outside')
})

it('a refused value stays in the field with its reason, and a refused leaving traps no focus', async () => {
  await start()
  display('a')!.focus()
  await userEvent.keyboard('{Enter}{Backspace}{Enter}')
  await vi.waitFor(() => expect(document.querySelector('p')?.textContent).toBe('A title is needed'))
  expect(document.activeElement).toBe(field())
  expect(field()!.getAttribute('aria-invalid')).toBe('true')
  expect(field()!.getAttribute('aria-describedby')).toBe(document.querySelector('p')!.id)
  await userEvent.keyboard('x')
  await vi.waitFor(() => expect(document.querySelector('p')).toBeNull())
  await userEvent.keyboard('{Backspace}')
  await userEvent.click(document.getElementById('outside')!)
  await vi.waitFor(() => expect(document.querySelector('p')?.textContent).toBe('A title is needed'))
  expect(field()!.value).toBe('')
  expect(document.activeElement?.id).toBe('outside')
  expect(titles()[1]).toBe('Build')
})

it('edits one item of two, by its own id', async () => {
  await start()
  display('b')!.focus()
  await userEvent.keyboard('{Enter}Test{Enter}')
  await vi.waitFor(() => expect(titles()).toEqual(['Plan', 'Test']))
  await vi.waitFor(() => expect(document.activeElement).toBe(display('b')))
})

it('Escape in a modal dialog cancels the edit and leaves the dialog open', async () => {
  const dialog = document.createElement('dialog')
  document.body.append(dialog)
  dialog.showModal()
  await start(dialog)
  display('a')!.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(field()))
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(document.activeElement).toBe(display('a')))
  expect(dialog.open).toBe(true)
  await userEvent.keyboard('{Escape}')
  await vi.waitFor(() => expect(dialog.open).toBe(false))
})

it('an Enter an input method is composing commits nothing', async () => {
  await start()
  display('a')!.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(field()))
  const input = field()!
  input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  input.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }),
  )
  input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  expect(field()).toBe(input)
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(field()).toBeNull())
})

it('focus moved elsewhere before the field is gone stays there', async () => {
  await start()
  display('a')!.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.activeElement).toBe(field()))
  // Escape ends the edit, and something takes focus before the next frame draws.
  field()!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  )
  const outside = document.getElementById('outside')!
  outside.focus()
  await vi.waitFor(() => expect(field()).toBeNull())
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  expect(document.activeElement).toBe(outside)
})
