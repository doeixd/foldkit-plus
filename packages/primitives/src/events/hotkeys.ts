import { Option } from 'effect'
import type { Platform } from '../media/platform.js'

export interface KeyPress {
  readonly key: string
  readonly repeat: boolean
  readonly ctrl: boolean
  readonly shift: boolean
  readonly alt: boolean
  readonly meta: boolean
  /** The physical key (`KeyN`, `Digit1`): a letter or digit the layout typed as something else still matches. */
  readonly code?: string | undefined
  /** Focus was in a field where text is typed. `keyboardEvents` reports it. */
  readonly typing?: boolean | undefined
}

type Modifier = 'ctrl' | 'shift' | 'alt' | 'meta'

interface Chord {
  /** A letter or digit in lower case, or a key name as `aria-keyshortcuts` writes it (`Enter`, `ArrowUp`, `Space`). */
  readonly key: string
  readonly ctrl: boolean
  readonly shift: boolean
  readonly alt: boolean
  readonly meta: boolean
  /** The pattern's parts in the order written, as `aria-keyshortcuts` names them. */
  readonly written: ReadonlyArray<string>
}

const isApple = (platform: Platform): boolean => platform === 'mac' || platform === 'ios'

// A Map, not an object: a pattern is the application's text, and `constructor`
// must not read `Object`'s.
const keyNames = new Map<string, string>([
  ['spacebar', 'Space'],
  [' ', 'Space'],
  ['space', 'Space'],
  ['esc', 'Escape'],
  ['escape', 'Escape'],
  ['return', 'Enter'],
  ['enter', 'Enter'],
  ['tab', 'Tab'],
  ['backspace', 'Backspace'],
  ['del', 'Delete'],
  ['delete', 'Delete'],
  ['up', 'ArrowUp'],
  ['down', 'ArrowDown'],
  ['left', 'ArrowLeft'],
  ['right', 'ArrowRight'],
  ['arrowup', 'ArrowUp'],
  ['arrowdown', 'ArrowDown'],
  ['arrowleft', 'ArrowLeft'],
  ['arrowright', 'ArrowRight'],
  ['home', 'Home'],
  ['end', 'End'],
  ['pageup', 'PageUp'],
  ['pagedown', 'PageDown'],
  ['plus', '+'],
])

const modifierNames = new Map<string, Modifier | 'mod'>([
  ['ctrl', 'ctrl'],
  ['control', 'ctrl'],
  ['shift', 'shift'],
  ['alt', 'alt'],
  ['option', 'alt'],
  ['opt', 'alt'],
  ['meta', 'meta'],
  ['cmd', 'meta'],
  ['command', 'meta'],
  ['mod', 'mod'],
])

const ariaModifiers: Record<Modifier, string> = {
  ctrl: 'Control',
  shift: 'Shift',
  alt: 'Alt',
  meta: 'Meta',
}

const parsed = new Map<string, Option.Option<Chord>>()
const parsedLimit = 256

const parse = (pattern: string, platform: Platform): Option.Option<Chord> => {
  const cacheKey = `${isApple(platform) ? 'a' : 'o'}:${pattern}`
  const cached = parsed.get(cacheKey)
  if (cached !== undefined) return cached
  const chord = read(pattern, platform)
  // Patterns are written once in an application, so the table stays small; a
  // generated one cannot grow it without bound.
  if (parsed.size >= parsedLimit) parsed.clear()
  parsed.set(cacheKey, chord)
  return chord
}

const read = (pattern: string, platform: Platform): Option.Option<Chord> => {
  const trimmed = pattern
    .split('+')
    .map(part => part.trim().toLowerCase())
    .filter(part => part !== '')
  // A bare whitespace pattern means the space key; an empty pattern is malformed.
  const parts = trimmed.length === 0 && pattern.length > 0 ? ['space'] : trimmed
  const modifiers = { ctrl: false, shift: false, alt: false, meta: false }
  const written: string[] = []
  const keys: string[] = []
  for (const part of parts) {
    const named = modifierNames.get(part)
    if (named === undefined) {
      keys.push(part)
      continue
    }
    const modifier = named === 'mod' ? (isApple(platform) ? 'meta' : 'ctrl') : named
    modifiers[modifier] = true
    written.push(ariaModifiers[modifier])
  }
  const [key, ...extra] = keys
  if (key === undefined || extra.length > 0) return Option.none()
  const name = keyNames.get(key) ?? key
  written.push(name.length === 1 ? name.toUpperCase() : name)
  return Option.some({ key: name, ...modifiers, written })
}

const letterOrDigit = /^[a-z0-9]$/

