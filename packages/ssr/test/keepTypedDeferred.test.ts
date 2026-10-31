// @vitest-environment jsdom
/**
 * #356 on a page that waits to boot: what was typed before the script ran
 * goes first, then what the page answered after it, each once, in the order
 * typed, and the field keeps its caret through the boot. Typing is the
 * interaction the page waits for, so it starts as the script runs (#372).
 */
import { Effect } from 'effect'
import { FOLDKIT_APP_ATTRIBUTE } from 'foldkit/experimental/server'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config, field, load, plan, seen, settle, template, typeInto } from './keepTypedFixture.js'

const booted = () => document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`) === null

it('replays the early typing ahead of what the page answered', async () => {
  const deferred = plan('on-interaction')
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, deferred, { buildId: 'b' }))))
  const note = field('note', HTMLTextAreaElement)
  typeInto(note, 'first draft', 5)

  SSR.hydrate(config, deferred, { buildId: 'b' })
  // Typing before the script is an interaction too: the page starts and draws it.
  await vi.waitFor(() => expect(field('summary', HTMLElement).textContent).toBe('first draft/m'))
  expect(booted()).toBe(true)
  await settle()

  note.setRangeText('!', 5, 5, 'end')
  note.dispatchEvent(new Event('input', { bubbles: true }))

  await vi.waitFor(() => expect(field('summary', HTMLElement).textContent).toBe('first! draft/m'))
  expect(seen.map(message => ('value' in message ? message.value : message._tag))).toEqual([
    'first draft',
    'first! draft',
  ])
  expect(field('note', HTMLTextAreaElement)).toBe(note)
  expect(note.value).toBe('first! draft')
  expect([note.selectionStart, note.selectionEnd]).toEqual([6, 6])
})
