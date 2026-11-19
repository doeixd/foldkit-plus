/**
 * The phone menu in a real browser, on the first application's own frame
 * (the shell's Model, update and Subscriptions, over a doc page): a Sheet that
 * opens from the Menu button, closes four ways (its button, Escape, the
 * backdrop, the browser's Back) and by choosing a link, moves the focus in
 * and returns it, locks the page's scroll while its own panel scrolls, keeps
 * every target at 44px, marks the current page, enters and leaves in one
 * duration, and is nothing at a desktop width. A link leads away only after
 * the history entry the menu holds is taken off.
 */
import { modifyFields } from 'foldkit/struct'
import * as Runtime from 'foldkit/runtime'
import { Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, page, userEvent } from 'vitest/browser'

import { MENU_ID, type Library } from '../src/library.js'
import { Page } from '../src/page.js'
import { Model, initial, subscriptions, update } from '../src/shell.js'
import { stylesheet } from '../src/style.js'
import { Body } from '../src/view/shellLayout.js'

let running: ReturnType<typeof Runtime.embed> | undefined

afterEach(async () => {
  // A runtime left running keeps its popstate listener, and answers the next test's Back.
  await running?.dispose()
  running = undefined
  document.body.replaceChildren()
  document.body.removeAttribute('style')
  document.documentElement.removeAttribute('style')
  history.replaceState(null, '', location.pathname + location.search)
})

/** A leave runs its animation and the Dialog's resources go after it. */
const SLOW = { timeout: 5000 }

const none = () => () => []
/** A sidebar of twelve packages of six pages each: taller than a phone's screen. */
const groups = Array.from({ length: 12 }, (_, group) => group)
const library: Library = {
  pageAt: () => Page.Missing(),
  sidebar: none,
  menuSidebar: () => ih => [
    ih.section(
      [],
      groups.map(group =>
        ih.details(
          [],
          [
            ih.summary([], [`package ${group}`]),
            ih.ul(
              [],
              Array.from({ length: 6 }, (_, at) =>
                ih.li([], [ih.a([ih.Href(`#page-${group}-${at}`)], [`page ${group} ${at}`])]),
              ),
            ),
          ],
        ),
      ),
    ),
  ],
  article: () => ih => [ih.div([ih.Style({ blockSize: '3000px' })], ['A long page'])],
  pager: none,
  outline: none,
  example: none,
  usage: none,
  module: none,
  primitive: none,
  primitiveModule: none,
  related: none,
  blog: none,
  blogPosts: none,
}

const mount = async (width = 390) => {
  await page.viewport(width, 844)
  Style.install(stylesheet)
  document.body.style.margin = '0'
  const container = document.createElement('div')
  container.id = 'menu-page'
  document.body.appendChild(container)
  running = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: modifyFields(initial, {
          path: () => '/remote',
          page: () => Page.Doc({ subsite: 'remote', title: 'Remote', description: '' }),
        }),
      }),
      update,
      subscriptions,
      view: (model, h) => Body({ model, library }, h),
    }),
  )
  await vi.waitFor(() =>
    expect(document.querySelector('#rail button[aria-expanded]')).not.toBeNull(),
  )
  const button = document.querySelector<HTMLButtonElement>('#rail button[aria-expanded]')!
  const dialog = document.getElementById(MENU_ID) as HTMLDialogElement
  const panel = document.getElementById(`${MENU_ID}-panel`)!
  return { button, dialog, panel }
}

type Menu = Awaited<ReturnType<typeof mount>>

const open = async ({ button, dialog }: Menu) => {
  await userEvent.click(button)
  await vi.waitFor(() => expect(dialog.hasAttribute('open')).toBe(true))
  await vi.waitFor(() => expect(button.getAttribute('aria-expanded')).toBe('true'))
}

/** Closed, drawn out, and the focus where it started. */
const closed = async ({ button, dialog }: Menu) => {
  await vi.waitFor(() => expect(dialog.hasAttribute('open')).toBe(false), SLOW)
  expect(button.getAttribute('aria-expanded')).toBe('false')
  await vi.waitFor(() => expect(document.activeElement).toBe(button), SLOW)
  // The history entry the menu held is gone, whichever way it closed.
  await vi.waitFor(() => expect(history.state).toBeNull(), SLOW)
}

const pressAt = async (x: number, y: number) => {
  const point = { x, y, button: 'left' as const }
  await cdp().send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
  await cdp().send('Input.dispatchMouseEvent', { type: 'mousePressed', clickCount: 1, ...point })
  await cdp().send('Input.dispatchMouseEvent', { type: 'mouseReleased', clickCount: 1, ...point })
}

