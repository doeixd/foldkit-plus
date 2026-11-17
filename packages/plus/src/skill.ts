/**
 * What `npx foldkit-plus skill` and `docs` decide about the agent skill: which
 * of two skills is newer, whether an installed folder may be written over, and
 * what to say about a copy that is not the one shipped. Pure: `project.ts`
 * reads and writes the folders.
 */
import { Option } from 'effect'

/** `metadata.version` from a `SKILL.md`'s front matter. */
export const versionOf = (skillText: string): Option.Option<string> =>
  Option.fromNullishOr(/^\s+version:\s*['"]?([^'"\s]+)/m.exec(skillText)?.[1])

/** `name` from a `SKILL.md`'s front matter. */
export const nameOf = (skillText: string): Option.Option<string> =>
  Option.fromNullishOr(/^name:\s*['"]?([^'"\s]+)/m.exec(skillText)?.[1])

const parts = (version: string) => version.split(/[.-]/).map(part => Number.parseInt(part, 10))

/** Negative when `a` is the older version, positive when newer, 0 when they read alike. */
export const compareVersions = (a: string, b: string): number => {
  const [x, y] = [parts(a), parts(b)]
  for (let at = 0; at < Math.max(x.length, y.length); at++) {
    const difference = (x[at] ?? 0) - (y[at] ?? 0)
    if (difference !== 0 && !Number.isNaN(difference)) return difference
  }
  return 0
}

/** A skill folder as it stands, if there is one. */
export interface Existing {
  /** Whether its `SKILL.md` is named `foldkit-plus`. */
  readonly ours: boolean
  readonly version: Option.Option<string>
}

export type Plan = 'write' | 'current' | 'replace' | 'refuse'

/**
 * Installing the shipped skill over `existing`. The same version is left
 * alone, whatever its files hold; a different one, or a skill of another
 * name, is written over only on `force`.
 */
export const planInstall = (
  existing: Option.Option<Existing>,
  shipped: string,
  force: boolean,
): Plan =>
  Option.match(existing, {
    onNone: () => 'write',
    onSome: found =>
      found.ours && Option.exists(found.version, version => version === shipped)
        ? 'current'
        : force
          ? 'replace'
          : 'refuse',
  })

/** Why an install was refused: what is there, and how to replace it. */
export const refusal = (where: string, existing: Existing, shipped: string): string =>
  `${where} holds ${
    existing.ours
      ? `foldkit-plus skill ${Option.getOrElse(existing.version, () => 'with no version')}`
      : 'a skill that is not foldkit-plus'
  }, not the ${shipped} that ships with the installed code. Run \`npx foldkit-plus skill --force\` to replace it.`

/**
 * One line for `docs` when the skill a project installed in a dot-folder is
 * not the one shipped with the installed `foldkit-plus`, which is the one it
 * answers from; none when they are the same version.
 */
export const mismatchNote = (
  where: string,
  found: string,
  shipped: string,
  plus: string,
): Option.Option<string> => {
  const order = compareVersions(found, shipped)
  return found === shipped
    ? Option.none()
    : Option.some(
        `The skill in ${where} is ${found}, ${order > 0 ? 'newer than' : order < 0 ? 'older than' : 'not'} the ${shipped} that ships with ${plus}; answering from the shipped one, which matches the installed code. \`npx foldkit-plus skill --force\` installs it there.`,
      )
}
