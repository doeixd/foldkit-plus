/**
 * Hotkey matching as a pure function over a `Pressed` payload: `matchHotkey`
 * answers whether a press is the shortcut, so `update` stays a table of
 * chords instead of a nest of modifier checks. Patterns read like
 * `"ctrl+shift+k"`: modifiers first (any order), the key last,
 * case-insensitive, with `cmd`/`command` and `option` as the Mac names for
 * meta and alt. Matching is exact — unlisted modifiers must be up — and
 * auto-repeat never matches, so holding a chord fires once. A pattern with
 * no key, or two keys, matches nothing: predicates return false, they do
 * not throw on the hot path.
 */

export interface KeyPress {
  readonly key: string
  readonly repeat: boolean
  readonly ctrl: boolean
  readonly shift: boolean
  readonly alt: boolean
  readonly meta: boolean
}

const modifierOf = (part: string): 'ctrl' | 'shift' | 'alt' | 'meta' | null => {
  switch (part) {
    case 'ctrl':
    case 'control':
      return 'ctrl'
    case 'shift':
      return 'shift'
    case 'alt':
    case 'option':
      return 'alt'
    case 'meta':
    case 'cmd':
    case 'command':
      return 'meta'
    default:
      return null
  }
}

export const matchHotkey = (pattern: string, press: KeyPress): boolean => {
  if (press.repeat) return false
  const parts = pattern
    .split('+')
    .map(part => part.trim().toLowerCase())
    .filter(part => part !== '')
  const keys = parts.filter(part => modifierOf(part) === null)
  if (keys.length !== 1) return false
  if (keys[0] !== press.key.toLowerCase()) return false
  const required: Record<'ctrl' | 'shift' | 'alt' | 'meta', boolean> = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
  }
  for (const part of parts) {
    const modifier = modifierOf(part)
    if (modifier !== null) required[modifier] = true
  }
  return (
    required.ctrl === press.ctrl &&
    required.shift === press.shift &&
    required.alt === press.alt &&
    required.meta === press.meta
  )
}
