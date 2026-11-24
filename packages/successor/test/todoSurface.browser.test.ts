import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { keySegment } from 'foldkit-successor/block'
import { freshCount, initial, target } from './fixtures/todos.js'
import { prepareToggle, verifyToggle } from './fixtures/todoProof.js'
import { envelope, html, install } from './fixtures/todoSurface.js'

const clean: Array<() => void> = []
afterEach(() => {
  for (const done of clean.splice(0)) done()
})

const fixture = (
  mode: 'fresh' | 'resume',
  adjust?: Parameters<typeof install>[1]['adjust'],
  state = { ...initial('work'), draft: '' },
) => {
  const root = document.createElement('div')
  root.innerHTML = html(state)
  document.body.append(root)
  const first = root.querySelector<HTMLInputElement>('input[type=checkbox]')!
  const draft = root.querySelector<HTMLInputElement>('input[type=text]')!
  draft.value = 'typed before takeover'
  const mounted = install(root, {
    start: mode === 'resume' ? envelope(state) : state,
    machine: prepareToggle(),
    ...(adjust === undefined ? {} : { adjust }),
  })
  clean.push(() => {
    mounted.close()
    root.remove()
  })
  return { root, mounted, first, draft, state }
}

const assertFreshFold = (root: HTMLElement, state: Parameters<typeof freshCount>[0]) => {
  expect(root.querySelector('output')?.textContent).toBe(String(freshCount(state)))
}

describe.each(['fresh', 'resume'] as const)('%s successor Todo Surface', mode => {
  it('routes the first toggle through its original keyed checkbox and only evaluates its dependent slots', async () => {
    const { root, mounted, first, draft, state } = fixture(mode)
    const targetOfClick = target(state, '7')
    // Fresh mount initializes properties, while resume adopts the live draft.
    const expectedDraft = mode === 'resume' ? 'typed before takeover' : ''
    await page.getByRole('checkbox', { name: 'Buy tea' }).click()
    await mounted.settled()

    expect(mounted.routed).toEqual([targetOfClick])
    expect(root.querySelector('input[type=checkbox]')).toBe(first)
    expect(first.checked).toBe(true)
    await expect.element(page.getByRole('checkbox', { name: 'Wash cup' })).not.toBeChecked()
    await expect.element(page.getByRole('button', { name: 'Clear completed' })).toBeEnabled()
    expect(draft.value).toBe(expectedDraft)
    assertFreshFold(root, mounted.read())
    expect(root.querySelector('output')?.textContent).toBe('1')
    expect(mounted.paints).toEqual([
      {
        evaluated: ['todo:7:done', 'remaining', 'clear'],
        patched: ['todo:7:done', 'remaining', 'clear'],
      },
    ])

    await page.getByRole('checkbox', { name: 'Wash cup' }).click()
    await mounted.settled()
    expect(mounted.paints[1]?.evaluated).toEqual(['todo:8:done', 'remaining', 'clear'])
    expect(mounted.paints[1]?.patched).toEqual(['todo:8:done', 'remaining'])
    assertFreshFold(root, mounted.read())
    expect(root.querySelector('output')?.textContent).toBe('0')
  })

  it('detects a corrupted backend result while the composed domain proof still passes', async () => {
    const { root, mounted } = fixture(mode, next => ({ ...next, remaining: next.remaining + 1 }))
    await page.getByRole('checkbox', { name: 'Buy tea' }).click()
    await mounted.settled()
    expect(verifyToggle().verdict._tag).toBe('True')
    expect(() => assertFreshFold(root, mounted.read())).toThrow()
    expect(root.querySelector('output')?.textContent).toBe('2')
    expect(freshCount(mounted.read())).toBe(1)
  })

  it('routes a punctuation key through the same checked count on the first click', async () => {
    const start = initial('work')
    const state = {
      ...start,
      rows: {
        ...start.rows,
        [keySegment('*')]: { incarnation: '3', model: { label: 'Wildcard', done: false } },
      },
      remaining: 3,
      generation: 3,
      draft: '',
    }
    const { root, mounted } = fixture(mode, undefined, state)
    await page.getByRole('checkbox', { name: 'Wildcard' }).click()
    await mounted.settled()
    expect(mounted.routed).toEqual([target(state, '*')])
    expect(mounted.paints[0]?.evaluated).toEqual(['todo:*:done', 'remaining', 'clear'])
    expect(root.querySelector('output')?.textContent).toBe('2')
    assertFreshFold(root, mounted.read())
  })

  it('clears completed rows and keeps the surviving checkbox bound to its key', async () => {
    const { root, mounted } = fixture(mode)
    const row8 = root.querySelector<HTMLInputElement>('[data-key="8"] input')!
    await page.getByRole('checkbox', { name: 'Buy tea' }).click()
    await mounted.settled()
    await page.getByRole('button', { name: 'Clear completed' }).click()
    await mounted.settled()
    expect(root.querySelector('[data-key="7"]')).toBeNull()
    expect(root.querySelector('[data-key="8"] input')).toBe(row8)
    await expect.element(page.getByRole('button', { name: 'Clear completed' })).toBeDisabled()
    expect(root.querySelector('output')?.textContent).toBe('1')
    await page.getByRole('checkbox', { name: 'Wash cup' }).click()
    await mounted.settled()
    expect(row8.checked).toBe(true)
    expect(mounted.routed.map(target => target.key)).toEqual(['7', '8'])
    expect(root.querySelector('output')?.textContent).toBe('0')
  })
})
