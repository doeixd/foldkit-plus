/**
 * The command menu on a real runtime, in a Dialog: ⌘K or Ctrl+K anywhere
 * opens it with its field focused, and Escape closes it; running a row that
 * opens a page steps into it, its name a crumb before the field, and
 * Backspace in the empty field steps back out, while Backspace in a field
 * with words only deletes; a loading list says so in a live region beside
 * the listbox, and so does one with nothing to show; the footer names its
 * keys.
 */
import { Dialog as UiDialog } from '@foldkit/ui'
import { Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import * as Subscription from 'foldkit/subscription'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import {
  Command,
  CommandSlots,
  Dialog,
  DialogSlots,
  Recipes,
  type CommandGroup,
} from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const commandStyle = Style.forSlots(CommandSlots)(Recipes.Command({ frame: 'bare' }))
const dialogStyle = Style.forSlots(DialogSlots)(Recipes.Dialog({}))

const ROOT: ReadonlyArray<CommandGroup<string>> = [
  {
    heading: 'Settings',
    items: [
      { value: 'theme', label: 'Change theme…', opensPage: true },
      { value: 'members', label: 'Invite members', shortcut: ['⌘', 'I'] },
    ],
  },
]
const THEME: ReadonlyArray<CommandGroup<string>> = [
  {
    items: [
      { value: 'light', label: 'Light' },
      { value: 'dark', label: 'Dark' },
    ],
  },
]

const Model = Schema.Struct({
  dialog: UiDialog.Model,
  query: Schema.String,
  active: Schema.Option(Schema.String),
  pages: Schema.Array(Schema.String),
  loading: Schema.Boolean,
})
type Model = typeof Model.Type
type Message =
  | { readonly _tag: 'Got'; readonly message: UiDialog.Message }
  | { readonly _tag: 'Opened' }
  | { readonly _tag: 'Typed'; readonly query: string }
  | { readonly _tag: 'Moved'; readonly value: string }
  | { readonly _tag: 'Ran'; readonly value: string }
  | { readonly _tag: 'Back' }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const update = (model: Model, message: Message) => {
  switch (message._tag) {
    case 'Got': {
      const next = UiDialog.update(model.dialog, message.message)
      return {
        model: { ...model, dialog: next.model },
        commands: mapMessages(next.commands, (inner): Message => ({ _tag: 'Got', message: inner })),
      }
    }
    case 'Opened': {
      const next = UiDialog.open(model.dialog)
      return {
        model: { ...model, dialog: next.model },
        commands: mapMessages(next.commands, (inner): Message => ({ _tag: 'Got', message: inner })),
      }
    }
    case 'Typed':
      return { model: { ...model, query: message.query } }
    case 'Moved':
      return { model: { ...model, active: Option.some(message.value) } }
    case 'Ran':
      return message.value === 'theme'
        ? {
            model: { ...model, pages: [...model.pages, 'Theme'], query: '', active: Option.none() },
          }
        : { model }
    case 'Back':
      return { model: { ...model, pages: model.pages.slice(0, -1) } }
  }
}

const mount = (loading = false) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    dialogStyle.css +
    commandStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'command-browser'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        h.p([], ['Press ⌘K']),
        h.submodel({
          slotId: model.dialog.id,
          model: model.dialog,
          view: UiDialog.view,
          viewInputs: {
            toView: Dialog.toView([dialogStyle.mixin], { h }, dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [
                      h.div(dialog.backdrop),
                      h.div(dialog.panel, [
                        h.h2(dialog.title, ['Command menu']),
                        Command.view<string, Message>(
                          {
                            id: 'palette',
                            label: 'Search commands',
                            groups: model.pages.length === 0 ? ROOT : THEME,
                            query: model.query,
                            onQuery: query => ({ _tag: 'Typed', query }),
                            active: model.active,
                            onActive: value => ({ _tag: 'Moved', value }),
                            onRun: value => ({ _tag: 'Ran', value }),
                            page: { trail: model.pages, onBack: { _tag: 'Back' } },
                            ...(loading ? { loading: 'Loading…' } : {}),
                            hints: [
                              { keys: ['↑', '↓'], label: 'to move' },
                              { keys: ['↵'], label: 'to run' },
                            ],
                            style: commandStyle,
                          },
                          h,
                        ),
                      ]),
                    ]
                  : [],
              ),
            ),
          },
          toParentMessage: (message): Message => ({ _tag: 'Got', message }),
        }),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          dialog: UiDialog.init({ id: 'palette-dialog' }),
          query: '',
          active: Option.none(),
          pages: [],
          loading,
        },
      }),
      update,
      view,
      subscriptions: Subscription.make<Model, Message>()(() => ({
        open: Subscription.persistentEntry(Command.hotkey<Message>({ _tag: 'Opened' })),
      })),
    }),
  )
}

