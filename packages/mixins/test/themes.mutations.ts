/**
 * Themes installed by name, broken in turn:
 * `pnpm mutate packages/mixins/test/themes.mutations.ts`.
 */
const browser = ['packages/mixins/test/themes.browser.test.ts']
const unit = ['packages/mixins/test/knobs.test.ts']
const kept = ['packages/mixins/test/themesKept.test.ts']
const file = '../src/theme/themes.ts'

export default [
  {
    name: 'a scoped theme declares no derivations',
    edits: [
      {
        file,
        find: 'return global(`${selector}{${declarations(derived)}}${knobRule(selector, theme)}`)',
        replace: 'return global(knobRule(selector, theme))',
      },
    ],
    tests: browser,
  },
  {
    name: 'no other theme is drawn under its name',
    edits: [
      { file, find: '.filter(name => name !== options.initial)', replace: '.filter(() => false)' },
    ],
    tests: [...browser, ...unit],
  },
  {
    name: 'the initial theme keeps an attribute of its own',
    edits: [
      {
        file,
        find: 'if (name === themes.initial) root.removeAttribute(themes.attribute)\n    else ',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the root declares the first theme, not the initial one',
    edits: [
      {
        file,
        find: 'root: standardOf(theme(options.initial)),',
        replace: 'root: standardOf(theme(names[0]!)),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the head script shows whatever name storage holds',
    edits: [
      {
        file,
        find: 'if(${scriptLiteral(themes.names.filter(name => name !== themes.initial))}.indexOf(n)!==-1)',
        replace: 'if(n)',
      },
    ],
    tests: kept,
  },
  {
    name: 'the head script throws where storage does',
    edits: [{ file, find: 'n)}catch(e){}})()', replace: 'n)}catch(e){throw e}})()' }],
    tests: kept,
  },
  {
    name: 'choose keeps the initial theme too',
    edits: [
      {
        file,
        find: '          if (name === themes.initial) localStorage.removeItem(key)\n          else localStorage',
        replace: '          localStorage',
      },
    ],
    tests: kept,
  },
  {
    name: 'a refused store fails the Command',
    edits: [
      {
        file,
        find: '        } catch {\n          // Storage refused (a private window, a full quota): this visit keeps it.\n        }\n      }),',
        replace: '        } finally {\n        }\n      }),',
      },
    ],
    tests: kept,
  },
]
