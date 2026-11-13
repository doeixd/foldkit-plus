/**
 * `FocusRecovery`, broken in turn: `pnpm mutate
 * packages/primitives/test/focus-recovery.mutations.ts` checks that a test
 * fails for every one.
 */
const recovery = '../src/dom/focus-recovery.ts'
const targets = '../src/dom/focus-targets.ts'
const tests = ['packages/primitives/test/focus-recovery.browser.test.ts']
const writing = ['packages/primitives/test/focus-recovery.test.ts']

export default [
  {
    name: 'a part is written under a name the Mount does not read',
    edits: [
      {
        file: targets,
        find: "export const PART_KEY = 'fk-focus-recovery-part'",
        replace: "export const PART_KEY = 'fk-focus-part'",
      },
    ],
    tests: writing,
  },
  {
    name: 'the fallback name is written under an attribute the Mount does not read',
    edits: [
      {
        file: targets,
        find: "export const TO_KEY = 'fk-focus-recovery-to'",
        replace: "export const TO_KEY = 'fk-focus-to'",
      },
    ],
    tests: writing,
  },
  {
    name: 'a root claims the parts of a nested root',
    edits: [
      {
        file: targets,
        find: 'if (node !== root && containers.has(node)) return undefined',
        replace: 'if (false) return undefined',
      },
    ],
    tests,
  },
  {
    name: 'an ambiguous id names the first of its matches',
    edits: [
      {
        file: targets,
        find: 'return found.length === 1 ? firstFocusable(found[0]!) : undefined',
        replace: 'return firstFocusable(found[0]!)',
      },
    ],
    tests,
  },
  {
    name: 'focus goes back to the part before it rather than the one after',
    edits: [
      {
        file: targets,
        find: '  return nextFocusable(next) ?? previousFocusable(previous) ?? ancestorFocusable(root, enclosing)\n',
        replace:
          '  return previousFocusable(previous) ?? nextFocusable(next) ?? ancestorFocusable(root, enclosing)\n',
      },
    ],
    tests,
  },
  {
    name: 'a part that moved rather than went takes no focus back',
    edits: [
      { file: recovery, find: 'if (leaving.element.isConnected) {', replace: 'if (false) {' },
    ],
    tests,
  },
  {
    name: 'an enclosing part is never the fallback',
    edits: [
      {
        file: targets,
        find: '  return nextFocusable(next) ?? previousFocusable(previous) ?? ancestorFocusable(root, enclosing)\n',
        replace: '  return nextFocusable(next) ?? previousFocusable(previous) ?? undefined\n',
      },
    ],
    tests,
  },
  {
    name: 'focus taken elsewhere is taken back',
    edits: [
      {
        file: recovery,
        find: 'if (active !== null && active !== doc.body && active.isConnected) return',
        replace: 'if (false) return',
      },
    ],
    tests,
  },
  {
    name: 'a part keeps its claim after the reader left it',
    edits: [
      {
        file: recovery,
        find:
          '                      setTimeout(() => {\n' +
          '                        if (disposed || held !== leaving) return\n' +
          '                        if (leaving.element.contains(doc.activeElement)) return\n' +
          '                        held = undefined\n' +
          '                      }, 0)\n',
        replace:
          '                      setTimeout(() => {\n' +
          '                        if (disposed || held !== leaving) return\n' +
          '                        if (leaving.element.contains(doc.activeElement)) return\n' +
          '                      }, 0)\n',
      },
    ],
    tests,
  },
  {
    name: 'teardown leaves its listeners and observer working',
    edits: [
      {
        file: recovery,
        find:
          '                  return () => {\n' +
          '                    disposed = true\n' +
          '                    containers.delete(element)\n' +
          '                    changes.disconnect()\n' +
          "                    element.removeEventListener('focusin', entered)\n" +
          "                    element.removeEventListener('focusout', left)\n" +
          '                  }\n',
        replace: '                  return () => {}\n',
      },
    ],
    tests,
  },
]
