/**
 * The studio's state in the address, so a reload and a shared link land where
 * one was: what is open, and how a list is narrowed. Each application names
 * its parameters; the chair (`as`) and anything else there is kept.
 */
import { Effect, Equal, Option } from 'effect'
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
 * Writes `params` into the address. Opening or closing an entry (by whichever
 * of `entries` names it) is a step Back returns from; anything else (a
 * selection, a search, an entry's first save turning `new` into its own key)
 * replaces the address in place, so Back does not walk through every
 * keystroke, nor through an address that already said it, as after Back itself.
 */
export const writeAddress = (
  params: Readonly<Record<string, Option.Option<string>>>,
  entries: ReadonlyArray<string>,
): Effect.Effect<void> =>
  Effect.suspend(() => {
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const next = addressFor(here, params)
    const entryOf = (href: string) => {
      const found = new URL(href, 'https://cms.invalid').searchParams
      return entries.map(key => found.get(key)).find(value => value !== null) ?? null
    }
    return entryOf(next) === entryOf(here) ? Navigation.replaceUrl(next) : Navigation.pushUrl(next)
  })

/**
 * The entry an address names: `<key>=<id>` once it is saved, and `new=<id>`
 * until its first save makes it, so a reload of something new comes back to it.
 */
export const entryIn = (url: Url, key: string) => {
  const stored = paramOf(url, key)
  return { stored, fresh: Option.isSome(stored) ? Option.none<string>() : paramOf(url, 'new') }
}

/** The address's names for the entry an editor has open: its own key once saved, else `new`. */
export const entryOut = <M>(editor: EntryEditor<M, unknown>, model: M) => {
  const stored = editor.storedEntry(model)
  return {
    stored,
    fresh: Option.isSome(stored) ? Option.none<string>() : editor.entry(model),
  }
}

/** What routing needs of an application's entry editor. */
export interface EntryEditor<M, C> {
  /** The entry open, new or not; none while closed. */
  readonly entry: (model: M) => Option.Option<string>
  /** The entry open, once the server knows it. */
  readonly storedEntry: (model: M) => Option.Option<string>
  /** Whether the entry asked for is one the server does not have. */
  readonly missing: (model: M) => boolean
  /** Whether what was asked for is still being read. */
  readonly loading: (model: M) => boolean
  /** What leaving saves first. */
  readonly flush: (model: M) => {
    readonly model: M
    readonly commands?: ReadonlyArray<C> | undefined
  }
  readonly open: (entry: string) => (model: M) => { readonly model: M }
  readonly create: (entry: string) => (model: M) => { readonly model: M }
  readonly close: () => (model: M) => { readonly model: M }
}

/**
 * `model` with the entry an address names open, and none when it names none:
 * what was typed saved first. An entry named as new is opened by its id, in
 * case its first save already made it, and `fresh` names it until
 * `beginMissing` knows. The one open already stays, and so does what is still
 * `waiting` to be known: the runtime names the starting address again after
 * `init`, before the server has answered.
 */
export const openNamed = <M, C>(
  editor: EntryEditor<M, C>,
  model: M,
  named: { readonly stored: Option.Option<string>; readonly fresh: Option.Option<string> },
  waiting: Option.Option<string>,
): {
  readonly model: M
  readonly commands: ReadonlyArray<C>
  readonly fresh: Option.Option<string>
} => {
  const target = Option.orElse(named.stored, () => named.fresh)
  if (Equal.equals(target, editor.entry(model))) return { model, commands: [], fresh: waiting }
  const flushed = editor.flush(model)
  return {
    model: Option.match(target, { onNone: editor.close, onSome: editor.open })(flushed.model).model,
    commands: flushed.commands ?? [],
    fresh: named.fresh,
  }
}

/**
 * An entry an address named as new, once its read is answered: begun blank
 * under its own id if the server does not have it, and let go either way. A
 * reload can then never begin an entry over one its first save already made.
 */
export const beginMissing = <M>(
  editor: EntryEditor<M, unknown>,
  model: M,
  fresh: Option.Option<string>,
): { readonly model: M; readonly fresh: Option.Option<string> } => {
  if (Option.isNone(fresh) || editor.loading(model)) return { model, fresh }
  const begun =
    editor.missing(model) && Equal.equals(editor.entry(model), fresh)
      ? editor.create(fresh.value)(model).model
      : model
  return { model: begun, fresh: Option.none() }
}
