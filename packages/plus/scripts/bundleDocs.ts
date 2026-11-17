/**
 * What the package carries beside `dist`: the agent skill (`skill/`) and the
 * conceptual guides (`guides/`), copied from the repository at build time so
 * they are versioned with the code. The copies are generated and git-ignored.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { posix, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const REPOSITORY = 'https://github.com/doeixd/foldkit-plus'

/**
 * The tag a release is made under: the first `## X.Y.Z` heading of the
 * changelog, which the release workflow requires to match the pushed `vX.Y.Z`
 * tag. The repository's tags follow that heading, not any one package's version.
 */
export const releaseTag = (changelog: string): string | undefined => {
  const version = /^## (\d+\.\d+\.\d+\S*)\s*$/m.exec(changelog)?.[1]
  return version === undefined ? undefined : `v${version}`
}

/** The guides the site publishes from `docs/`, by file name, in catalog order and without repeats. */
export const guidesOf = (
  sources: ReadonlyArray<{ readonly file: string }>,
): ReadonlyArray<string> => [
  ...new Set(
    sources.flatMap(({ file }) => {
      const named = /^docs\/([^/]+\.md)$/.exec(file)
      return named === null ? [] : [named[1]!]
    }),
  ),
]

const FENCE = /^\s*(`{3,}|~{3,})/
const SCHEME = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i

/** Applies `change` to the target of every Markdown link outside a code fence. */
const mapLinks = (text: string, change: (target: string) => string): string => {
  let fence = ''
  return text
    .split('\n')
    .map(line => {
      const marker = FENCE.exec(line)?.[1]
      if (
        marker !== undefined &&
        (fence === '' || (marker[0] === fence[0] && marker.length >= fence.length))
      )
        fence = fence === '' ? marker : ''
      if (fence !== '' || marker !== undefined) return line
      return line
        .replace(
          /(\]\()(<[^>]*>|[^)\s]+)/g,
          (_, open: string, target: string) => `${open}${change(target)}`,
        )
        .replace(
          /^(\s*\[[^\]]+\]:\s*)(\S+)/,
          (_, open: string, target: string) => `${open}${change(target)}`,
        )
    })
    .join('\n')
}

/**
 * A guide's text for the tarball: a link to another shipped guide stays
 * relative (they sit side by side), any other relative link becomes the
 * repository's file at `tag`, so a copy never dangles; anchors are kept.
 */
export const rewriteGuide = (text: string, shipped: ReadonlyArray<string>, tag: string): string =>
  mapLinks(text, target => {
    if (SCHEME.test(target)) return target
    const [path = '', ...rest] = target.split(/(?=[#?])/)
    const suffix = rest.join('')
    const resolved = posix.normalize(posix.join('docs', path))
    const guide = /^docs\/([^/]+\.md)$/.exec(resolved)?.[1]
    if (guide !== undefined && shipped.includes(guide)) return `${guide}${suffix}`
    return `${REPOSITORY}/blob/${tag}/${resolved}${suffix}`
  })

/** The skill's text for the tarball: its absolute links to `main` point at `tag` instead. */
export const pinSkill = (text: string, tag: string): string =>
  text
    .replaceAll(`${REPOSITORY}/blob/main/`, `${REPOSITORY}/blob/${tag}/`)
    .replaceAll(`${REPOSITORY}/tree/main/`, `${REPOSITORY}/tree/${tag}/`)

/** The site's catalog sources, read where the site keeps them, so the list has one home. */
export const publishedGuides = async (root: string): Promise<ReadonlyArray<string>> => {
  const url = pathToFileURL(join(root, 'examples/site/src/catalog.ts')).href
  const catalog: { allSubsites?: ReadonlyArray<{ sources: ReadonlyArray<{ file: string }> }> } =
    await import(/* @vite-ignore */ url)
  if (catalog.allSubsites === undefined)
    throw new Error("the site's catalog exports no allSubsites")
  return guidesOf(catalog.allSubsites.flatMap(subsite => subsite.sources))
}

/** Writes `skill/` and `guides/` into `out`, replacing what a last build left. */
export const writeBundle = async (root: string, out: string): Promise<void> => {
  const changelog = join(root, 'CHANGELOG.md')
  const tag =
    (existsSync(changelog) ? releaseTag(readFileSync(changelog, 'utf8')) : undefined) ?? 'main'
  const guides = await publishedGuides(root)
  rmSync(join(out, 'skill'), { recursive: true, force: true })
  rmSync(join(out, 'guides'), { recursive: true, force: true })
  mkdirSync(join(out, 'guides'), { recursive: true })
  const skill = join(root, 'skills/foldkit-plus')
  cpSync(skill, join(out, 'skill'), { recursive: true })
  for (const file of readdirSync(join(out, 'skill'), { recursive: true, encoding: 'utf8' })) {
    if (!file.endsWith('.md')) continue
    const path = join(out, 'skill', file)
    writeFileSync(path, pinSkill(readFileSync(path, 'utf8'), tag))
  }
  for (const guide of guides)
    writeFileSync(
      join(out, 'guides', guide),
      rewriteGuide(readFileSync(join(root, 'docs', guide), 'utf8'), guides, tag),
    )
}
