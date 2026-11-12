/**
 * `SSR.entry`'s page cache, each guard broken in turn:
 * `pnpm mutate packages/ssr/test/pageCache.mutations.ts`
 */
const tests = ['packages/ssr/test/pageCache.test.ts']
const entry = '../src/index.ts'
const page = '../src/pageCache.ts'
const context = '../src/requestContext.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  // What a page that is not kept says.
  edit(
    'an unkept page says nothing',
    entry,
    "const headers = new Headers(result.headers)\n    headers.set('cache-control', 'private, no-store')",
    'const headers = new Headers(result.headers)',
  ),
  edit(
    "the application's cache-control is overwritten",
    entry,
    "if (result._tag !== 'Rendered' || Option.isSome(headerOf(result.headers, 'cache-control')))\n      return result",
    "if (result._tag !== 'Rendered') return result",
  ),
  // What keeps a page from being kept.
  edit(
    'a post is kept',
    entry,
    "if (method !== 'GET' && method !== 'HEAD') return unkept(await answer(request))",
    '',
  ),
  edit('a page not found is kept', entry, 'if (status !== 200) return', 'if (false) return'),
  edit('a render that read every header is kept', entry, 'if (watched.read.all) {', 'if (false) {'),
  edit(
    'a header the render read and found is ignored',
    entry,
    'if (![...watched.read.names].every(name => !request.headers.has(name))) return Option.none()',
    '',
  ),
  edit(
    'a page setting a cookie is kept',
    entry,
    "Option.isSome(headerOf(result.headers, 'set-cookie')) ||",
    '',
  ),
  edit(
    'a page with its own cache-control is kept',
    entry,
    "||\n      Option.isSome(headerOf(result.headers, 'cache-control'))\n    )",
    ')',
  ),
  edit('a private read is ignored', entry, "if (read._tag === 'Private') {", 'if (false) {'),
  edit(
    'a page drawn from more than its URL is kept',
    entry,
    "if (result._tag !== 'Rendered' || Option.isSome(notPublic(result.status ?? 200, watched)))",
    "if (result._tag !== 'Rendered')",
  ),
  edit(
    "the render's reads are not noted",
    entry,
    'Option.some(read => watched.reads.push(read))',
    'Option.none()',
  ),
  // What a kept page holds and says.
  edit(
    'a read does not shorten the page',
    entry,
    'shortest = shorterPolicy(shortest, read.policy)',
    '',
  ),
  edit('a page holds no tag of its reads', entry, 'for (const tag of read.tags) tags.add(tag)', ''),
  edit(
    'a page says no vary',
    entry,
    "if (vary.length > 0) headers.set('vary', vary.join(', '))",
    '',
  ),
  edit(
    'a page serves a request carrying what it read',
    page,
    'vary.every(name => !request.headers.has(name))',
    'true',
  ),
  edit('a build reads another build’s pages', page, '`${buildId}\\n${url}`', '`${url}`'),
  // How the render's reads of its request are seen.
  edit('a header read by name is not seen', page, 'read.names.add(name.toLowerCase())', ''),
  edit(
    'headers read whole are not seen',
    page,
    '      read.all = true\n      return value.bind(target)',
    '      return value.bind(target)',
  ),
  edit('a clone is not seen', page, "if (property === 'clone') read.all = true", ''),
  edit('a request context read is not seen', context, 'watched?.readContext()', ''),
  edit(
    'a request context is lost to the watched request',
    context,
    'watched?.original ?? given',
    'given',
  ),
  // Documents drawn for kept pages.
  edit('a served page is not known as kept', entry, 'keptApplications.add(page.application)', ''),
  edit(
    'every page is remembered',
    page,
    'if (!keptApplications.has(application)) return render(application, assets)',
    '',
  ),
  edit('a kept page is drawn every time', page, 'if (held !== undefined) return held', ''),
  edit('documents are never forgotten', page, 'if (drawn.size <= KEPT_DOCUMENTS) break', 'break'),
  // The checker.
  edit(
    'a kept page is never drawn again',
    entry,
    'if (check !== true) return served(kept.value)',
    'return served(kept.value)',
  ),
  edit(
    'a difference passes the check',
    entry,
    "again._tag === 'Rendered' && samePage(again, kept.value, Date.now())",
    'true',
  ),
  edit('a time stamped on the page is compared', page, "? 'T' : digits", '? digits : digits'),
  edit(
    'every long number is taken for a time',
    page,
    'Math.abs(Number(digits) - now) < DAY_MS',
    'true',
  ),
  edit('the checker takes checking nothing', entry, 'if (store.size() === 0) {', 'if (false) {'),
]
