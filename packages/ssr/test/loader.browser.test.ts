/**
 * #472: `foldkit-ssr/loader` in a browser. It runs the runtime's chunk on
 * intent on a marked element only, holds a press until the chunk runs and
 * hands it over to be answered once, releases a held submission to the
 * browser 3 s after the press, and at once when the chunk fails to load.
 * The chunk here is a function the test lets run, so each step is the test's.
 */
import { Effect } from 'effect'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { KEEP_ATTRIBUTE, SSR } from 'foldkit-ssr'
import { SSR as Client } from 'foldkit-ssr/client'
import { load } from 'foldkit-ssr/loader'
import type { Start } from 'foldkit-ssr'
import { config, plan, seen, template } from './checkedFixture.js'

let page: HTMLElement | undefined

/** The served page for `start`, in the document as a server would send it. */
const serve = async (start: Start): Promise<void> => {
  const html = SSR.page(
    template,
    await Effect.runPromise(SSR.render(config, plan(start), { buildId: 'b' })),
  )
  page = document.createElement('div')
  page.id = 'served'
  page.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML
  document.body.append(page)
  seen.length = 0
}

const byId = (id: string): HTMLElement => {
  const element = page?.querySelector<HTMLElement>(`#${id}`)
  if (element === null || element === undefined) throw new Error(`the page has no #${id}`)
  return element
}

/** A chunk that runs `SSR.hydrate` once the test lets it, or fails when told. */
const gated = (start: Start, buildId = 'b') => {
  let open!: () => void
  let fail!: (error: Error) => void
  const gate = new Promise<void>((resolve, reject) => {
    open = resolve
    fail = reject
  })
  const runtime = vi.fn(() => gate.then(() => Client.hydrate(config, plan(start), { buildId })))
  return { runtime, open, fail }
}

/** Each submission that reached the document, and whether the loader had stopped it. */
let submits: Array<boolean> = []
const record = (event: Event): void => {
  submits.push(event.defaultPrevented)
  // The test page must not navigate.
  event.preventDefault()
}

/** An empty spot away from the controls, where the pointer rests between tests. */
let rest: HTMLElement

beforeEach(async () => {
  submits = []
  document.addEventListener('submit', record)
  rest = document.createElement('div')
  rest.style.cssText = 'position:fixed;right:0;bottom:0;width:40px;height:40px'
  document.body.append(rest)
  await userEvent.hover(rest)
})

afterEach(() => {
  document.removeEventListener('submit', record)
  page?.remove()
  rest.remove()
  page = undefined
})

const booted = (): boolean => page?.querySelector('[data-foldkit-app]') === null

it('holds a press and a submission until the chunk runs, and answers each once', async () => {
  await serve('on-interaction')
  const chunk = gated('on-interaction')
  load({ runtime: chunk.runtime })

  await userEvent.click(byId('press'))
  await userEvent.click(byId('submit'))
  // Ticked: the box keeps it itself, so the loader must not hold it as well.
  await userEvent.click(byId('agree'))
  expect(chunk.runtime).toHaveBeenCalledTimes(1)
  expect(submits).toEqual([true])
  expect(booted()).toBe(false)

  chunk.open()
  await vi.waitFor(() => expect(byId('press').textContent).toBe('1'))
  expect(byId('submit').textContent).toBe('1')
  // Long enough for a second answer, had anything answered twice.
  await new Promise(resolve => setTimeout(resolve, 200))
  expect(seen.map(message => message._tag).sort()).toEqual(['Pressed', 'Sent', 'Toggled'])
  expect(byId('plain').textContent).toBe('true/s')
  expect(document.activeElement).toBe(byId('agree'))
  expect(submits).toEqual([true])

  // The live page answers from here.
  await userEvent.click(byId('press'))
  await vi.waitFor(() => expect(byId('press').textContent).toBe('2'))
})

it('runs the chunk on intent over a marked element only, and boots without another', async () => {
  await serve('on-interaction')
  const chunk = gated('on-interaction')
  load({ runtime: chunk.runtime })

  await userEvent.hover(byId('plain'))
  await new Promise(resolve => setTimeout(resolve, 200))
  expect(chunk.runtime).not.toHaveBeenCalled()

  await userEvent.hover(byId('press'))
  expect(chunk.runtime).toHaveBeenCalledTimes(1)
  chunk.open()
  // The loader followed the plan's start; the runtime starts as it runs.
  await vi.waitFor(() => expect(booted()).toBe(true))
  expect(seen).toEqual([])
})

it('releases a held submission to the browser 3 s after the press', async () => {
  await serve('on-interaction')
  // A chunk that never runs.
  const chunk = gated('on-interaction')
  load({ runtime: chunk.runtime })

  const pressed = performance.now()
  await userEvent.click(byId('submit'))
  expect(submits).toEqual([true])
  await new Promise(resolve => setTimeout(resolve, 2500))
  expect(submits).toEqual([true])
  await vi.waitFor(() => expect(submits).toEqual([true, false]), { timeout: 2000 })
  expect(performance.now() - pressed).toBeGreaterThanOrEqual(3000)
})

it('releases at once when the chunk fails to load, and holds nothing after', async () => {
  await serve('on-interaction')
  const chunk = gated('on-interaction')
  load({ runtime: chunk.runtime })

  await userEvent.click(byId('submit'))
  expect(submits).toEqual([true])
  const failed = performance.now()
  chunk.fail(new Error('the chunk did not load'))
  await vi.waitFor(() => expect(submits).toEqual([true, false]))
  expect(performance.now() - failed).toBeLessThan(1000)

  await userEvent.click(byId('submit'))
  expect(submits).toEqual([true, false, false])
})

it('holds a press on a page that starts now until its chunk runs', async () => {
  await serve('now')
  // A page that keeps no field, which an eager page would boot without reading.
  for (const kept of page!.querySelectorAll(`[${KEEP_ATTRIBUTE}]`))
    kept.removeAttribute(KEEP_ATTRIBUTE)
  const chunk = gated('now')
  load({ runtime: chunk.runtime })
  // Run at once, as the plan says, and not yet arrived.
  expect(chunk.runtime).toHaveBeenCalledTimes(1)

  await userEvent.click(byId('press'))
  chunk.open()
  await vi.waitFor(() => expect(byId('press').textContent).toBe('1'))
  expect(seen.map(message => message._tag)).toEqual(['Pressed'])
})

it('releases what it held when the page does not resume', async () => {
  await serve('on-interaction')
  // Another build's chunk: the page is not adopted.
  const chunk = gated('on-interaction', 'other')
  load({ runtime: chunk.runtime })

  await userEvent.click(byId('submit'))
  expect(submits).toEqual([true])
  const opened = performance.now()
  chunk.open()
  await vi.waitFor(() => expect(submits).toEqual([true, false]))
  expect(performance.now() - opened).toBeLessThan(1000)
})
