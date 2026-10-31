/**
 * The API extractor, broken in turn: `pnpm mutate
 * examples/site/test/api.mutations.ts` checks that a test fails for every one.
 */
const tests = ['examples/site/test/api.test.ts']
const file = '../src/api/extract.ts'
const one = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  one(
    'a private package is read',
    "manifest['private'] === true) return",
    "manifest['private'] === 'never') return",
  ),
  one('a stylesheet entry is read', "!file.endsWith('.ts') ||", 'false ||'),
  one(
    'a declaration file is read as an entry',
    "|| file.endsWith('.d.ts')) return []",
    ') return []',
  ),
  one('a link keeps no backticks', "return label === '' ? `\\`${name}\\`` : label", 'return name'),
  one('@returns lands in tags', '} else if (!ts.isJSDocReturnTag(tag)) {', '} else {'),
  one("an entry's first declaration's doc reads as the file's", "if (ownsIt) return ''", ''),
  one('comments stay in signatures', 'removeComments: true', 'removeComments: false'),
  one(
    'a defaulted parameter reads as required',
    ': ts.factory.createToken(ts.SyntaxKind.QuestionToken),',
    ': node.questionToken,',
  ),
  one(
    'a private class member is listed',
    '|| ts.isPrivateIdentifier(name) || isHidden(member)) return []',
    '|| ts.isPrivateIdentifier(name)) return []',
  ),
  one(
    'a spread is skipped',
    'if (ts.isSpreadAssignment(property)) {',
    'if (ts.isSpreadAssignment(property)) {\n        continue',
  ),
  one(
    'a spread of a name shared with a type reads the type',
    'resolve(symbol).valueDeclaration,',
    'resolve(symbol).declarations?.[0],',
  ),
  one("a member's own doc is ignored", '...Option.getOrElse(own, () => doc),', '...doc,'),
  one(
    'the named declaration is not consulted',
    '...Option.getOrElse(own, () => doc),',
    '...Option.getOrElse(own, () => noDoc),',
  ),
  one('nesting goes a level deeper', 'depth < 2 ?', 'depth < 3 ?'),
  one(
    'a member naming a value shared with a type reads the type',
    'const first = target?.valueDeclaration ?? declarations[0]',
    'const first = declarations[0]',
  ),
  one(
    "a property of another object reads that object's declaration",
    'const described =\n      first !== undefined &&',
    'const described =\n      true ||',
  ),
  one(
    'a type sharing a value name is dropped',
    'value !== undefined && types.length > 0',
    'value !== undefined && false',
  ),
  one(
    "a value without a doc does not fall back to its type's",
    'const doc = firstDoc([primary, ...types])',
    'const doc = firstDoc([primary])',
  ),
  one(
    'names differing in case share a slug',
    'slug: count === 1 ? base : `${base}-${count}`',
    'slug: base',
  ),
  one('a param summary keeps its dash', "summary: text.replace(/^-\\s*/, '')", 'summary: text'),
  one('a Message variant lists its tag', "fieldsOf(variant, at, '_tag')", 'fieldsOf(variant, at)'),
  one(
    'an optional arg reads as required',
    '(property.flags & ts.SymbolFlags.Optional) !== 0',
    'false',
  ),
  one('a Bundle that hands nothing lists never', ' || out.flags & ts.TypeFlags.Never', ''),
  one(
    'any value with an update reads as a Bundle',
    "['name', 'Model', 'Message', 'init'].some(",
    '[].some(',
  ),
  one(
    'a namespace exported under an interface name loses the interface',
    '...declarations, ...(exported.declarations ?? [])',
    '...declarations',
  ),
]
