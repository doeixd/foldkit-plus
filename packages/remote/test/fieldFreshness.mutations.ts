/**
 * A row's freshness by its oldest field, broken in turn:
 * `pnpm mutate packages/remote/test/fieldFreshness.mutations.ts`.
 */
const store = '../src/store.ts'
const plan = '../src/plan.ts'
const persistence = '../src/persistence.ts'
const resume = '../src/resume.ts'
const tests = ['packages/remote/test/fieldFreshness.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a partial write dates the row anew',
    store,
    'oldestAt: whole ? now : Math.min(previous.oldestAt, now)',
    'oldestAt: now',
  ),
  edit(
    'a whole write keeps the old date',
    store,
    'oldestAt: whole ? now : Math.min(previous.oldestAt, now)',
    'oldestAt: Math.min(previous.oldestAt, now)',
  ),
  edit(
    'plan ages a row by its newest write',
    plan,
    'freshness.now - entry.oldestAt > freshness.freshness',
    'freshness.now - entry.updatedAt > freshness.freshness',
  ),
  edit(
    'deadlineOf waits for the newest write',
    plan,
    'const expires = entry.oldestAt + freshness.freshness',
    'const expires = entry.updatedAt + freshness.freshness',
  ),
  edit(
    'persistence keeps a row by its newest write',
    persistence,
    'rows.set(key, entry.oldestAt + maxAge)',
    'rows.set(key, entry.updatedAt + maxAge)',
  ),
  edit(
    'persistence keeps a read row by its newest write',
    persistence,
    'const fetched = model.entities[key]!.oldestAt + age',
    'const fetched = model.entities[key]!.updatedAt + age',
  ),
  edit(
    'an older capture reads as never fresh',
    resume,
    'oldestAt: entry.oldestAt ?? entry.updatedAt,',
    'oldestAt: entry.oldestAt ?? 0,',
  ),
]
