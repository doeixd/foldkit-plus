/**
 * A Picker on a real page, styled by its recipe, the Listbox's and the
 * Sheet's, its choice kept by the application, for the Picker's browser
 * tests at a desktop's and a phone's width.
 */
import { Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { expect, vi } from 'vitest'
import { DialogSlots, ListboxSlots, Picker, PickerSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))

export const SORTS = ['relevance', 'price', 'name'] as const
type Sort = (typeof SORTS)[number]
const options = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'price', label: 'Lowest price', description: 'Cheapest first' },
  { value: 'name', label: 'Name' },
] as const satisfies ReadonlyArray<Picker.PickerOption<Sort>>

const Model = Schema.Struct({ picker: Picker.Model, sort: Schema.Option(Schema.Literals(SORTS)) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ GotPicker: { message: Picker.Message } })
type Message = typeof Message.Type

/** The sorts the application heard chosen, in order. */
export const chosen: Array<string> = []

export const mount = async (
  recipe: Parameters<typeof Recipes.Picker>[0] = {},
  sort: Option.Option<Sort> = Option.none(),
) => {
  const style = Style.forSlots(PickerSlots)(Recipes.Picker(recipe))
  const listbox = Style.forSlots(ListboxSlots)(Recipes.Listbox({ width: 'trigger' }))
  const sheet = Style.forSlots(DialogSlots)(Recipes.Sheet({}))
  const css = document.createElement('style')
  css.dataset['test'] = ''
  css.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    listbox.css +
    sheet.css
  document.head.append(css)
  const container = document.createElement('div')
  container.id = 'picker-browser'
  // Clear of the viewport's edge, which the panel keeps 8px from. Around the
  // container, which the runtime draws in place of.
  const box = document.createElement('div')
  box.style.margin = '2rem'
  box.append(container)
  document.body.append(box)
  chosen.length = 0
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    Picker.view(
      {
        model: model.picker,
        onMessage: message => Message.GotPicker({ message }),
        label: 'Sort',
        options,
        value: model.sort,
        placeholder: 'Sort by',
        style,
        listbox: [listbox.mixin],
        sheet: [sheet.mixin],
      },
      h,
    )
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { picker: Picker.init({ id: 'sort' }), sort } }),
      update: (model: Model, message: Message) =>
        Message.match(message, {
          GotPicker: ({ message }) => {
            const next = Picker.update(model.picker, message)
            const value = Option.flatMap(Option.fromNullishOr(next.outMessage), ({ value }) =>
              Option.fromNullishOr(SORTS.find(each => each === value)),
            )
            if (Option.isSome(value)) chosen.push(value.value)
            return {
              model: modifyFields(model, {
                picker: () => next.model,
                sort: current => Option.orElse(value, () => current),
              }),
              commands: Command.mapMessages(next.commands ?? [], inner =>
                Message.GotPicker({ message: inner }),
              ),
            }
          },
        }),
      view,
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('sort-listbox-button')).not.toBeNull())
  return handle
}

export const trigger = () => document.getElementById('sort-listbox-button')!
export const opener = () => document.querySelector<HTMLElement>('button[aria-haspopup="dialog"]')!
export const panel = () => document.getElementById('sort-sheet-panel')
export const sheetOptions = () => [
  ...document.querySelectorAll<HTMLElement>('#sort-sheet-panel [role="option"]'),
]

/** Whether the element draws a box: `display: none` draws none. */
export const drawn = (element: Element) => {
  const box = element.getBoundingClientRect()
  return box.width > 0 && box.height > 0
}

/** Once the element has come in and nothing on it still moves. */
export const settled = (element: Element) =>
  vi.waitFor(() => {
    expect(element.hasAttribute('data-closed')).toBe(false)
    expect(element.getAnimations({ subtree: true })).toEqual([])
  })
