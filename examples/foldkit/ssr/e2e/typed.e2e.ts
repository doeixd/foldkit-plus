/**
 * #356 end to end: the dev server renders the page, the page's script is held
 * back, and Chromium types into the note field and moves the caret before it
 * arrives. Once the script runs, the field still holds every character, the
 * Model holds them too, and the caret is where it was left.
 */
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { onFreePort } from '../../../../scripts/free-port.mjs'

let vite: ViteDevServer
let browser: Browser

beforeAll(async () => {
  delete process.env.FOLDKIT_BUILD_ID
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
    logLevel: 'error',
    server: { port: 0 },
  })
  await onFreePort(() => vite.listen())
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  await vite?.close()
})

test('keeps what is typed before the script runs, caret included', async () => {
  const page = await browser.newPage()
  const problems: Array<string> = []
  page.on('pageerror', error => problems.push(String(error)))
  page.on('console', message => {
    if (message.type() === 'error') problems.push(message.text())
  })
  let release = () => {}
  const held = new Promise<void>(resolve => {
    release = resolve
  })
  await page.route('**/src/entry.ts', async route => {
    await held
    await route.continue()
  })

  try {
    // The module script never runs while held, so the page never reaches `load`.
    await page.goto(vite.resolvedUrls!.local[0]!, { waitUntil: 'commit' })
    const note = page.locator('#note')
    await note.waitFor({ timeout: 120_000 })
    await note.click()
    await page.keyboard.type('helo')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('l')
    // Nothing has taken the page over yet: Foldkit's stamp is still on its root.
    await expect.poll(() => page.locator('[data-foldkit-app]').count()).toBe(1)
    expect(await page.locator('#note-echo').textContent()).toBe('0 characters')

    release()
    await expect.poll(() => page.locator('[data-foldkit-app]').count(), { timeout: 60_000 }).toBe(0)
    await expect
      .poll(() => page.locator('#note-echo').textContent(), { timeout: 30_000 })
      .toBe('5 characters')
    expect(await note.inputValue()).toBe('hello')
    expect(
      await note.evaluate((input: HTMLInputElement) => [
        input.selectionStart,
        input.selectionEnd,
        document.activeElement === input,
      ]),
    ).toEqual([4, 4, true])

    // Typing goes on at the caret, and the live page answers it.
    await page.keyboard.type('!')
    await expect.poll(() => page.locator('#note-echo').textContent()).toBe('6 characters')
    expect(await note.inputValue()).toBe('hell!o')
    expect(problems).toEqual([])
  } finally {
    release()
    await page.close()
  }
})
