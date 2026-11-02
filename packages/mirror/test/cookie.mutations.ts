/**
 * The cookie store's reads, writes and refusals:
 * `pnpm mutate packages/mirror/test/cookie.mutations.ts`.
 */
const unit = ['packages/mirror/test/cookie.test.ts']
const browser = ['packages/mirror/test/cookie.browser.test.ts']
const edit = (find: string, replace: string) => [{ file: '../src/index.ts', find, replace }]
const refusal = (name: string, find: string) => ({
  name: `${name} is not refused`,
  edits: edit(find, 'if (false)'),
  tests: unit,
})

export default [
  {
    name: 'a cookie past maxBytes is read',
    edits: edit(
      'return spec.name.length + 1 + value.length > spec.maxBytes ? {} : readParams(value, spec.owned)',
      'return readParams(value, spec.owned)',
    ),
    tests: unit,
  },
  {
    name: 'a cookie at maxBytes is refused',
    edits: edit(
      'spec.name.length + 1 + value.length > spec.maxBytes',
      'spec.name.length + 1 + value.length >= spec.maxBytes',
    ),
    tests: unit,
  },
  {
    name: 'a cookie whose name only holds the mirror name is read',
    edits: edit(
      'if (at < 0 || part.slice(0, at).trim() !== spec.name) continue',
      'if (at < 0 || !part.slice(0, at).includes(spec.name)) continue',
    ),
    tests: unit,
  },
  {
    name: 'a slice past maxBytes is written',
    edits: edit('if (pair.length > spec.maxBytes) return Result.fail(pair.length)', ''),
    tests: [...unit, ...browser],
  },
  {
    name: 'the keys are written unencoded',
    edits: edit(
      'new URLSearchParams(Object.entries(keys)).toString()',
      "Object.entries(keys).map(([key, value]) => `${key}=${value}`).join('&')",
    ),
    tests: [...unit, ...browser],
  },
  {
    name: 'an empty slice keeps the cookie',
    edits: edit("`Max-Age=${value === '' ? 0 : spec.maxAge}`", '`Max-Age=${spec.maxAge}`'),
    tests: [...unit, ...browser],
  },
  {
    name: 'auto is never Secure',
    edits: edit(
      "spec.secure === 'auto' ? https : spec.secure",
      "spec.secure === 'auto' ? false : spec.secure",
    ),
    tests: unit,
  },
  {
    name: 'an explicit secure is ignored',
    edits: edit("spec.secure === 'auto' ? https : spec.secure", 'https'),
    tests: unit,
  },
  {
    name: 'setCookie reads every request as http',
    edits: edit("request.url.startsWith('https:')", 'false'),
    tests: unit,
  },
  {
    name: 'a browser write past maxBytes is not reported',
    edits: edit(
      'onFailure: bytes => Diagnostics.report(cookieTooLarge(spec.name, bytes, spec.maxBytes))',
      'onFailure: () => Effect.void',
    ),
    tests: browser,
  },
  {
    name: 'a browser write is always Secure',
    edits: edit("(globalThis as { location?: Location }).location?.protocol === 'https:'", 'true'),
    tests: browser,
    survives:
      'Chromium treats http://localhost as a secure context and keeps a Secure cookie written there, so the test page cannot tell; the server path is checked by "setCookie reads every request as http".',
  },
  refusal('a name that is not a token', 'if (!COOKIE_NAME.test(name))'),
  refusal('a path holding ;', "if (!path.startsWith('/') || !ATTRIBUTE_VALUE.test(path))"),
  refusal(
    'a domain holding a space',
    'if (Option.exists(domain, domain => !/^[0-9A-Za-z.-]+$/.test(domain)))',
  ),
  refusal('SameSite=None without Secure', "if (sameSite === 'None' && secure !== true)"),
  refusal('a Max-Age under a second', 'if (!(maxAge > 0))'),
  refusal('a Max-Age with no finite end', 'if (!Number.isFinite(maxAge))'),
  refusal('no maxBytes', 'if (!(maxBytes > 0))'),
]
