const tests = ['packages/ssr/test/binder.test.ts']

export default [
  {
    name: 'binder: skipping emits check answers a Command-emitting transition locally',
    edits: [
      {
        file: '../src/binder.ts',
        find: '  if (transition.emits.length > 0) return false',
        replace: '  if (false && transition.emits.length > 0) return false',
      },
    ],
    tests,
  },
  {
    name: 'binder: skipping unbound-write check answers an unbound write locally',
    edits: [
      {
        file: '../src/binder.ts',
        find: '    if (!boundReads.some(read => covers(read, write.target))) {\n      return false\n    }',
        replace:
          '    if (false && !boundReads.some(read => covers(read, write.target))) {\n      return false\n    }',
      },
    ],
    tests,
  },
  {
    name: 'binder: dropping Schema decode failure guard lets invalid payload through',
    edits: [
      {
        file: '../src/binder.ts',
        find: '    if (Result.isFailure(decoded)) {\n      reportInvalid(formatInvalidPayload(tag, decoded.failure.message))\n      return\n    }',
        replace:
          '    if (false && Result.isFailure(decoded)) {\n      reportInvalid(formatInvalidPayload(tag, decoded.failure.message))\n      return\n    }',
      },
    ],
    tests,
  },
  {
    name: 'binder: dropping unsafe attribute guard writes onclick',
    edits: [
      {
        file: '../src/binder.ts',
        find: '        if (isUnsafeAttribute(value.name)) break',
        replace: '        if (false && isUnsafeAttribute(value.name)) break',
      },
    ],
    tests,
  },
]
