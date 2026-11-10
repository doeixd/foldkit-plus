/**
 * The file rules, broken in turn:
 * `pnpm mutate packages/media/test/fileRules.mutations.ts`.
 */
const rules = '../src/server/fileRules.ts'
const tests = ['packages/media/test/fileRules.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: rules, find, replace }],
  tests,
})

const key = (name: string, replace: string) => ({
  name,
  edits: [{ file: '../src/file.ts', find: '/^[0-9a-f]{32}$/', replace }],
  tests,
})

export default [
  edit('half a surrogate pair is a name', '\\p{Zp}\\p{Cs}', '\\p{Zp}'),
  edit('an empty accept list is taken', 'if (accept.length === 0) throw', 'if (false) throw'),
  {
    // Each defence stands in for the others, so only all three removed lets a page run.
    name: 'a download opens as a page that runs',
    edits: [
      {
        file: rules,
        find: "'content-type': 'application/octet-stream'",
        replace: "'content-type': 'text/html'",
      },
      { file: rules, find: '`attachment; filename=', replace: '`inline; filename=' },
      {
        file: rules,
        find: "  'content-security-policy': \"sandbox; default-src 'none'\",\n",
        replace: '',
      },
    ],
    tests: ['packages/media/test/files.browser.test.ts'],
  },
  key('a key may be uppercase', '/^[0-9a-fA-F]{32}$/'),
  key('a key may be any length', '/^[0-9a-f]{31,33}$/'),
  key('a key may hold more than hex', '/[0-9a-f]{32}/'),
  edit(
    'a malformed encoding is a name',
    'return Option.none()\n  }\n  return isFileName',
    'name = header\n  }\n  return isFileName',
  ),
  edit('an unencoded name is taken', ' || !/^[\\x20-\\x7e]*$/.test(header)', ''),
  edit('an empty name is taken', 'name.length > 0 &&', ''),
  edit('a name is counted in UTF-16 units', 'new TextEncoder().encode(name).length', 'name.length'),
  edit('a name of 255 bytes is refused', '<= MAX_NAME_BYTES', '< MAX_NAME_BYTES'),
  edit('a control character is taken', '\\p{Cc}', ''),
  edit('a format character is taken', '\\p{Cf}', ''),
  edit('a line separator is taken', '\\p{Zl}', ''),
  edit('a paragraph separator is taken', '\\p{Zp}', ''),
  edit('a slash is taken', '\\p{Cs}/\\\\]', '\\p{Cs}\\\\]'),
  edit('a backslash is taken', '\\p{Cs}/\\\\]', '\\p{Cs}/]'),
  edit(
    "a type's parameters are read as the type",
    "header.split(';', 1)[0]!.trim()",
    'header.trim()',
  ),
  edit('a type keeps its case', 'Option.some(essence.toLowerCase())', 'Option.some(essence)'),
  edit(
    'a type is matched anywhere',
    'new RegExp(`^${TOKEN}/${TOKEN}$`)',
    'new RegExp(`${TOKEN}/${TOKEN}`)',
  ),
  edit('a pattern keeps its case', 'return pattern.toLowerCase()', 'return pattern'),
  edit('a malformed pattern is taken', '!PATTERN.test(pattern) ||', ''),
  edit('*/* is taken as a pattern', " || pattern.startsWith('*/')", ''),
  edit(
    'a pattern is matched by prefix',
    'type.startsWith(pattern.slice(0, -1))',
    'type.startsWith(pattern.slice(0, -2))',
  ),
  edit('an exact pattern takes a prefix', ': type === pattern', ': type.startsWith(pattern)'),
  edit("'()* are left as they are", "/['()*]/g", '/[*]/g'),
  edit('the fallback keeps every ASCII character', '/[^A-Za-z0-9 ._-]/gu', '/[^\\x20-\\x7e]/gu'),
  edit('the fallback replaces each half of a pair', '/[^A-Za-z0-9 ._-]/gu', '/[^A-Za-z0-9 ._-]/g'),
  edit('a download may be sniffed', "  'x-content-type-options': 'nosniff',\n", ''),
  edit(
    'a download may run on the origin',
    "  'content-security-policy': \"sandbox; default-src 'none'\",\n",
    '',
  ),
  edit(
    'another site may load a download',
    "'cross-origin-resource-policy': 'same-origin'",
    "'cross-origin-resource-policy': 'cross-origin'",
  ),
  edit(
    'a download may be kept',
    "'cache-control': 'private, no-store'",
    "'cache-control': 'private'",
  ),
  edit(
    'a download is served as its type',
    "'content-type': 'application/octet-stream'",
    "'content-type': 'text/html'",
  ),
  edit('a file opens inline', '`attachment; filename=', '`inline; filename='),
]
