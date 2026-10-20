/**
 * A reader's scheme, kept and applied before the first paint, broken in turn:
 * `pnpm mutate packages/mixins/test/scheme.mutations.ts`.
 */
const file = '../src/theme/scheme.ts'
const tests = ['packages/mixins/test/scheme.test.ts']

export default [
  {
    name: 'the head script applies whatever storage holds',
    edits: [
      {
        file,
        find: "if(s==='light'||s==='dark')document",
        replace: 'if(s)document',
      },
    ],
    tests,
  },
  {
    name: 'a key can close the script it is written in',
    edits: [
      { file: '../src/theme/scriptLiteral.ts', find: ".replaceAll('<',", replace: ".replace('#'," },
    ],
    tests,
  },
  {
    name: 'the head script throws where storage does',
    edits: [{ file, find: 'catch(e){}', replace: 'catch(e){throw e}' }],
    tests,
  },
  {
    name: 'system keeps the stored scheme',
    edits: [
      {
        file,
        find: "if (scheme === 'system') localStorage.removeItem(key)",
        replace: "if (scheme === 'system') void key",
      },
    ],
    tests,
  },
  {
    name: 'a refused store loses this page its scheme',
    edits: [
      {
        file,
        find: "    if (scheme === 'system') root.style.removeProperty('color-scheme')\n    else root.style.colorScheme = scheme\n",
        replace: '',
      },
    ],
    tests,
  },
]
