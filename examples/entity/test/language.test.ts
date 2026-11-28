// @vitest-environment node
/**
 * The language trace, and the claim under it: over generated rows and inputs,
 * SQLite, `evaluate` and `Judge` give one answer to one body, and a `Judge`
 * that holds only part of the rows is never wrong about what it says it knows.
 */
import { Option, Result } from 'effect'
import { Verdict } from '@doeixd/metakit'
import { Judge, type EntityRef } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { openDatabase, runLanguage } from '../src/language.js'
import {
  evaluated,
  held,
  judged,
  judgedIn,
  questions,
  type Question,
  type World,
} from '../src/questions.js'

describe('the language trace', () => {
  it('asks five bodies of SQLite, evaluate and Judge, and prints what each said', async () => {
    const lines = await runLanguage()
    const block = (name: string) => {
      const start = lines.findIndex(line => line.startsWith(`${name}:`))
      return lines.slice(start, start + 11).filter(line => !line.startsWith('  SQLite ran:'))
    }
    expect(block('NotEditedBy')).toEqual([
      'NotEditedBy: posts not edited by an author',
      '  FROM Post',
      '  WHERE not (Post.editor = $editor)',
      '  ORDER BY Post.title ASC',
      '  given {"editor":"a2"}, asked by a visitor',
      "  reads its own row's editor, title",
      '  SQLite: p3',
      '  evaluate, every post: p3',
      '  Judge, every row held: p3',
      '  Judge, a page holding Ada and one comment: p1 out, p2 out, p3 in, p4 out',
    ])
    expect(block('ByAuthorName')).toEqual([
      "ByAuthorName: posts by an author's name",
      '  FROM Post',
      '  WHERE contains(Post.author.name, $name)',
      '  ORDER BY Post.title ASC',
      '  given {"name":"ada"}, asked by a visitor',
      "  reads its own row's title, and other rows through Post.author.name",
      '  SQLite: p2, p1',
      '  evaluate, every post: refused, it does not run path',
      '  Judge, every row held: p2, p1',
      '  Judge, a page holding Ada and one comment: p1 in, p2 in, p3 unknown (Author a2 is not held), p4 unknown (Author a3 is not held)',
    ])
    expect(lines.filter(line => line.startsWith('  SQLite') && !line.includes('ran:'))).toEqual([
      '  SQLite: p2, p3',
      '  SQLite: p3',
      '  SQLite: p4, p1, p3',
      '  SQLite: p2, p1',
      '  SQLite: p1, p3',
    ])
    expect(lines.filter(line => line.startsWith('  SQLite ran:'))).toEqual([
      // Operations are written by metakit's SQL lowering (step 8 of the unification plan): a
      // search is `instr` over the text lowered, its value lowered where it is bound.
      '  SQLite ran: select "id", "headline" from "posts" where instr(lower("posts"."headline"), ?) > 0 order by "posts"."headline" collate binary asc, "posts"."id" collate binary asc limit ? ["comp",101]',
      '  SQLite ran: select "id", "headline" from "posts" where (NOT ("posts"."editor_id" COLLATE BINARY = ?)) order by "posts"."headline" collate binary asc, "posts"."id" collate binary asc limit ? ["a2",101]',
      '  SQLite ran: select "id", "headline" from "posts" where (("posts"."editor_id" IS NULL) OR (NOT ("posts"."editor_id" COLLATE BINARY = ?))) order by "posts"."headline" collate binary asc, "posts"."id" collate binary asc limit ? ["a2",101]',
      '  SQLite ran: select "id", "headline" from "posts" where instr(lower((select "authors"."name" from "authors" where "authors"."id" = "posts"."author_id")), ?) > 0 order by "posts"."headline" collate binary asc, "posts"."id" collate binary asc limit ? ["ada",101]',
      '  SQLite ran: select "id", "headline" from "posts" where EXISTS (SELECT 1 FROM "comments" WHERE "comments"."post_id" = "posts"."id" AND (("comments"."author_id" COLLATE BINARY = ?)) IS TRUE) order by "posts"."headline" collate binary asc, "posts"."id" collate binary asc limit ? ["a1",101]',
    ])
  })
})

/** A small seeded generator (mulberry32), so a failure names a seed that reproduces it. */
const random = (seed: number) => {
  let state = seed
  const next = () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const below = (n: number) => Math.floor(next() * n)
  return {
    below,
    chance: (p: number) => next() < p,
    pick: <A>(from: readonly [A, ...Array<A>]): A => from[below(from.length)] ?? from[0],
  }
}

// Values chosen so interpreters can disagree: case, an accent, like's wildcards, the empty string.
const names = [
  'Ada',
  'ADA Lovelace',
  'grace',
  'Grace Hopper',
  'Édith',
  'édith',
  '100% Bob',
  'a_b',
] as const
const titles = [
  'Compilers',
  'compost',
  'COMP',
  'comp_1',
  '100% comp',
  'Éclair',
  'éclair',
  '',
  'Looms',
] as const
const searches = ['', 'comp', 'COMP', '%', '_', 'é', 'É', 'ada', 'GRACE', 'zzz'] as const

