/**
 * The studio's state in the address, so a reload and a shared link land where
 * one was: what is open, and how a list is narrowed. Each application names
 * its parameters; the chair (`as`) and anything else there is kept.
 */
import { Effect, Option } from 'effect'
import * as Navigation from 'foldkit/navigation'
import type { Url } from 'foldkit/url'

/** `href` with each of `params` set, or removed where it is none; its other parameters kept. */
export const addressFor = (
  href: string,
  params: Readonly<Record<string, Option.Option<string>>>,
): string => {
  const at = new URL(href, 'https://cms.invalid')
  for (const [key, value] of Object.entries(params))
    Option.match(value, {
      onNone: () => at.searchParams.delete(key),
      onSome: named => at.searchParams.set(key, named),
    })
  return `${at.pathname}${at.search}${at.hash}`
}

/** A parameter of an address, where it is there and not empty. */
export const paramOf = (url: Url, key: string): Option.Option<string> =>
  Option.filter(
    Option.fromNullOr(new URLSearchParams(Option.getOrElse(url.search, () => '')).get(key)),
    value => value !== '',
  )

/**
 * Writes `params` into the address. Opening or closing what `entry` names is a
 * step Back returns from; anything else (a selection, a search) replaces the
 * address in place, so Back does not walk through every keystroke, nor through
 * an address that already said it, as after Back itself.
 */
export const writeAddress = (
  params: Readonly<Record<string, Option.Option<string>>>,
  entry: string,
): Effect.Effect<void> =>
  Effect.suspend(() => {
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const next = addressFor(here, params)
    const entryOf = (href: string) => new URL(href, 'https://cms.invalid').searchParams.get(entry)
    return entryOf(next) === entryOf(here) ? Navigation.replaceUrl(next) : Navigation.pushUrl(next)
  })