const field = () => document.querySelector<HTMLInputElement>('input[role="combobox"]')
// The words of each row: its first span, before the shortcut.
const rows = () =>
  [...document.querySelectorAll('[role="option"]')].map(
    row => row.querySelector('span')?.textContent,
  )

/**
 * Opens the menu with ⌘K, its field focused. The chord is pressed again
 * while the menu stays shut: under load the drawn page can come before its
 * Subscription listens, and nothing on the page tells the two apart.
 */
const opened = async (chord = '{Meta>}k{/Meta}') => {
  await vi.waitFor(() => expect(document.querySelector('p')).not.toBeNull())
  await vi.waitFor(
    async () => {
      if (field() === null) await userEvent.keyboard(chord)
      expect(document.activeElement).toBe(field())
      expect(field()).not.toBeNull()
    },
    { timeout: 5000, interval: 200 },
  )
}

test.each(['{Meta>}k{/Meta}', '{Control>}k{/Control}'])(
  '%s opens the menu in its dialog, the field focused, and Escape closes it',
  async chord => {
    const handle = mount()
    try {
      await opened(chord)
      expect(field()!.closest('dialog')?.open).toBe(true)
      await userEvent.keyboard('{Escape}')
      await vi.waitFor(() => expect(field()).toBeNull())
    } finally {
      handle.dispose()
    }
  },
)

test('a row that opens a page steps in, and Backspace in the empty field steps out', async () => {
  const handle = mount()
  try {
    await opened()
    expect(rows()).toEqual(['Change theme…', 'Invite members'])
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(rows()).toEqual(['Light', 'Dark']))
    const crumbs = document.getElementById('palette-page')!
    expect(crumbs.textContent).toBe('Theme')
    expect(field()!.getAttribute('aria-describedby')).toBe('palette-page')
    // With words in the field, Backspace deletes and the page stays.
    await userEvent.keyboard('d')
    await vi.waitFor(() => expect(field()!.value).toBe('d'))
    await userEvent.keyboard('{Backspace}')
    await vi.waitFor(() => expect(field()!.value).toBe(''))
    expect(rows()).toEqual(['Light', 'Dark'])
    await userEvent.keyboard('{Backspace}')
    await vi.waitFor(() => expect(rows()).toEqual(['Change theme…', 'Invite members']))
    expect(document.getElementById('palette-page')).toBeNull()
    expect(document.activeElement).toBe(field())
  } finally {
    handle.dispose()
  }
})

test('the list speaks in a live region beside it while loading and when nothing matches', async () => {
  const handle = mount(true)
  try {
    await opened()
    const status = document.querySelector('[role="status"]')!
    expect(status.closest('[role="listbox"]')).toBeNull()
    expect(status.textContent).toBe('Loading…')
    expect(document.querySelector('[role="listbox"]')!.getAttribute('aria-busy')).toBe('true')
    // The rows it has still show.
    expect(rows()).toHaveLength(2)
  } finally {
    handle.dispose()
  }
  const plain = mount()
  try {
    await opened()
    const status = document.querySelector('[role="status"]')!
    expect(status.getBoundingClientRect().height).toBe(0)
    await userEvent.keyboard('zzz')
    await vi.waitFor(() => expect(status.textContent).toBe('No results.'))
    expect(status.getBoundingClientRect().height).toBeGreaterThan(0)
    expect(document.querySelector('[role="listbox"]')!.hasAttribute('aria-busy')).toBe(false)
  } finally {
    plain.dispose()
  }
})

test('the footer names its keys, each pair in a row', async () => {
  const handle = mount()
  try {
    await opened()
    const hints = [...document.querySelectorAll('dialog [aria-hidden="true"] > span')]
    expect(hints.map(hint => hint.textContent)).toEqual(['↑↓to move', '↵to run'])
    const [move, run] = hints.map(hint => hint.getBoundingClientRect())
    expect(Math.abs(move!.top - run!.top)).toBeLessThan(1)
    expect(move!.right).toBeLessThan(run!.left)
  } finally {
    handle.dispose()
  }
})