const keyMatches = (chord: Chord, press: KeyPress): boolean => {
  if (chord.key === 'Space') return press.key === ' ' || press.key.toLowerCase() === 'spacebar'
  if (!letterOrDigit.test(chord.key)) return press.key.toLowerCase() === chord.key.toLowerCase()
  const typed = press.key.length === 1 ? press.key.toLowerCase() : press.key
  if (typed === chord.key) return true
  // A Latin letter or digit that is not this key is another key on this layout.
  if (letterOrDigit.test(typed)) return false
  // Option+N types "˜" on a Mac, and other alphabets type their own letters:
  // the physical key says which one was meant.
  return (
    press.code === (/\d/.test(chord.key) ? `Digit${chord.key}` : `Key${chord.key.toUpperCase()}`)
  )
}

const hasCommandModifier = (chord: Chord): boolean => chord.ctrl || chord.alt || chord.meta

export interface HotkeyOptions {
  /** What `mod` is: Meta on `mac` and `ios`, Control elsewhere. Default `unknown`, so Control. */
  readonly platform?: Platform | undefined
  /** Match a press made in a text field too, which `matchHotkey` otherwise leaves to the typing. */
  readonly allowInInput?: boolean | undefined
}

/**
 * Hotkey matching as a pure function over a `Pressed` payload: `matchHotkey`
 * answers whether a press is the shortcut, so `update` stays a table of
 * chords instead of a nest of modifier checks. Patterns read like
 * `"ctrl+shift+k"`: modifiers first (any order), the key last,
 * case-insensitive, with `cmd`/`command` and `option` as the Mac names for
 * meta and alt, and `mod` for Meta on a Mac (`platform: 'mac'` or `'ios'`) and
 * Control elsewhere. Matching is exact: unlisted modifiers must be up.
 * Auto-repeat never matches, so holding a chord fires once. A letter or digit
 * also matches by its physical `code` when the layout typed another character
 * (Option+N on a Mac types a tilde), but never when it typed a different Latin
 * letter, so a Dvorak `k` is not a `KeyK`. A press made while typing in a field
 * (`typing`) does not match unless the pattern holds Control, Alt or Meta, or
 * `allowInInput` is set. `space` (or a bare space) means the space key; `esc`
 * means escape. A pattern with no key, or two keys, matches nothing:
 * predicates return false, they do not throw on the hot path.
 */
export const matchHotkey = (
  pattern: string,
  press: KeyPress,
  options: HotkeyOptions = {},
): boolean => {
  if (press.repeat) return false
  return Option.match(parse(pattern, options.platform ?? 'unknown'), {
    onNone: () => false,
    onSome: chord =>
      keyMatches(chord, press) &&
      chord.ctrl === press.ctrl &&
      chord.shift === press.shift &&
      chord.alt === press.alt &&
      chord.meta === press.meta &&
      (press.typing !== true || options.allowInInput === true || hasCommandModifier(chord)),
  })
}

/**
 * The value of `aria-keyshortcuts` for a pattern: `mod+shift+n` is
 * `Meta+Shift+N` on a Mac and `Control+Shift+N` elsewhere, in the order the
 * pattern wrote its parts. None for a pattern `matchHotkey` would never match,
 * so one definition draws the attribute and runs the shortcut.
 */
export const ariaKeyshortcuts = (
  pattern: string,
  platform: Platform = 'unknown',
): Option.Option<string> => Option.map(parse(pattern, platform), chord => chord.written.join('+'))

const appleGlyphs = new Map<string, string>([
  ['Meta', '⌘'],
  ['Control', '⌃'],
  ['Alt', '⌥'],
  ['Shift', '⇧'],
  ['Backspace', '⌫'],
  ['Delete', '⌦'],
  ['Enter', '↩'],
  ['Escape', '⎋'],
  ['Tab', '⇥'],
  ['Space', '␣'],
  ['ArrowUp', '↑'],
  ['ArrowDown', '↓'],
  ['ArrowLeft', '←'],
  ['ArrowRight', '→'],
  ['PageUp', '⇞'],
  ['PageDown', '⇟'],
  ['Home', '↖'],
  ['End', '↘'],
])

const shortNames = new Map<string, string>([
  ['Control', 'Ctrl'],
  ['Delete', 'Del'],
  ['Escape', 'Esc'],
  ['ArrowUp', 'Up'],
  ['ArrowDown', 'Down'],
  ['ArrowLeft', 'Left'],
  ['ArrowRight', 'Right'],
])

/**
 * What to show beside a control for a pattern: `⌘N` on a Mac or iPhone, `Ctrl+N`
 * elsewhere. The text sits in a left-to-right isolate, so a right-to-left
 * layout does not reorder it into `N⌘`. None for a pattern `matchHotkey`
 * would never match.
 */
export const formatHotkey = (
  pattern: string,
  platform: Platform = 'unknown',
): Option.Option<string> =>
  Option.map(parse(pattern, platform), chord => {
    const text = isApple(platform)
      ? chord.written.map(key => appleGlyphs.get(key) ?? key).join('')
      : chord.written.map(key => shortNames.get(key) ?? key).join('+')
    return `\u2066${text}\u2069`
  })
