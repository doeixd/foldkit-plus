/**
 * Hotkey matching over press payloads: chords, Mac aliases, exactness,
 * repeat rejection, and malformed patterns. No effects, no DOM.
 */
import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { ariaKeyshortcuts, formatHotkey, matchHotkey, type KeyPress } from '../src/events/index.js'

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

  it('reads key aliases', () => {
    expect(matchHotkey('space', press({ key: ' ' }))).toBe(true)
    expect(matchHotkey(' ', press({ key: ' ' }))).toBe(true)
    expect(matchHotkey('esc', press({ key: 'Escape' }))).toBe(true)
    expect(matchHotkey('escape', press({ key: 'Escape' }))).toBe(true)
    expect(matchHotkey('space', press({ key: 'Enter' }))).toBe(false)
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

describe('mod, by platform', () => {
  it.each([
    ['mac', { meta: true }, { ctrl: true }],
    ['ios', { meta: true }, { ctrl: true }],
    ['windows', { ctrl: true }, { meta: true }],
    ['linux', { ctrl: true }, { meta: true }],
    ['unknown', { ctrl: true }, { meta: true }],
  ] as const)('on %s it is the one primary modifier and not the other', (platform, yes, no) => {
    expect(matchHotkey('mod+k', press(yes), { platform })).toBe(true)
    expect(matchHotkey('mod+k', press(no), { platform })).toBe(false)
    expect(matchHotkey('mod+k', press(), { platform })).toBe(false)
  })

  it('is Control with no platform given', () => {
    expect(matchHotkey('mod+k', press({ ctrl: true }))).toBe(true)
  })
})

describe('layout-independent letters and digits', () => {
  // Option+N types a tilde on a Mac: the key is not "n", the physical key is.
  const optionN = press({ key: '˜', code: 'KeyN', alt: true })

  it('matches a letter by its physical key when the layout typed another character', () => {
    expect(matchHotkey('alt+n', optionN)).toBe(true)
    expect(matchHotkey('alt+m', optionN)).toBe(false)
  })

  it('matches a digit through Shift, which types a symbol', () => {
    expect(matchHotkey('shift+1', press({ key: '!', code: 'Digit1', shift: true }))).toBe(true)
    expect(matchHotkey('shift+2', press({ key: '!', code: 'Digit1', shift: true }))).toBe(false)
  })

  it('matches another alphabet by the physical key', () => {
    expect(matchHotkey('ctrl+s', press({ key: 'ы', code: 'KeyS', ctrl: true }))).toBe(true)
  })

  it('never takes the physical key over a Latin letter the layout did type', () => {
    // Dvorak: the physical KeyK types "t", so ctrl+k must not fire on it.
    expect(matchHotkey('ctrl+k', press({ key: 't', code: 'KeyK', ctrl: true }))).toBe(false)
    expect(matchHotkey('ctrl+t', press({ key: 't', code: 'KeyK', ctrl: true }))).toBe(true)
  })

  it('does not match without a code when the character is not the key', () => {
    expect(matchHotkey('alt+n', press({ key: '˜', alt: true }))).toBe(false)
  })
})

describe('typing in a field', () => {
  const typing = { typing: true }

  it('leaves a bare key and a shifted key to the text', () => {
    expect(matchHotkey('k', press(typing))).toBe(false)
    expect(matchHotkey('shift+k', press({ ...typing, shift: true }))).toBe(false)
    expect(matchHotkey('space', press({ ...typing, key: ' ' }))).toBe(false)
    expect(matchHotkey('k', press({ typing: false }))).toBe(true)
  })

  it.each([
    ['ctrl+k', { ctrl: true }],
    ['alt+k', { alt: true }],
    ['meta+k', { meta: true }],
    ['mod+k', { ctrl: true }],
  ] as const)('still runs %s', (pattern, modifiers) => {
    expect(matchHotkey(pattern, press({ ...typing, ...modifiers }))).toBe(true)
  })

  it('runs a bare key when asked to', () => {
    expect(matchHotkey('escape', press({ ...typing, key: 'Escape' }), { allowInInput: true })).toBe(
      true,
    )
  })
})

describe('key aliases and hostile patterns', () => {
  it.each([
    ['up', 'ArrowUp'],
    ['left', 'ArrowLeft'],
    ['del', 'Delete'],
    ['return', 'Enter'],
    ['pageup', 'PageUp'],
    ['plus', '+'],
  ])('%s is %s', (pattern, key) => {
    expect(matchHotkey(pattern, press({ key }))).toBe(true)
  })

  it('reads no inherited name from a pattern', () => {
    for (const pattern of ['constructor', 'toString', '__proto__', 'ctrl+constructor']) {
      expect(matchHotkey(pattern, press({ key: 'constructor', ctrl: true }))).toBe(
        pattern === 'ctrl+constructor',
      )
    }
  })
})

describe('ariaKeyshortcuts and formatHotkey, from the one pattern', () => {
  it.each([
    ['mod+shift+n', 'mac', 'Meta+Shift+N', '⌘⇧N'],
    ['mod+shift+n', 'ios', 'Meta+Shift+N', '⌘⇧N'],
    ['mod+shift+n', 'windows', 'Control+Shift+N', 'Ctrl+Shift+N'],
    ['mod+shift+n', 'unknown', 'Control+Shift+N', 'Ctrl+Shift+N'],
    ['alt+left', 'mac', 'Alt+ArrowLeft', '⌥←'],
    ['alt+left', 'linux', 'Alt+ArrowLeft', 'Alt+Left'],
    ['esc', 'linux', 'Escape', 'Esc'],
    ['ctrl+space', 'mac', 'Control+Space', '⌃␣'],
    ['cmd+,', 'mac', 'Meta+,', '⌘,'],
  ] as const)('%s on %s', (pattern, platform, aria, shown) => {
    expect(ariaKeyshortcuts(pattern, platform)).toEqual(Option.some(aria))
    // The left-to-right isolate keeps a right-to-left layout from writing "N⌘".
    expect(formatHotkey(pattern, platform)).toEqual(Option.some(`⁦${shown}⁩`))
  })

  it('writes the same chord the matcher runs', () => {
    expect(ariaKeyshortcuts('mod+k', 'mac')).toEqual(Option.some('Meta+K'))
    expect(matchHotkey('mod+k', press({ meta: true }), { platform: 'mac' })).toBe(true)
  })

  it('says nothing for a pattern that matches nothing', () => {
    for (const pattern of ['', 'ctrl+shift', 'ctrl+k+j']) {
      expect(ariaKeyshortcuts(pattern)).toEqual(Option.none())
      expect(formatHotkey(pattern)).toEqual(Option.none())
    }
  })
})
