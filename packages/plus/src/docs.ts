/**
 * What `npx foldkit-plus docs` answers with: sections of the Markdown that the
 * installed packages and skill ship, ranked against a query, and the
 * declarations a symbol names in their `.d.mts`. Pure: `project.ts` reads the
 * files and passes them in, so a test can give any documents.
 */
import { Option } from 'effect'

/** One Markdown document as it is installed. */
export interface Doc {
  /** What `--list` takes: a package's name without `foldkit-`, or a skill file's name. */
  readonly topic: string
  /** Where it comes from and at which version: `foldkit-remote@0.18.1 README.md`. */
  readonly label: string
  readonly path: string
  readonly text: string
}

/** One heading and the text under it, up to the next heading of any depth. */
export interface Section {
  readonly doc: Doc
  /** The heading and those it sits under, outermost first. */
  readonly headings: ReadonlyArray<string>
  readonly depth: number
  /** The heading's line, from 1. */
  readonly line: number
  /** GitHub's anchor for the heading. */
  readonly anchor: string
  readonly body: ReadonlyArray<string>
}

/** A declaration in a `.d.mts`: its doc comment and its signature. */
export interface Declaration {
  /** The installed package's topic, as its README's. */
  readonly topic: string
  /** `foldkit-remote@0.18.1`. */
  readonly origin: string
  readonly path: string
  readonly line: number
  readonly comment: ReadonlyArray<string>
  readonly signature: ReadonlyArray<string>
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const FENCE = /^\s*(`{3,}|~{3,})/

/** GitHub's slug: lowercase, punctuation dropped, spaces to hyphens. */
const slug = (heading: string) =>
  heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-')

/** A document's sections in order. Text above its first heading belongs to none. */
export const sectionsOf = (doc: Doc): ReadonlyArray<Section> => {
  const lines = doc.text.split(/\r?\n/)
  const sections: Array<Section> = []
  const open: Array<{ depth: number; heading: string }> = []
  const anchors = new Map<string, number>()
  let fence = ''
  let body: Array<string> = []
  lines.forEach((text, index) => {
    const marker = FENCE.exec(text)?.[1]
    // A fence closes on a marker of its own character at least as long as the opening.
    if (
      marker !== undefined &&
      (fence === '' || (marker[0] === fence[0] && marker.length >= fence.length))
    ) {
      fence = fence === '' ? marker : ''
    }
    const heading = fence === '' ? HEADING.exec(text) : null
    if (heading === null || marker !== undefined) {
      body.push(text)
      return
    }
    const depth = heading[1]!.length
    const title = heading[2]!
    while (open.length > 0 && open[open.length - 1]!.depth >= depth) open.pop()
    open.push({ depth, heading: title })
    const base = slug(title)
    const seen = anchors.get(base) ?? 0
    anchors.set(base, seen + 1)
    body = []
    sections.push({
      doc,
      headings: open.map(each => each.heading),
      depth,
      line: index + 1,
      anchor: seen === 0 ? base : `${base}-${seen}`,
      body,
    })
  })
  return sections.map(section => ({ ...section, body: trimBlank(section.body) }))
}

const trimBlank = (lines: ReadonlyArray<string>) => {
  let start = 0
  let end = lines.length
  while (start < end && lines[start]!.trim() === '') start++
  while (end > start && lines[end - 1]!.trim() === '') end--
  return lines.slice(start, end)
}

/**
 * A word as the ranking compares it: lowercase, with a plural, tense or `-ly`
 * ending dropped, so `deletes`, `deleted` and `delete` meet. Deliberately
 * small: it is only a key two words are compared by, never shown.
 */
const stem = (word: string) => {
  const ending = /(?:ing|ed|es|ly|s|e)$/.exec(word)
  return ending !== null && word.length - ending[0].length >= 4
    ? word.slice(0, -ending[0].length)
    : word
}

const words = (text: string): ReadonlyArray<string> =>
  (text.toLowerCase().match(/[\p{L}\p{N}_$]+/gu) ?? []).map(stem)

/** Whether a query names a symbol (`Data.preload`, `RemoteData`) rather than a topic. */
export const isSymbol = (query: string) =>
  /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(query) && /[.A-Z]/.test(query)

export interface Ranked {
  readonly section: Section
  readonly score: number
}

const HEADING_WEIGHT = 3

/**
 * Sections by BM25 over their words, a heading's words counted three times,
 * plus a bonus where the whole query appears as written (a symbol in code,
 * a phrase in a heading). Sections that share no word with the query are
 * left out; ties keep document order.
 */
export const rank = (sections: ReadonlyArray<Section>, query: string): ReadonlyArray<Ranked> => {
  const terms = [...new Set(words(query))]
  if (terms.length === 0) return []
  const counted = sections.map(section => {
    const counts = new Map<string, number>()
    const add = (word: string, by: number) => counts.set(word, (counts.get(word) ?? 0) + by)
    const heading = section.headings[section.headings.length - 1] ?? ''
    words(heading).forEach(word => add(word, HEADING_WEIGHT))
    const body = words(section.body.join('\n'))
    body.forEach(word => add(word, 1))
    return { section, counts, length: body.length + HEADING_WEIGHT * words(heading).length }
  })
  const average = counted.reduce((sum, each) => sum + each.length, 0) / Math.max(counted.length, 1)
  const idf = new Map(
    terms.map(term => {
      const holding = counted.filter(each => each.counts.has(term)).length
      return [term, Math.log(1 + (counted.length - holding + 0.5) / (holding + 0.5))] as const
    }),
  )
  const phrase = query.trim().toLowerCase().replace(/\s+/g, ' ')
  const weight = terms.reduce((sum, term) => sum + idf.get(term)!, 0)
  const k = 1.2
  const b = 0.75
  return counted
    .map(({ section, counts, length }) => {
      const score = terms.reduce((sum, term) => {
        const tf = counts.get(term) ?? 0
        return sum + (idf.get(term)! * tf * (k + 1)) / (tf + k * (1 - b + (b * length) / average))
      }, 0)
      const heading = (section.headings[section.headings.length - 1] ?? '').toLowerCase()
      const bonus = heading.includes(phrase)
        ? 2 * weight
        : section.body.join('\n').toLowerCase().replace(/\s+/g, ' ').includes(phrase)
          ? weight
          : 0
      return { section, score: score === 0 ? 0 : score + bonus }
    })
    .filter(each => each.score > 0)
    .sort((x, y) => y.score - x.score)
}

// A name `isSymbol` passed holds no regex syntax but `$`.
const literal = (name: string) => name.replaceAll('$', '\\$')
const DECLARED = (name: string) =>
  new RegExp(
    `^(?:export )?declare (?:abstract )?(?:const|let|function|class|interface|type|namespace|enum) ${literal(name)}(?:\\$\\d+)?\\b`,
  )
const MEMBER = (name: string) =>
  new RegExp(`^  (?:readonly |static )*${literal(name)}\\??\\s*[<(:]`)
const NAME = /^  (?:readonly |static )*([A-Za-z_$][\w$]*)\??\s*[<(:]/

/** The doc comment that ends on the line above `at`, at `indent`. */
const commentAbove = (lines: ReadonlyArray<string>, at: number, indent: string) => {
  const above = lines[at - 1]?.trim() ?? ''
  if (above !== '*/' && !(above.startsWith('/**') && above.endsWith('*/'))) return []
  let start = at - 1
  while (start > 0 && !lines[start]!.trimStart().startsWith('/**')) start--
  return lines.slice(start, at).map(line => line.slice(indent.length))
}

/** Lines from `at` until its brackets close on a `;` or `,`, at most `limit`. */
const statement = (lines: ReadonlyArray<string>, at: number, limit = 25) => {
  const taken: Array<string> = []
  let depth = 0
  for (let index = at; index < lines.length && taken.length < limit; index++) {
    const line = lines[index]!
    taken.push(line)
    depth += (line.match(/[({[]/g) ?? []).length - (line.match(/[)}\]]/g) ?? []).length
    if (depth <= 0 && /[;,]\s*$/.test(line)) return taken
  }
  return [...taken, '  …']
}

/** The block a top-level declaration opens, as its first line and its members' names. */
const outline = (lines: ReadonlyArray<string>, at: number) => {
  const first = lines[at]!
  if (!/\{\s*$/.test(first)) return statement(lines, at)
  const members: Array<string> = []
  for (let index = at + 1; index < lines.length && !/^\}/.test(lines[index]!); index++) {
    const name = NAME.exec(lines[index]!)?.[1]
    if (name !== undefined && !members.includes(name)) members.push(name)
  }
  return [first, `  // members: ${members.join(', ')}`, '}']
}

/**
 * What `symbol` declares in one `.d.mts`. `Remote` gives its declaration, and
 * an object or interface as the names of its members, which is what answers
 * "does it have X?". `Remote.make` gives that member of `Remote`. When the
 * qualifier is declared nowhere (`Data`, a value an application makes), every
 * member called `preload` is a candidate: the caller ranks them by document.
 */
export const declarationsIn = (
  file: {
    readonly topic: string
    readonly origin: string
    readonly path: string
    readonly text: string
  },
  symbol: string,
): ReadonlyArray<Declaration> => {
  const lines = file.text.split(/\r?\n/)
  const parts = symbol.split('.')
  const last = parts[parts.length - 1]!
  const found = (line: number, indent: string, signature: ReadonlyArray<string>): Declaration => ({
    topic: file.topic,
    origin: file.origin,
    path: file.path,
    line: line + 1,
    comment: commentAbove(lines, line, indent),
    signature: signature.map(each => each.slice(indent.length)),
  })
  if (parts.length === 1) {
    const declared = DECLARED(last)
    return lines.flatMap((line, at) =>
      declared.test(line) ? [found(at, '', outline(lines, at))] : [],
    )
  }
  const owner = DECLARED(parts[parts.length - 2]!)
  const member = MEMBER(last)
  const owners = lines.flatMap((line, at) => (owner.test(line) ? [at] : []))
  const inside = owners.flatMap(start => {
    const hits: Array<Declaration> = []
    for (let at = start + 1; at < lines.length && !/^\}/.test(lines[at]!); at++) {
      if (member.test(lines[at]!)) hits.push(found(at, '  ', statement(lines, at)))
    }
    return hits
  })
  if (owners.length > 0) return inside
  return lines.flatMap((line, at) =>
    member.test(line) ? [found(at, '  ', statement(lines, at))] : [],
  )
}

/** How a section is cited: where it is, so a reader can open the rest. */
const citation = (section: Section) =>
  `${section.doc.label} › ${section.headings.join(' › ')} (${section.doc.path}:${section.line}, #${section.anchor})`

/** A section's text for a reader, its body cut at `lines` with where the rest is. */
const sectionText = (section: Section, lines: number) => {
  const shown = section.body.slice(0, lines)
  // An open fence would swallow the note below it.
  const fences = shown.filter(line => FENCE.test(line)).length
  return [
    `## ${section.headings[section.headings.length - 1]}`,
    '',
    `From ${citation(section)}`,
    '',
    ...shown,
    ...(fences % 2 === 1 ? ['```'] : []),
    ...(section.body.length > lines
      ? [
          '',
          `… ${section.body.length - lines} more lines at ${section.doc.path}:${section.line + lines + 1}`,
        ]
      : []),
  ].join('\n')
}

export interface Answer {
  readonly query: string
  readonly declarations: ReadonlyArray<Declaration>
  readonly sections: ReadonlyArray<Ranked>
  /** How many documents were searched, for an answer that found nothing. */
  readonly searched: number
}

export const RESULTS = 3
const BODY_LINES = 60

/**
 * The answer to `docs <query>`: the best sections, and a symbol's
 * declarations, those of the package whose section ranks highest first.
 */
export const answer = (
  docs: ReadonlyArray<Doc>,
  query: string,
  declarations: (symbol: string) => ReadonlyArray<Declaration>,
): Answer => {
  const ranked = rank(docs.flatMap(sectionsOf), query)
  const standing = (topic: string) => {
    const at = ranked.findIndex(each => each.section.doc.topic === topic)
    return at === -1 ? ranked.length : at
  }
  return {
    query,
    declarations: isSymbol(query)
      ? [...declarations(query)]
          .sort((x, y) => standing(x.topic) - standing(y.topic))
          .slice(0, RESULTS)
      : [],
    sections: ranked.slice(0, RESULTS),
    searched: docs.length,
  }
}

/** Whether the answer found anything: a query that did not is a failure to report. */
export const found = (result: Answer) =>
  result.sections.length > 0 || result.declarations.length > 0

/** The answer as Markdown, for an agent's context or a terminal. */
export const answerText = (result: Answer): string =>
  found(result)
    ? [
        `# ${result.query}`,
        ...(result.declarations.length === 0
          ? []
          : [
              '',
              '## Declarations',
              ...result.declarations.flatMap(each => [
                '',
                `From ${each.origin} (${each.path}:${each.line})`,
                '',
                '```ts',
                ...each.comment,
                ...each.signature,
                '```',
              ]),
            ]),
        ...result.sections.flatMap(each => ['', sectionText(each.section, BODY_LINES)]),
        '',
      ].join('\n')
    : `Nothing in the ${result.searched} installed documents matches "${result.query}". Try other words, or \`npx foldkit-plus docs --list\` for what is installed.\n`

/** The answer as JSON, for a program. */
export const answerJson = (result: Answer) =>
  `${JSON.stringify(
    {
      query: result.query,
      declarations: result.declarations,
      sections: result.sections.map(({ section, score }) => ({
        source: section.doc.label,
        path: section.doc.path,
        line: section.line,
        anchor: section.anchor,
        headings: section.headings,
        score: Math.round(score * 100) / 100,
        text: section.body.join('\n'),
      })),
    },
    null,
    2,
  )}\n`

/**
 * `--list`: with no topic, every installed document; with one, the headings
 * of each document on it as an outline. A topic nothing installed covers is
 * `none`, for the caller to report with the topics there are.
 */
export const outlineText = (docs: ReadonlyArray<Doc>, topic: Option.Option<string>) =>
  Option.match(topic, {
    onNone: () =>
      Option.some(
        [
          '# Installed documents',
          '',
          ...docs.map(doc => `- \`${doc.topic}\`: ${doc.label} (${doc.path})`),
          '',
          'Outline one with `npx foldkit-plus docs --list <topic>`.',
          '',
        ].join('\n'),
      ),
    onSome: wanted => {
      const matching = docs.filter(doc => doc.topic === wanted)
      return matching.length === 0
        ? Option.none()
        : Option.some(
            matching
              .flatMap(doc => [
                `# ${doc.label}`,
                '',
                doc.path,
                '',
                ...sectionsOf(doc).map(
                  section =>
                    `${'  '.repeat(section.depth - 1)}- ${section.headings[section.headings.length - 1]} (line ${section.line})`,
                ),
                '',
              ])
              .join('\n'),
          )
    },
  })

/** The topics there are, for a `--list` of one that is not. */
export const topicsOf = (docs: ReadonlyArray<Doc>) => [...new Set(docs.map(doc => doc.topic))]
