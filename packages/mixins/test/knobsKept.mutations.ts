/**
 * A reader's knobs, kept and applied before the first paint, broken in turn:
 * `pnpm mutate packages/mixins/test/knobsKept.mutations.ts`.
 */
const file = '../src/theme/knobsKept.ts'
const unit = ['packages/mixins/test/knobsKept.test.ts']
const browser = ['packages/mixins/test/knobsKept.browser.test.ts']

export default [
  {
    name: 'the head script applies an entry of any format',
    edits: [{ file, find: 'e.v!==${KNOBS_FORMAT}||', replace: '' }],
    tests: unit,
  },
  {
    name: 'the head script applies any property the entry names',
    edits: [{ file, find: '&&p[0].indexOf(${literal(KNOB_PREFIX)})===0', replace: '' }],
    tests: unit,
  },
  {
    name: 'a key can close the script it is written in',
    edits: [{ file, find: ".replaceAll('<',", replace: ".replace('#'," }],
    tests: unit,
  },
  {
    name: 'the head script throws where storage does',
    edits: [{ file, find: '}catch(x){}})()', replace: '}catch(x){throw x}})()' }],
    tests: unit,
  },
  {
    name: 'the head script applies nothing',
    edits: [{ file, find: 'r.setProperty(p[0],p[1])', replace: 'void 0' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'chooseKnobs writes a second element beside the script’s',
    edits: [{ file, find: '  if (made !== undefined) return made\n', replace: '' }],
    tests: unit,
  },
  {
    name: 'chooseKnobs keeps the base theme too',
    edits: [
      {
        file,
        find: '      if (declarations.length === 0) localStorage.removeItem(key)\n      else localStorage',
        replace: '      localStorage',
      },
    ],
    tests: unit,
  },
  {
    name: 'chooseKnobs writes every knob, not only those that differ',
    edits: [{ file, find: '.filter(([name, value]) => declared[name] !== value)', replace: '' }],
    tests: unit,
  },
  {
    name: 'a refused store loses this page its knobs',
    edits: [
      {
        file,
        find: '    elementFor(key).textContent =\n',
        replace: '    localStorage.setItem(key, "")\n    elementFor(key).textContent =\n',
      },
    ],
    tests: unit,
  },
]
