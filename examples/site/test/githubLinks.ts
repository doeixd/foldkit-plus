/**
 * The link check's reading of a link to this repository on GitHub: a file or
 * folder on `main` is looked up in the working tree (its anchors are not read), one pinned to a release
 * tag (a post's) in that tag's tree, with `git cat-file`, and an `#anchor` on a
 * Markdown file against that file's headings as GitHub slugs them.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { GITHUB, parse, slugger } from '../src/content/guides.js'
import { textOf } from '../src/content/text.js'

const LINK = new RegExp(
  `^${GITHUB.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:blob|tree)/([^/#]+)/([^#]*)(?:#(.*))?$`,
)

const git = (repository: string, ...args: ReadonlyArray<string>): string | undefined => {
  try {
    return execFileSync('git', args, {
      cwd: repository,
      encoding: 'utf8',
      maxBuffer: 1 << 26,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return undefined
  }
}

const idsOf = (markdown: string): ReadonlySet<string> => {
  const slug = slugger()
  return new Set(
    parse(markdown)
      .children.filter(node => node.type === 'heading')
      .map(heading => slug(textOf(heading))),
  )
}

const answers = new Map<string, string | undefined>()

/** Why `href` leads nowhere, or nothing when it is not a link to this repository's files or leads somewhere. */
const check = (repository: string, href: string): string | undefined => {
  const [, ref, encoded = '', anchor] = LINK.exec(href) ?? []
  if (ref === undefined) return undefined
  const path = decodeURIComponent(encoded)
  if (ref === 'main') {
    return existsSync(join(repository, path)) ? undefined : `${path} is not in the repository`
  }
  if (git(repository, 'rev-parse', '-q', '--verify', `refs/tags/${ref}`) === undefined)
    return `the tag ${ref} is not here: fetch the tags (git fetch --tags) before this check`
  const text = git(repository, 'cat-file', 'blob', `${ref}:${path}`)
  if (text === undefined) {
    return git(repository, 'cat-file', '-e', `${ref}:${path}`) === undefined
      ? `${path} is not in the tree of ${ref}`
      : undefined
  }
  if (anchor === undefined || !path.endsWith('.md')) return undefined
  return idsOf(text).has(anchor) ? undefined : `no #${anchor} in ${path} at ${ref}`
}

/** Each link is looked up once: a page's links repeat on every page that draws them, and a git process costs. */
export const brokenGithubLink = (repository: string, href: string): string | undefined => {
  const key = `${repository}|${href}`
  if (!answers.has(key)) answers.set(key, check(repository, href))
  return answers.get(key)
}
