/**
 * The upload route, broken in turn:
 * `pnpm mutate packages/media/test/upload.mutations.ts` checks that a test
 * fails for every one.
 */
const route = '../src/server/upload.ts'
const headers = '../src/server/headers.ts'
const tests = ['packages/media/test/upload.test.ts']

export default [
  {
    name: 'anyone may upload',
    edits: [{ file: route, find: 'yield* policy.admit(request)', replace: '' }],
    tests,
  },
  {
    name: 'a body of any type is read as an image',
    edits: [{ file: route, find: ".startsWith('image/')", replace: '.length >= 0' }],
    tests,
  },
  {
    name: 'a body of any size is read',
    edits: [{ file: route, find: 'if (size > maxBytes) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'an upload is answered and not kept',
    edits: [{ file: route, find: 'yield* uploads.put(hash, bytes)', replace: '' }],
    tests,
  },
  {
    name: 'an upload is keyed by the name it was sent under',
    edits: [
      { file: route, find: 'encode({ ...described, key: hash })', replace: 'encode(described)' },
    ],
    tests,
  },
  {
    name: 'bytes that are not an image are a server failure',
    edits: [
      {
        file: route,
        find: 'TransformFailed: () => Effect.succeed(refused(Answer.cases.Unsupported.make({}))),',
        replace: 'TransformFailed: () => Effect.succeed(refused(Answer.cases.Failed.make({}))),',
      },
    ],
    tests,
  },
  {
    name: 'a broken body is a server failure',
    edits: [
      {
        file: route,
        find: 'HttpServerError: () => Effect.succeed(refused(Answer.cases.Malformed.make({}))),',
        replace: 'HttpServerError: () => Effect.succeed(refused(Answer.cases.Failed.make({}))),',
      },
    ],
    tests,
  },
  {
    name: 'an upload’s answer is kept by a cache',
    edits: [
      {
        file: headers,
        find: "Uploaded: (): Record<string, string> => ({ 'cache-control': 'no-store' }),",
        replace: "Uploaded: (): Record<string, string> => ({ 'cache-control': YEAR }),",
      },
    ],
    tests,
  },
  {
    name: 'a refusal of the policy is kept by a cache',
    edits: [
      {
        file: headers,
        find: "Forbidden: (): Record<string, string> => ({ 'cache-control': 'no-store' }),",
        replace: "Forbidden: (): Record<string, string> => ({ 'cache-control': YEAR }),",
      },
    ],
    tests,
  },
  {
    name: 'an unsupported upload is kept by a cache',
    edits: [
      {
        file: headers,
        find: "Unsupported: (): Record<string, string> => ({ 'cache-control': 'no-store' }),",
        replace: "Unsupported: (): Record<string, string> => ({ 'cache-control': YEAR }),",
      },
    ],
    tests,
  },
]
