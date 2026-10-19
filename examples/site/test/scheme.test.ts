/**
 * The page's own light or dark: chosen through `update`, applied and kept by
 * a Command, and read back at boot from what the head applied.
 */
import { describe, expect, it } from 'vitest'

import { Message, initial, plan, update } from '../src/main.js'

const commandNames = (result: ReturnType<typeof update>) =>
  (result.commands ?? []).map(command => command.name)

describe("the page's scheme", () => {
  it('is applied and kept when the reader chooses another, and left alone otherwise', () => {
    const chosen = update(initial, Message.ChosePageScheme({ scheme: 'dark' }))
    expect(chosen.model.pageScheme).toBe('dark')
    expect(commandNames(chosen)).toEqual(['ApplyPageScheme'])
    const again = update(chosen.model, Message.ChosePageScheme({ scheme: 'dark' }))
    expect(again.model).toBe(chosen.model)
    expect(commandNames(again)).toEqual([])
  })

  it('takes what the head applied, at boot, without applying it again', () => {
    const found = update(initial, Message.FoundPageScheme({ scheme: 'light' }))
    expect(found.model.pageScheme).toBe('light')
    expect(commandNames(found)).toEqual([])
    expect(update(initial, Message.FoundPageScheme({ scheme: 'system' })).model).toBe(initial)
  })

  it('is read back when the browser takes the page over, which the server cannot know', () => {
    expect((plan.boot?.(initial) ?? []).map(command => command.name)).toContain('ReadPageScheme')
  })
})
