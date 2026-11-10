/** The pages the Command, Listbox and VirtualList browser tests draw, shared by the fine and coarse pointer files. */
import * as UpstreamListbox from '@foldkit/ui/listbox'
import * as UiVirtualList from '@foldkit/ui/virtualList'
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { userEvent } from 'vitest/browser'
import {
  Command,
  CommandSlots,
  Listbox,
  ListboxSlots,
  ListboxView,
  Recipes,
  VirtualList,
  VirtualListSlots,
} from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const commandStyle = Style.forSlots(CommandSlots)(Recipes.Command({}))
const listStyle = Style.forSlots(VirtualListSlots)(Recipes.VirtualList({}))
const listboxStyle = Style.forSlots(ListboxSlots)(Recipes.Listbox({}))

/** Clears what a test drew, and puts the shared pointer back away from the lists. */
export const clearPage = async () => {
  await userEvent.hover(document.getElementById('away') ?? document.body)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
}

/** Installs the theme and both styles, and a container for the runtime. */
const page = (id: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    commandStyle.css +
    listStyle.css +
    listboxStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = id
  document.body.appendChild(container)
  return container
}

/** Where the pointer is put, away from the lists: every test file shares it. */
const away = <Message>(h: HtmlBuilder<Message>) =>
  h.div([h.Id('away'), h.Style({ height: '40px', marginBlockEnd: '40px' })], [])

type Noop = { readonly _tag: 'Noop' }
const noop: Noop = { _tag: 'Noop' }

const COMMANDS = Array.from({ length: 30 }, (_, index) => ({
  value: `run-${index}`,
  label: `Command ${index}`,
}))

export const mountCommand = (options: { readonly bars: boolean }) =>
  Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container: page('command'),
      init: () => ({ model: {} }),
      update: (model: {}) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<Noop>) =>
        h.div(
          [],
          [
            away(h),
            Command.view<string, Noop>(
              {
                id: 'palette',
                label: 'Search commands',
                groups: [
                  {
                    heading: 'File',
                    items: [{ value: 'new', label: 'New page', shortcut: ['⌘', 'N'] }],
                  },
                  { items: COMMANDS },
                ],
                query: '',
                onQuery: () => noop,
                active: Option.none(),
                onActive: () => noop,
                onRun: () => noop,
                style: commandStyle,
                ...(options.bars ? { mixins: Command.overlayBars } : {}),
              },
              h,
            ),
          ],
        ),
    }),
  )

const Cities = ListboxView.create<string>()
const CITIES = Array.from({ length: 40 }, (_, index) => `City ${index}`)

/** A listbox open from the start, its panel longer than the room the recipe gives it. */
export const mountListbox = (options: { readonly bars: boolean }) =>
  Runtime.embed(
    Runtime.makeElement({
      Model: UpstreamListbox.Model,
      container: page('listbox'),
      init: () => {
        const opened = Cities.open(UpstreamListbox.init({ id: 'cities' }))
        return { model: opened.model, commands: opened.commands ?? [] }
      },
      update: (model: UpstreamListbox.Model, message: UpstreamListbox.Message) => {
        const next = Cities.update(model, message)
        return { model: next.model, commands: next.commands ?? [] }
      },
      view: (model: UpstreamListbox.Model, h: HtmlBuilder<UpstreamListbox.Message>) =>
        h.div(
          [],
          [
            away(h),
            Cities.view(
              model,
              {
                anchor: { placement: 'bottom-start', gap: 4, padding: 8, portal: false },
                items: CITIES,
                maybeSelectedValue: Option.none(),
                itemToConfig: (city: string) => ({ content: h.span([], [city]) }),
                buttonContent: h.span([], ['City']),
                itemsScrollClassName: 'cities-scroll',
                toView: Listbox.toView(
                  [listboxStyle.mixin, ...(options.bars ? Listbox.overlayBars : [])],
                  { h },
                ),
              },
              h,
            ),
          ],
        ),
    }),
  )

/** Rows of many widths, so a box sized by the rows drawn would change width as they scroll. */
export const FILES = Array.from(
  { length: 1000 },
  (_, index) => `file-${index}${'-wide'.repeat(index % 9)}.pdf`,
)

export const mountList = (options: { readonly bars: boolean; readonly holder?: 'inline-block' }) =>
  Runtime.embed(
    Runtime.makeElement({
      Model: UiVirtualList.Model,
      container: page('list'),
      init: () => ({ model: UiVirtualList.init({ id: 'files', rowHeightPx: 36 }) }),
      update: (model: UiVirtualList.Model, message: UiVirtualList.Message) =>
        UiVirtualList.update(model, message),
      view: (model: UiVirtualList.Model, h: HtmlBuilder<UiVirtualList.Message>) =>
        h.div(
          [],
          [
            away(h),
            h.div(
              [
                h.Id('holder'),
                h.Style(options.holder === undefined ? {} : { display: options.holder }),
              ],
              [
                VirtualList.view<string, UiVirtualList.Message>(
                  {
                    model,
                    items: FILES,
                    itemToKey: file => file,
                    itemToView: file => h.span([], [file]),
                    onMessage: message => message,
                    style: listStyle,
                    ...(options.bars ? { mixins: VirtualList.overlayBars } : {}),
                  },
                  h,
                ),
              ],
            ),
          ],
        ),
    }),
  )

/** Each component with its overlay bars, and where its scroller is. */
export const scrollers = {
  Command: { mount: mountCommand, scroller: '[role="listbox"]', edge: 'scroller' },
  VirtualList: { mount: mountList, scroller: 'ul', edge: 'scroller' },
  // A popup's bar lies over its panel's edge, outside the padding around the rows.
  Listbox: { mount: mountListbox, scroller: '.cities-scroll', edge: 'panel' },
} as const

export const partsOf = (selector: string) => {
  const scroller = document.querySelector<HTMLElement>(selector)!
  const bar = document.querySelector<HTMLElement>('[data-scroll-bar="block"]')!
  return { scroller, bar, thumb: bar.firstElementChild! }
}
