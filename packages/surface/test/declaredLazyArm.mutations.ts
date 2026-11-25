export default [
  {
    name: 'Declared.of drops Messages for unloaded lazyTags instead of queuing',
    edits: [
      {
        file: '../src/declared.ts',
        find: '          list.push(message)',
        replace: '          // dropped',
      },
    ],
    tests: ['packages/surface/test/declaredLazyArm.test.ts'],
  },
  {
    name: 'Declared.of registerArm does not remove tag from lazyTagSet',
    edits: [
      {
        file: '../src/declared.ts',
        find: '    dynamicArms.set(tag, transition)',
        replace: '    // skipped dynamicArms.set',
      },
    ],
    tests: ['packages/surface/test/declaredLazyArm.test.ts'],
  },
]
