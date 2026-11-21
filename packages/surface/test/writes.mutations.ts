/**
 * `Writes` and `WritesCheck`: `pnpm mutate packages/surface/test/writes.mutations.ts`.
 */
const tests = ['packages/surface/test/writes.test.ts', 'packages/surface/test/writesCheck.test.ts']

const edit = (name: string, find: string, replace: string, file = '../src/writes.ts') => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

const check = (name: string, find: string, replace: string) =>
  edit(name, find, replace, '../src/writesCheck.ts')

export default [
  // The matcher under-reports: a view is kept although a declared write reaches it.
  edit(
    'no declared Message draws a view again',
    '      const redrawnBy = affectedTags(',
    '      const redrawnBy: Array<Tag> = []; void affectedTags(',
  ),
  edit(
    'a projection that names no path is given as reading none',
    '  unnamed(projection) ? Option.none() : Option.some(projection.dependencies)',
    '  Option.some(projection.dependencies)',
    '../src/index.ts',
  ),
  edit(
    'a Message with no transition draws nothing again',
    'if (Option.isNone(regions)) all++',
    'if (Option.isNone(regions)) all += 0',
  ),
  edit('track trusts a Model it did not see made', '      if (!isCurrent(model)) all++\n', ''),
  edit(
    'a view trusts a Model it did not see made',
    'if (!isCurrent(root)) {\n          all++',
    'if (!isCurrent(root)) {\n          all += 0',
  ),
  // These draw more than is needed, or break the keeping.
  edit(
    'a view does not take the Model it drew as the current one',
    '          current = Option.some(root)\n',
    '',
  ),
  edit('track forgets the Model it made', '      current = Option.some(result.model)\n', ''),
  edit(
    'a declared Message draws every view again',
    'else for (const region of regions.value) region.own++',
    'else all++',
  ),
  edit(
    'a Message that changes nothing counts as a write',
    'if (result.model !== model) {',
    'if (true) {',
  ),
  edit(
    'the view the writes make keeps no drawing',
    '          return lazy(counted, [all, region.own, h])',
    '          return drawn(root, h)',
  ),
  edit(
    'a projection carrying metadata is kept by the paths it names',
    '!hasContractsOrWriters && Metadata.summarize(projection.metadata).length > 0',
    'false',
  ),
  edit(
    'store contracts passed to Writes.of are ignored',
    '  for (const contract of options?.contracts ?? []) {\n    for (const tag of contract.messages) addWrites(tag, contract.owns)\n  }',
    '  for (const _contract of []) {}',
  ),
  edit(
    'Surface.rootView ignores installed Writes hook',
    '    if (hook !== undefined) {',
    '    if (false) {',
    '../src/index.ts',
  ),
  edit(
    'a projection nested under a key keeps paths from the nested value',
    'dependencies.push(...nested.dependencies.map(path => [key, ...path]))',
    'dependencies.push(...nested.dependencies)',
    '../src/index.ts',
  ),
  edit(
    'a server render keeps drawings',
    '        if ((globalThis as Record<symbol, unknown>)[SERVER_RENDER] === true) return drawn(root, h)\n',
    '',
  ),
  edit(
    'a drawing that throws in a frame is drawn again',
    '          if (started !== before) throw error\n',
    '',
  ),
  edit(
    'no drawing where there is no runtime frame',
    '          return drawn(root, h)\n        }\n      }',
    '          throw error\n        }\n      }',
  ),
  edit(
    'a transition no Message names is taken',
    'if (!Object.hasOwn(messages, tag) || messageTag(messages[tag]) !== tag) {',
    'if (false) {',
  ),
  edit(
    'every declared Message is said to write nothing',
    'Object.hasOwn(footprints, tag) ? Option.some(footprints[tag]!.writes) : Option.none()',
    'Object.hasOwn(footprints, tag) ? Option.some([]) : Option.none()',
  ),

  check(
    'an undeclared write is not reported',
    'if (paths.length > 0) report(',
    'if (false) report(',
  ),
  check(
    'a declared write is reported as undeclared',
    ' || declared.some(write => isPrefix(write, path))',
    '',
  ),
  check(
    'a write declared below a change covers it',
    'declared.some(write => isPrefix(write, path))',
    'declared.some(write => isPrefix(path, write))',
  ),
  check('a struct is compared whole, not by its fields', '  if (walk) {', '  if (false) {'),
  check(
    'a value rebuilt equal is a change',
    '} else if (!Equal.equals(before, after)) {',
    '} else {',
  ),
  check(
    'an array that grew is walked by index',
    '? Array.isArray(after) && before.length === after.length',
    '? Array.isArray(after)',
  ),
  check(
    'the closed Surfaces are not checked',
    'of outside(model, message, result.model)) {',
    'of []) {',
  ),
  edit(
    "a closed Surface's own Message is reported as outside it",
    '      hasTagIn(surface.tags, message) ? [] : moved(surface, before, after),',
    '      moved(surface, before, after),',
    '../src/closure.ts',
  ),
  check(
    'a finding is logged, not thrown, by default',
    'options.report ?? fail',
    'options.report ?? warn',
  ),
  check(
    'a finding does not say which Message',
    'report(outsideWrite(tag, surface))',
    "report(outsideWrite('', surface))",
  ),
]
