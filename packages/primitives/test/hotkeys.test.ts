/**
 * Hotkey matching over press payloads: chords, Mac aliases, exactness,
 * repeat rejection, and malformed patterns. No effects, no DOM.
 */
import { describe, expect, it } from 'vitest'
import { matchHotkey, type KeyPress } from '../src/events/index.js'

const press = (overrides: Partial<KeyPress> = {}): KeyPress => ({
  key: 'k',
  repeat: false,
  ctrl: false,
  shift: false,
  alt: false,
  meta: false,
  ...overrides,
})

describe('matchHotkey', () => {
  it('matches plain keys case-insensitively', () => {
    expect(matchHotkey('k', press())).toBe(true)
    expect(matchHotkey('K', press())).toBe(true)
    expect(matchHotkey('Enter', press({ key: 'Enter' }))).toBe(true)
    expect(matchHotkey('j', press())).toBe(false)
  })

  it('matches chords in any order', () => {
    const chord = press({ ctrl: true, shift: true })
    expect(matchHotkey('ctrl+shift+k', chord)).toBe(true)
    expect(matchHotkey('shift+ctrl+k', chord)).toBe(true)
    expect(matchHotkey('ctrl+k', chord)).toBe(false)
  })

  it('reads Mac aliases', () => {
    expect(matchHotkey('cmd+k', press({ meta: true }))).toBe(true)
    expect(matchHotkey('command+k', press({ meta: true }))).toBe(true)
    expect(matchHotkey('option+k', press({ alt: true }))).toBe(true)
    expect(matchHotkey('control+k', press({ ctrl: true }))).toBe(true)
  })

  it('requires exact modifiers: extras fail', () => {
    expect(matchHotkey('ctrl+k', press({ ctrl: true, shift: true }))).toBe(false)
    expect(matchHotkey('k', press({ meta: true }))).toBe(false)
  })

  it('never matches auto-repeat', () => {
    expect(matchHotkey('k', press({ repeat: true }))).toBe(false)
    expect(matchHotkey('ctrl+k', press({ ctrl: true, repeat: true }))).toBe(false)
  })

  it('matches nothing on malformed patterns', () => {
    expect(matchHotkey('', press())).toBe(false)
    expect(matchHotkey('ctrl+shift', press({ ctrl: true, shift: true }))).toBe(false)
    expect(matchHotkey('ctrl+k+j', press({ ctrl: true }))).toBe(false)
    expect(matchHotkey('  ', press())).toBe(false)
  })
})