test('the Menu button opens the sheet, says so, and takes the focus into it', async () => {
  const menu = await mount()
  expect(menu.button.getAttribute('aria-expanded')).toBe('false')
  expect(menu.button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  // The rail's own body is the menu's now: it takes no room under the bar.
  expect(getComputedStyle(document.querySelector('#rail > div:last-child')!).display).toBe('none')
  await open(menu)
  expect(menu.panel.contains(document.activeElement)).toBe(true)
  // From the inline-start edge, most of the screen's width and all of its height, once it has come in.
  await vi.waitFor(() => expect(menu.panel.getBoundingClientRect().left).toBe(0), SLOW)
  const box = menu.panel.getBoundingClientRect()
  expect(box.width).toBeGreaterThan(390 * 0.8)
  expect(box.height).toBeCloseTo(844, 0)
})

test.each([
  ['its Close button', async ({ panel }: Menu) => userEvent.click(panel.querySelector('button')!)],
  ['Escape', async () => userEvent.keyboard('{Escape}')],
  // The strip of the page the panel leaves, at the screen's inline-end.
  ['a press on the backdrop', async () => pressAt(386, 400)],
  [
    "the browser's Back",
    async () => {
      history.back()
    },
  ],
])(
  '%s closes it, returns the focus to the button and takes off its history entry',
  async (_, close) => {
    const menu = await mount()
    await open(menu)
    expect(history.state).toMatchObject({ foldkitPlusMenu: true })
    await close(menu)
    await closed(menu)
  },
)

test('choosing a link closes the menu, takes off its history entry, and goes where the link leads', async () => {
  const menu = await mount()
  await open(menu)
  // The menu's own entry is on the stack now; going to the link must not add a second.
  const held = history.length
  const link = menu.panel.querySelector<HTMLAnchorElement>('a[href="#page-0-0"]')!
  // Inside a folded package, so open it first, as a reader does.
  menu.panel.querySelector('summary')!.click()
  await userEvent.click(link)
  await vi.waitFor(() => expect(location.hash).toBe('#page-0-0'))
  await closed(menu)
  // Its entry was taken off, and the place the link leads to took its place.
  expect(history.length).toBe(held)
})

test('the page behind does not scroll while the menu is open, and the menu itself does', async () => {
  const menu = await mount()
  await open(menu)
  expect(document.documentElement.style.overflow).toBe('hidden')
  expect(menu.panel.scrollHeight).toBeGreaterThan(menu.panel.clientHeight)
  expect(getComputedStyle(menu.panel).overflowY).toBe('auto')
  menu.panel.scrollTo(0, 300)
  await vi.waitFor(() => expect(menu.panel.scrollTop).toBeGreaterThan(100))
  expect(window.scrollY).toBe(0)
})

test('every target in the menu is 44px tall and the current place is marked', async () => {
  const menu = await mount()
  await open(menu)
  menu.panel.querySelectorAll('details').forEach(each => each.setAttribute('open', ''))
  const targets = Array.from(menu.panel.querySelectorAll<HTMLElement>('a[href], button, summary'))
  expect(targets.length).toBeGreaterThan(80)
  const short = targets
    .filter(target => target.getBoundingClientRect().height < 44)
    .map(target => `${target.tagName} ${target.textContent}`)
  expect(short).toEqual([])
  const current = menu.panel.querySelector('nav[aria-label="Site menu"] a[aria-current="page"]')
  expect(current?.textContent).toBe('Packages')
})

test('it enters and leaves over one duration', async () => {
  const menu = await mount()
  const panel = () => getComputedStyle(menu.panel)
  await open(menu)
  const entering = panel().transitionDuration
  await userEvent.keyboard('{Escape}')
  // The leave's duration is read while it runs: `data-leave` is on the panel.
  await vi.waitFor(() => expect(menu.panel.hasAttribute('data-leave')).toBe(true))
  const leaving = panel().transitionDuration
  expect(leaving).toBe(entering)
  expect(entering).not.toBe('0s')
})

test('at a desktop width nothing of it is shown or reachable', async () => {
  const menu = await mount(1440)
  expect(getComputedStyle(menu.button).display).toBe('none')
  expect(getComputedStyle(menu.dialog).display).toBe('none')
  expect(menu.panel.getBoundingClientRect().width).toBe(0)
})

test('widening the window past the phone closes an open menu', async () => {
  const menu = await mount()
  await open(menu)
  await page.viewport(1440, 900)
  await vi.waitFor(() => expect(menu.dialog.hasAttribute('open')).toBe(false))
  expect(menu.button.getAttribute('aria-expanded')).toBe('false')
  await vi.waitFor(() => expect(history.state).toBeNull(), SLOW)
})
