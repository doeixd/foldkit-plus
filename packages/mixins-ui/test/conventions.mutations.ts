/**
 * The shared merge, words and choices:
 * `pnpm mutate packages/mixins-ui/test/conventions.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/conventions.test.ts']

export default [
  {
    name: 'an option given as undefined is not given',
    edits: [
      {
        file: '../src/configure.ts',
        find: 'if (value !== undefined) out[key] = value',
        replace: 'out[key] = value',
      },
    ],
    tests,
  },
  {
    name: 'the preset named by the call is looked up among its own names',
    edits: [
      {
        file: '../src/configure.ts',
        find: "typeof preset === 'string' && Object.hasOwn(presets, preset)",
        replace: "typeof preset === 'string' && preset in presets",
      },
    ],
    tests,
  },
  {
    name: 'an undeclared preset is refused',
    edits: [
      {
        file: '../src/configure.ts',
        find: 'if (preset !== undefined && !(',
        replace: 'if (false && !(',
      },
    ],
    tests,
  },
  {
    name: 'the call comes after the preset',
    edits: [
      {
        file: '../src/configure.ts',
        find: '    given(preset === undefined ? undefined : (presets[preset as string] as Layer)),\n    call,',
        replace:
          '    call,\n    given(preset === undefined ? undefined : (presets[preset as string] as Layer)),',
      },
    ],
    tests,
  },
  {
    name: 'the preset comes after the base',
    edits: [
      {
        file: '../src/configure.ts',
        find: '    given(config.base as Layer | undefined),\n    given(preset === undefined ? undefined : (presets[preset as string] as Layer)),',
        replace:
          '    given(preset === undefined ? undefined : (presets[preset as string] as Layer)),\n    given(config.base as Layer | undefined),',
      },
    ],
    tests,
  },
  {
    name: 'words merge key by key',
    edits: [
      {
        file: '../src/configure.ts',
        find: '...(Object.keys(words).length === 0 ? {} : { words }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'mixins concatenate',
    edits: [
      {
        file: '../src/configure.ts',
        find: '...(mixins.length === 0 ? {} : { mixins }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'no empty mixins list is added',
    edits: [
      {
        file: '../src/configure.ts',
        find: '...(mixins.length === 0 ? {} : { mixins }),',
        replace: 'mixins,',
      },
    ],
    tests,
  },
  {
    name: 'preset is taken off',
    edits: [
      {
        file: '../src/configure.ts',
        find: 'const { preset, ...call } = given(options as Layer)',
        replace: 'const call = given(options as Layer); const preset = call.preset',
      },
    ],
    tests,
  },
  {
    name: 'fill reads a value the values own',
    edits: [
      {
        file: '../src/words.ts',
        find: 'Object.hasOwn(values, name) ? String(values[name]) : blank',
        replace: 'name in values ? String(values[name]) : blank',
      },
    ],
    tests,
  },
  {
    name: 'fill fills in one pass',
    edits: [
      {
        file: '../src/words.ts',
        find: 'text.replace(/\\{(\\w+)\\}/g, (blank, name: string) =>\n    Object.hasOwn(values, name) ? String(values[name]) : blank,\n  )',
        replace:
          "Object.entries(values).reduce((out, [name, value]) => out.replaceAll('{' + name + '}', String(value)), text)",
      },
    ],
    tests,
  },
  {
    name: 'a word given as undefined keeps its default',
    edits: [
      {
        file: '../src/words.ts',
        find: 'if (word !== undefined) words[key] = word',
        replace: 'words[key] = word as never',
      },
    ],
    tests,
  },
  {
    name: 'the defaults are copied, not written',
    edits: [
      {
        file: '../src/words.ts',
        find: 'const words = { ...defaults }',
        replace: 'const words = defaults',
      },
    ],
    tests,
  },
  {
    name: 'one keeps its value when the same item is chosen again',
    edits: [
      {
        file: '../src/choice/one.ts',
        find: 'onSome: item => (Option.contains(value, item) ? value : Option.some(item)),',
        replace: 'onSome: item => Option.some(item),',
      },
    ],
    tests,
  },
  {
    name: 'one ignores a value that is no item',
    edits: [
      {
        file: '../src/choice/one.ts',
        find: 'Option.match(itemOf(items, reported), {',
        replace: 'Option.match(Option.some(reported as never), {',
      },
    ],
    tests,
  },
  {
    name: 'one keeps an empty value when cleared',
    edits: [
      {
        file: '../src/choice/one.ts',
        find: 'ClearedSelection: () => (Option.isNone(value) ? value : Option.none()),',
        replace: "ClearedSelection: () => Option.some('Lisbon' as never),",
      },
    ],
    tests,
  },
  {
    name: 'many ignores a value that is no item',
    edits: [
      {
        file: '../src/choice/many.ts',
        find: 'Option.match(itemOf(items, reported), {',
        replace: 'Option.match(Option.some(reported as never), {',
      },
    ],
    tests,
  },
  {
    name: 'many keeps an empty value when cleared',
    edits: [
      {
        file: '../src/choice/many.ts',
        find: 'ClearedSelection: () => (value.length === 0 ? value : []),',
        replace: 'ClearedSelection: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'many does not follow the typed text',
    edits: [
      {
        file: '../src/choice/many.ts',
        find: 'Typed: () => value,',
        replace: 'Typed: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'text follows the typed text',
    edits: [
      {
        file: '../src/choice/text.ts',
        find: 'Typed: ({ text: typed }) => typed,',
        replace: 'Typed: () => value,',
      },
    ],
    tests,
  },
  {
    name: 'text marks only the item the text is',
    edits: [
      {
        file: '../src/choice/text.ts',
        find: 'chosen: value => Option.toArray(itemOf(items, value)),',
        replace: 'chosen: value => [value as never],',
      },
    ],
    tests,
  },
]
