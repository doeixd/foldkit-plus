// @vitest-environment jsdom
/**
 * A window list opened at a row, rendered on a server and parsed back: the
 * row is drawn first, the start spacer takes no room until `Track` places
 * the list, and under the recipe a page without scripts hides both spacers.
 */
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { HtmlBuilder } from 'foldkit/html'
import { Style } from 'foldkit-mixins'
import { expect, test } from 'vitest'
import { Recipes, WindowList, WindowListSlots } from '../src/index.js'

const keys = Array.from({ length: 100 }, (_, index) => `row-${index}`)
const style = Style.forSlots(WindowListSlots)(Recipes.WindowList())

const served = async (from: number) => {
  const html = await Effect.runPromise(
    renderToString(
      {
        init: () => ({
          model: WindowList.init({
            id: 'list',
            estimatedHeight: 20,
            overscan: 2,
            viewportHeight: 100,
            from,
          }),
        }),
        view: (model: WindowList.Model, h: HtmlBuilder<WindowList.Message>) => ({
          title: 'List',
          body: WindowList.view(
            {
              model,
              items: keys,
              itemToKey: key => key,
              itemToView: key => h.span([], [key]),
              onMessage: message => message,
              style,
            },
            h,
          ),
        }),
      },
      { buildId: 'b' },
    ),
  )
  const template =
    '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'
  return new DOMParser().parseFromString(injectIntoTemplate(template, html), 'text/html')
}

const spacer = (page: Document, edge: string) =>
  page.querySelector<HTMLElement>(`#list > [data-edge="${edge}"]`)!

test('opened at a row, the server draws from it, the rows above in no room until placed', async () => {
  const page = await served(10)
  const rows = [...page.querySelectorAll('#list > [role="listitem"]')]
  expect(rows.map(row => row.getAttribute('aria-posinset'))).toEqual([
    '11',
    '12',
    '13',
    '14',
    '15',
    '16',
    '17',
  ])
  expect(spacer(page, 'start').style.blockSize).toBe(
    'calc(var(--fk-window-list-placed, 0) * 200px)',
  )
  expect(spacer(page, 'end').style.blockSize).toBe(`${(100 - 17) * 20}px`)
})

test('at the first row, the start spacer is plain', async () => {
  expect(spacer(await served(0), 'start').style.blockSize).toBe('0px')
})

test('the recipe hides the spacers where no script runs', async () => {
  const page = await served(10)
  const classes = [...spacer(page, 'end').classList, ...spacer(page, 'start').classList]
  expect(classes.length).toBeGreaterThan(0)
  const rule = style.css.match(/@media \(scripting: none\)\{([^}]*)\{[^}]*display:none/)
  expect(rule).not.toBeNull()
  // The rule's selector is a class each spacer carries.
  const selector = rule![1]!
  for (const edge of ['start', 'end']) {
    expect([...spacer(page, edge).classList].some(name => selector.includes(`.${name}`))).toBe(true)
  }
})
