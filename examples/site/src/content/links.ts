/**
 * Code in prose, linked to what it names: `` `Remote.make` `` leads to the
 * member on its API page, `` `foldkit-sync` `` to the package's guides. A
 * name links only when it names one thing: a name two packages export, a
 * lowercase word (`update`) or a name Foldkit and Effect own (`Model`,
 * `Schema`) stays plain text, since a wrong link explains less than none.
 */
import { Option } from 'effect'

/** One thing a code span may name, and where it is explained. */
export interface Target {
  /** As prose writes it: `Remote`, `Remote.make`, `foldkit-remote/port`. */
  readonly name: string
  readonly path: string
  /** The subsite it belongs to, which wins a tie for a page in the same one. */
  readonly subsite: string
  /** Whether its declaring package is the one exporting it, not a re-export. */
  readonly declared: boolean
  /** A package's namespace (`Remote`, `Style`): named by one word, and meant by it. */
  readonly namespace: boolean
}

/** Names every application has, which no package here owns. */
const SHARED = new Set([
  'Model',
  'Message',
  'Command',
  'Subscription',
  'Html',
  'Document',
  'Schema',
  'Effect',
  'Option',
  'Stream',
  'Layer',
  'Context',
  'Url',
  'Route',
  'Runtime',
  'Data',
  'App',
])

const PATH = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/
const PACKAGE = /^foldkit-[a-z-]+(?:\/[a-z-]+)*$/

/** `Remote.make(…)` names `Remote.make`; anything with more in it names nothing. */
const nameIn = (code: string): string => code.trim().replace(/\((?:\.\.\.|…)?\)$/, '')

/** The target, when every one given leads to the same page. */
const oneOf = (pool: ReadonlyArray<Target>): Option.Option<Target> =>
  new Set(pool.map(target => target.path)).size === 1
    ? Option.fromNullishOr(pool[0])
    : Option.none()

export interface Links {
  /** Where a code span written on the page at `from` leads, if it names one thing. */
  readonly linkOf: (code: string, from: string) => Option.Option<string>
}

export const links = (
  targets: ReadonlyArray<Target>,
  subsiteOf: (path: string) => string,
): Links => {
  const byName = new Map<string, Array<Target>>()
  for (const target of targets) {
    const named = byName.get(target.name)
    if (named === undefined) byName.set(target.name, [target])
    else named.push(target)
  }
  return {
    linkOf: (code, from) => {
      const name = nameIn(code)
      if (!PACKAGE.test(name)) {
        if (!PATH.test(name) || SHARED.has(name.split('.')[0]!)) return Option.none()
        // A bare lowercase word is too likely to be the reader's own `update`.
        if (!name.includes('.') && !/^[A-Z]/.test(name)) return Option.none()
      }
      const found = byName.get(name) ?? []
      const declared = found.filter(target => target.declared)
      const named = declared.length > 0 ? declared : found
      // One plain word (`Loading`, `Container`) is as likely a state or a role
      // in the prose as another family's export: unless it is a namespace, it
      // links only in its own.
      const pool = /^[A-Z][a-z]+$/.test(name)
        ? named.filter(target => target.namespace || target.subsite === subsiteOf(from))
        : named
      return oneOf(pool).pipe(
        Option.orElse(() => oneOf(pool.filter(target => target.subsite === subsiteOf(from)))),
        Option.map(target => target.path),
        // A page does not link to itself.
        Option.filter(path => path.split('#')[0] !== from),
      )
    },
  }
}
