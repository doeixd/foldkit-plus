/**
 * An open Sheet on a real page, styled by its recipe beside a page that
 * `sheetPage` steps back, for the Sheet's browser tests.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style, SlotView } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { expect, vi } from 'vitest'
import { DialogSlots } from '../src/dialog.js'
import { Sheet as SheetRecipe, sheetPage } from '../src/recipes/sheet.js'
import * as Sheet from '../src/sheet.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
/** The application's page, which `sheetPage` steps back. */
const page = Style.slots({ page: sheetPage })

export type Selection = Parameters<typeof SheetRecipe>[0]

/** An open Sheet of `config`, styled by the recipe's `selection`, with `lines` paragraphs in its panel. */
export const open = async (
  config: Omit<Sheet.InitConfig, 'id'>,
  selection: Selection = {},
  options: {
    readonly lines?: number
    readonly scalesPage?: boolean
    readonly covered?: boolean
    /** More of the panel's content, after its paragraphs. */
    readonly content?: (h: HtmlBuilder<Sheet.Message>) => ReadonlyArray<Html>
  } = {},
) => {
  const style = Style.forSlots(DialogSlots)(SheetRecipe(selection))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('reset', Defaults.reset), L.in('theme', Theme.root(theme))) +
    style.css +
    page.style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'sheet-browser'
  document.body.appendChild(container)
  const view = (model: Sheet.Model, h: HtmlBuilder<Sheet.Message>) =>
    h.div(
      [],
      [
        // Beside the sheet, not around it: a scaled page would hold the
        // fixed dialog in its own box.
        h.div(
          SlotView.buildersFor(page.slots, [page.style.mixin], { input: undefined, h }).page.attrs([
            h.Id('page'),
          ]),
          [h.p([], ['The page.'])],
        ),
        Sheet.view(
          {
            model,
            onMessage: message => message,
            mixins: [style.mixin],
            scalesPage: options.scalesPage ?? false,
            covered: options.covered ?? false,
            draw: dialog =>
              h.dialog(
                dialog.dialog,
                dialog.isVisible
                  ? [
                      h.div(dialog.backdrop),
                      h.div(dialog.panel, [
                        h.div(dialog.handle),
                        h.h2(dialog.title, ['Filters']),
                        ...Array.from({ length: options.lines ?? 1 }, () =>
                          h.p([], ['Only what is in stock, nearest first.']),
                        ),
                        ...(options.content?.(h) ?? []),
                      ]),
                    ]
                  : [],
              ),
          },
          h,
        ),
      ],
    )
  const opened = Sheet.open(Sheet.init({ id: 'edge', ...config }))
  // Releases the Sheet has handled, for a test to know its drag has landed.
  let releases = 0
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Sheet.Model,
      container,
      init: () => ({ model: opened.model, commands: opened.commands ?? [] }),
      update: (model: Sheet.Model, message: Sheet.Message) => {
        if (message._tag === 'Released') releases++
        const next = Sheet.update(model, message)
        return { model: next.model, commands: next.commands ?? [] }
      },
      view,
    }),
  )
  const panel = await vi.waitFor(
    () => {
      const found = document.getElementById('edge-panel')
      expect(found).not.toBeNull()
      // Entered: drawn closed first, then let slide in.
      expect(found!.hasAttribute('data-closed')).toBe(false)
      return found!
    },
    // A loaded full run can draw the first frame well after the default wait.
    { timeout: 15_000, interval: 50 },
  )
  await settled(panel)
  return {
    panel,
    grabber: panel.firstElementChild as HTMLElement,
    releases: () => releases,
    dispose: () => handle.dispose(),
  }
}

/** Once nothing on the panel is still moving. */
export const settled = (element: Element) =>
  vi.waitFor(() => expect(element.getAnimations({ subtree: false })).toEqual([]))

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
