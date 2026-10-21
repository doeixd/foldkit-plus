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
    edits: [
      {
        file: route,
        find: "yield* policy.admit(request, 'Upload')\n            if (!(request.headers['content-type']",
        replace: "if (!(request.headers['content-type']",
      },
    ],
    tests,
  },
  {
    name: 'anyone may have a URL read',
    edits: [
      {
        file: route,
        find: "yield* policy.admit(request, 'DescribeUrl')\n            const url = new URL",
        replace: 'const url = new URL',
      },
    ],
    tests,
  },
  {
    name: 'a request naming no URL is read as one',
    edits: [
      {
        file: route,
        find: 'if (url === null) return refused(',
        replace: 'if (false) return refused(',
      },
    ],
    tests,
  },
  {
    name: 'a server that names no host reads one all the same',
    edits: [
      {
        file: route,
        find: 'allow: options.facts?.allow ?? []',
        replace: "allow: options.facts?.allow ?? ['images.test']",
      },
    ],
    tests,
  },
  {
    name: 'an image’s facts are kept by a cache',
    edits: [
      {
        file: headers,
        find: "Described: (): Record<string, string> => ({ 'cache-control': 'no-store' }),",
        replace: "Described: (): Record<string, string> => ({ 'cache-control': YEAR }),",
      },
    ],
    tests,
  },
  {
    name: 'a URL that could not be read is kept by a cache',
    edits: [
      {
        file: headers,
        find: "Unavailable: (): Record<string, string> => ({ 'cache-control': 'no-store' }),",
        replace: "Unavailable: (): Record<string, string> => ({ 'cache-control': YEAR }),",
      },
    ],
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
    edits: [{ file: route, find: 'yield* uploads.put(hash, bytes, facts)', replace: '' }],
    tests,
  },
  {
    name: 'an upload is keyed by the name it was sent under',
    edits: [
      {
        file: route,
        find: 'const facts = { ...described, key: hash }',
        replace: 'const facts = described',
      },
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
  {
    name: 'the policy is asked once the body is read',
    edits: [
      {
        file: route,
        find: "yield* policy.admit(request, 'Upload')\n            if (!(request.headers['content-type']",
        replace: "if (!(request.headers['content-type']",
      },
      {
        file: route,
        find: 'const bytes = yield* bodyOf(request, maxBytes)',
        replace:
          "const bytes = yield* bodyOf(request, maxBytes)\n            yield* policy.admit(request, 'Upload')",
      },
    ],
    tests,
  },
  {
    name: 'with no secret set, the unset secret spelt out uploads',
    edits: [
      {
        file: route,
        find: "let difference = token === undefined || token === '' ? 1 : 0",
        replace: 'let difference = 0',
      },
    ],
    tests,
  },
  {
    name: 'any bearer uploads',
    edits: [{ file: route, find: 'difference |= given[at]! ^ expected[at]!', replace: '' }],
    tests,
  },
  {
    name: 'a path under /_media/ the routes lack goes to the application',
    edits: [
      {
        file: '../src/server/fetch.ts',
        find: 'pathname.startsWith(IMAGES) || pathname.startsWith(UPLOADS)',
        replace: 'pathname.startsWith(IMAGES) || pathname === `${UPLOADS}upload`',
      },
    ],
    tests,
  },
  {
    name: 'the application is never asked',
    edits: [
      {
        file: '../src/server/fetch.ts',
        find: '    return otherwise === undefined',
        replace: '    return true',
      },
    ],
    tests,
  },
  {
    name: 'the upload route asks as the facts route',
    edits: [
      {
        file: route,
        find: "yield* policy.admit(request, 'Upload')",
        replace: "yield* policy.admit(request, 'DescribeUrl')",
      },
    ],
    tests,
  },
  {
    name: 'the facts route asks as the upload route',
    edits: [
      {
        file: route,
        find: "yield* policy.admit(request, 'DescribeUrl')",
        replace: "yield* policy.admit(request, 'Upload')",
      },
    ],
    tests,
  },
  {
    name: 'an ended session reads as forbidden',
    edits: [
      {
        file: headers,
        find: 'Unauthenticated: () => 401,',
        replace: 'Unauthenticated: () => 403,',
      },
    ],
    tests,
  },
  {
    name: 'the first policy decides alone',
    edits: [
      {
        file: route,
        find: '(asked, next) => Effect.catch(asked, () => next.admit(request, route)),',
        replace: '(asked) => asked,',
      },
    ],
    tests,
  },
  {
    name: 'every policy is asked, the last deciding',
    edits: [
      {
        file: route,
        find: '(asked, next) => Effect.catch(asked, () => next.admit(request, route)),',
        replace:
          '(asked, next) => Effect.andThen(Effect.ignore(asked), next.admit(request, route)),',
      },
    ],
    tests,
  },
  {
    name: 'an upload keeps its bytes and not its facts',
    edits: [
      {
        file: route,
        find: 'Effect.andThen(store.set(factsKey(hash), encodeFacts(facts))),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an upload keeps facts other than those it answered',
    edits: [
      {
        file: route,
        find: 'const facts = { ...described, key: hash }',
        replace: 'const facts = { ...described, key: hash, width: described.width + 1 }',
      },
    ],
    tests,
  },
  {
    name: 'an entry that is not facts reads as none',
    edits: [
      {
        file: route,
        find: 'Effect.map(found => Option.map(Option.fromNullishOr(found), decodeFacts)),',
        replace:
          'Effect.map(found => Option.flatMap(Option.fromNullishOr(found), Option.liftThrowable(decodeFacts))),',
      },
    ],
    tests,
  },
]
