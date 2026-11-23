const tests = ['packages/sync/test/readsOutsideCatch.test.ts']

export default [
  {
    name: 'readsOutside silently returns empty array on Closure.reads throw',
    edits: [
      {
        file: '../src/mount.ts',
        find: `      return {
        fields: allOutside.length > 0 ? allOutside : ['*'],
        reason: \`[foldkit-sync] Closure.reads threw for Message "\${message._tag}"; its reads outside the slice are unknown, so the replica treats every outside field as read. Declare a transition for "\${message._tag}" to remove the guess.\`,
      }`,
        replace: '      return { fields: [] }',
      },
    ],
    tests,
  },
]