const worldOf = (seed: number): World => {
  const { below, chance, pick } = random(seed)
  const authors = Array.from({ length: 1 + below(4) }, (_, i) => ({
    id: `a${i + 1}`,
    name: pick(names),
  }))
  const author = () => `a${1 + below(authors.length)}`
  const posts = Array.from({ length: below(8) }, (_, i) => ({
    id: `p${i + 1}`,
    title: pick(titles),
    published: chance(0.5),
    author: author(),
    editor: chance(0.4) ? null : author(),
  }))
  const comments =
    posts.length === 0
      ? []
      : Array.from({ length: below(10) }, (_, i) => ({
          id: `c${i + 1}`,
          body: 'x',
          post: `p${1 + below(posts.length)}`,
          author: author(),
        }))
  return { authors, posts, comments }
}

/** Each question of the trace, given other values and another viewer. */
const asked = (seed: number, rows: World): ReadonlyArray<Question> => {
  const { below, chance, pick } = random(seed * 7919)
  // Sometimes an author nobody is, and sometimes a visitor.
  const someone = `a${1 + below(rows.authors.length + 1)}`
  const viewer: Option.Option<EntityRef> = chance(0.2)
    ? Option.none()
    : Option.some({ entity: 'Author', id: someone })
  return questions.map(question => ({
    ...question,
    input: { search: pick(searches), name: pick(searches), editor: someone },
    viewer,
  }))
}

const seeds = Array.from({ length: 120 }, (_, i) => i + 1)

describe('one body, three interpreters', () => {
  it('SQLite, evaluate and Judge answer every generated question alike, and not vacuously', async () => {
    const disagreed: string[] = []
    // A body is exercised by a run that keeps some rows and leaves some out.
    const told = new Map(questions.map(question => [question.name, 0]))
    let evaluateRan = 0
    let nullKept = 0
    for (const seed of seeds) {
      const rows = worldOf(seed)
      const database = openDatabase(rows)
      try {
        const everything = held(rows)
        const answers = new Map<string, ReadonlyArray<string>>()
        for (const question of asked(seed, rows)) {
          const sql = (await database.ask(question)).ids
          answers.set(question.name, sql)
          if (sql.length > 0 && sql.length < rows.posts.length)
            told.set(question.name, (told.get(question.name) ?? 0) + 1)
          const judge = judgedIn(question, rows, everything)
          if (JSON.stringify(judge) !== JSON.stringify(sql))
            disagreed.push(`seed ${seed} ${question.name}: SQLite ${sql}, Judge ${judge}`)
          Result.match(evaluated(question, rows), {
            onFailure: () => undefined,
            onSuccess: ids => {
              evaluateRan += 1
              if (JSON.stringify(ids) !== JSON.stringify(sql))
                disagreed.push(`seed ${seed} ${question.name}: SQLite ${sql}, evaluate ${ids}`)
            },
          })
        }
        // The two bodies differ only in what they say of a post with no editor.
        if (
          (answers.get('NotEditedByOrUnedited')?.length ?? 0) >
          (answers.get('NotEditedBy')?.length ?? 0)
        )
          nullKept += 1
      } finally {
        database.close()
      }
    }
    expect(disagreed).toEqual([])
    for (const [name, count] of told) expect([name, count > 5]).toEqual([name, true])
    expect(evaluateRan).toBe(seeds.length * 3)
    expect(nullKept).toBeGreaterThan(20)
  })

  it('a Judge holding part of the rows is right wherever it says it knows, and says unknown elsewhere', async () => {
    const wrong: string[] = []
    let known = 0
    let unknown = 0
    for (const seed of seeds) {
      const rows = worldOf(seed)
      const { chance } = random(seed * 104729)
      const partial = held(rows, {
        authors: rows.authors.filter(() => chance(0.5)),
        comments: rows.comments.filter(() => chance(0.5)),
      })
      const database = openDatabase(rows)
      try {
        for (const question of asked(seed, rows)) {
          const sql = new Set((await database.ask(question)).ids)
          for (const { id, verdict } of judged(question, rows, partial)) {
            if (Verdict.isUnknown(verdict)) unknown += 1
            else {
              known += 1
              const truth = Verdict.isTrue(verdict)
              if (truth !== sql.has(id))
                wrong.push(
                  `seed ${seed} ${question.name} ${id}: Judge ${truth}, SQLite ${sql.has(id)}`,
                )
            }
          }
        }
      } finally {
        database.close()
      }
    }
    expect(wrong).toEqual([])
    expect(known).toBeGreaterThan(1000)
    expect(unknown).toBeGreaterThan(100)
  })
})
