/**
 * A like's id, checked by the server, broken in turn:
 * `pnpm mutate examples/chirp/test/likeId.mutations.ts`.
 */
const file = '../src/server/server.ts'
const tests = ['examples/chirp/test/server.test.ts']

export default [
  {
    name: 'a like under any id lands',
    edits: [{ file, find: 'Option.exists(own, id => id === context.id)', replace: 'true' }],
    tests,
  },
  {
    name: 'a like’s id is not its liker’s',
    edits: [
      {
        file,
        find: "Option.zipWith(linked('post'), linked('user'),",
        replace: "Option.zipWith(linked('post'), linked('post'),",
      },
    ],
    tests,
  },
  {
    name: 'the guards’ writer is not the checking one',
    edits: [
      {
        file,
        find: 'GuardServer.writer(Like, Policy, ownLikes(writer(Db.Like)))',
        replace: 'GuardServer.writer(Like, Policy, writer(Db.Like))',
      },
    ],
    tests,
  },
]
