/**
 * The example's own claims, each broken in turn: `pnpm mutate
 * examples/chirp/test/chirp.mutations.ts`.
 */
const server = ['examples/chirp/test/server.test.ts']
const client = ['examples/chirp/test/like.test.ts', 'examples/chirp/test/post.test.ts']
const why = ['examples/chirp/test/why.test.ts']
const stale = ['examples/chirp/test/stale.test.ts']
const page = ['examples/chirp/test/page.browser.test.ts']
const wasm = ['examples/chirp/test/wasm.browser.test.ts']

/**
 * #284: a served write landing past its guarded writer. The startup check
 * would refuse it, so the mutation skips that too, leaving only the tests.
 */
const pastGuards = (name: string, find: string, replace: string, survives?: string) => ({
  name,
  edits: [
    { file: '../src/server/server.ts', find, replace },
    {
      file: '../src/server/server.ts',
      find: 'GuardServer.validate(Policy, {',
      replace: 'void (Policy, {',
    },
  ],
  tests: [...server, ...stale],
  ...(survives === undefined ? {} : { survives }),
})

export default [
  pastGuards(
    'a chirp is deleted past its guards',
    'RemoteServer.write(DeletePost, guarded)',
    'RemoteServer.write(DeletePost, writer(Db.Post, ledgered))',
  ),
  {
    name: 'the admin may delete any chirp, as she may edit one',
    edits: [
      {
        file: '../src/guard.ts',
        find: 'Delete: [G.isAuthor],',
        replace: 'Delete: [G.isAuthor, G.isAdmin],',
      },
    ],
    tests: [...server, ...page],
  },
  {
    name: "a chirp's likes stay behind it",
    edits: [
      {
        file: '../src/server/server.ts',
        find: 'references posts(id) on delete cascade,',
        replace: 'references posts(id),',
      },
    ],
    tests: [...server, ...wasm],
  },
  {
    name: 'sql.js holds no table to its references',
    edits: [
      {
        file: '../src/server/server.ts',
        find: "sqlite.exec('pragma foreign_keys = on')",
        replace: 'void 0',
      },
    ],
    tests: [...server, ...wasm],
  },
  {
    name: 'a delete is sent at once, not kept in the outbox',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Data.mutate(model, DeletePost, { id }, { durable: true })',
        replace: 'Data.mutate(model, DeletePost, { id })',
      },
    ],
    tests: client,
  },
  {
    name: 'Delete shows on every chirp',
    edits: [
      {
        file: '../src/view.ts',
        find: "May.can(post.may, 'Delete')",
        replace: 'true',
      },
    ],
    tests: page,
  },
  pastGuards(
    'a chirp is posted past its guards',
    'RemoteServer.write(PostChirp, guarded)',
    'RemoteServer.write(PostChirp, writer(Db.Post, ledgered))',
    'Entity.sets stamps the author, so a signed-in post is always its own, and RemoteServer.write refuses a visitor, whose author it cannot fill, before any rule',
  ),
  pastGuards(
    'a chirp is edited past its guards',
    'RemoteServer.write(EditPost, guarded)',
    'RemoteServer.write(EditPost, writer(Db.Post, ledgered))',
  ),
  pastGuards(
    'a like is taken back past its guards',
    'RemoteServer.write(Unlike, likeWrites)',
    'RemoteServer.write(Unlike, ownLikes(writer(Db.Like, ledgered)))',
  ),
  {
    name: 'the timeline lists the oldest first',
    edits: [
      {
        file: '../src/operations.ts',
        find: 'Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.createdAt)))',
        replace: 'Query.from(Post).pipe(Query.orderBy(Order.asc(Post.fields.createdAt)))',
      },
    ],
    tests: server,
  },
  {
    name: 'anyone may write any post',
    edits: [
      { file: '../src/guard.ts', find: 'Create: [G.isAuthor, G.isAdmin],', replace: '' },
      { file: '../src/guard.ts', find: 'Update: [G.isAuthor, G.isAdmin],', replace: '' },
      { file: '../src/guard.ts', find: 'Delete: [G.isAuthor],', replace: '' },
      // The startup check refuses a write with no rule; skip it, so only the tests judge.
      {
        file: '../src/server/server.ts',
        find: 'GuardServer.validate(Policy, {',
        replace: 'void (Policy, {',
      },
    ],
    tests: server,
  },
  {
    name: 'an admin may edit only their own posts',
    edits: [
      {
        file: '../src/guard.ts',
        find: 'Update: [G.isAuthor, G.isAdmin],',
        replace: 'Update: [G.isAuthor],',
      },
    ],
    tests: server,
  },
  {
    name: 'every post counts as the asker’s own',
    edits: [
      {
        file: '../src/guard.ts',
        find: 'Expr.eq(Chirp.Post.relations.author, Expr.viewer(UserFields))',
        replace: 'Expr.eq(Chirp.Post.relations.author, Chirp.Post.relations.author)',
      },
    ],
    tests: server,
  },
  {
    name: 'nobody is an admin',
    edits: [
      {
        file: '../src/server/server.ts',
        find: "const admins = new Set(['ada'])",
        replace: 'const admins = new Set<string>()',
      },
    ],
    tests: server,
  },
  {
    // One edit, to the domain: the database's CHECK follows it.
    name: 'a post may be any length',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'body: Schema.String.check(Schema.isMaxCodePoints(280)),',
        replace: 'body: Schema.String,',
      },
    ],
    tests: server,
  },
  {
    name: 'a handle may be anything',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'Schema.isPattern(/^[a-z0-9_]+$/),',
        replace: '',
      },
    ],
    tests: server,
  },
  {
    name: 'a chirp and a like are stamped with someone other than who asked',
    edits: [
      {
        file: '../src/server/server.ts',
        find: '  viewer: Policy.viewer,\n})',
        replace: "  viewer: () => Policy.viewer(principalOf('ada')),\n})",
      },
    ],
    tests: server,
  },
  {
    name: 'a profile lists everyone’s posts',
    edits: [
      {
        file: '../src/operations.ts',
        find: 'Query.where(Expr.eq(Post.relations.author, input.authorId)),',
        replace: '',
      },
    ],
    tests: server,
  },
  {
    name: 'a like is anyone’s to take back',
    edits: [
      {
        file: '../src/guard.ts',
        find: 'Guards.attach(G, { row: { Write: [G.isLiker] } })',
        replace: 'Guards.attach(G, { row: {} })',
      },
      // The startup check refuses a write with no rule; skip it, so only the tests judge.
      {
        file: '../src/server/server.ts',
        find: 'GuardServer.validate(Policy, {',
        replace: 'void (Policy, {',
      },
    ],
    tests: server,
  },
  {
    name: 'the page predicts a like and a chirp for no one',
    edits: [
      {
        file: '../src/app.ts',
        find: 'viewer: model => Option.some(Remote.ref(Chirper, model.me)),',
        replace: '',
      },
    ],
    tests: client,
  },
  {
    name: 'a press always likes',
    edits: [
      {
        file: '../src/app.ts',
        find: 'onSome: id => Data.mutate(model, Unlike, { id }),',
        replace:
          'onSome: () => Data.mutate(model, LikePost, { id: likeOf(postId, model.me), postId }),',
      },
    ],
    tests: client,
  },
  {
    name: 'a press takes back the like it would make, not the one the post shows',
    edits: [
      {
        file: '../src/app.ts',
        find: 'onSome: id => Data.mutate(model, Unlike, { id }),',
        replace: 'onSome: () => Data.mutate(model, Unlike, { id: likeOf(postId, model.me) }),',
      },
    ],
    tests: client,
  },
  {
    name: 'a post’s likes are counted as given',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'likeCount: Derived.count(Chirp.Like.relations.post),',
        replace: 'likeCount: Derived.make(Schema.Number),',
      },
      {
        file: '../src/server/server.ts',
        find: 'derived: { may: { supplied: true } },',
        replace: 'derived: { may: { supplied: true }, likeCount: { supplied: true } },',
      },
    ],
    tests: server,
  },
  {
    name: 'a write answers only what it stored',
    edits: [
      {
        file: '../../../packages/remote-server/src/index.ts',
        find: '...Option.match(read, { onNone: () => ({}), onSome: value => ({ read: value }) }),',
        replace: '',
      },
    ],
    tests: [...server, ...stale],
  },
  {
    name: 'a person counts no posts',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'Entity.derived({ postCount: Derived.count(Chirp.Post.relations.author) }),',
        replace: 'Entity.derived({ postCount: Derived.make(Schema.Number) }),',
      },
      {
        file: '../src/server/server.ts',
        find: 'User: { table: users, relations: { posts: { foreignKey: posts.authorId } } },',
        replace:
          'User: { table: users, relations: { posts: { foreignKey: posts.authorId } }, derived: { postCount: { supplied: true } } },',
      },
    ],
    tests: server,
  },
  {
    name: 'a chirp is written with no time',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Data.mutate(model, PostChirp, value, { now, durable: true })',
        replace: 'Data.mutate(model, PostChirp, value, { durable: true })',
      },
    ],
    tests: client,
  },
  {
    name: 'a chirp is written at 0, not when you posted',
    edits: [
      {
        file: '../src/app.ts',
        find: 'ClockedPost: ({ post, now }) => sent(model, post, now),',
        replace: 'ClockedPost: ({ post }) => sent(model, post, 0),',
      },
    ],
    tests: client,
  },
  {
    name: 'a chirp is posted with no ledger',
    edits: [
      {
        file: '../src/server/server.ts',
        find: 'writer(Db.Post, ledgered)',
        replace: 'writer(Db.Post)',
      },
    ],
    tests: server,
  },
  {
    name: 'a like is made with no ledger',
    edits: [
      {
        file: '../src/server/server.ts',
        find: 'writer(Db.Like, ledgered)',
        replace: 'writer(Db.Like)',
      },
    ],
    tests: server,
  },
  {
    name: 'the ledger is everyone’s',
    edits: [
      {
        file: '../src/server/server.ts',
        find: "Option.match(principal, { onNone: () => '', onSome: user => user.id }),",
        replace: "''",
      },
    ],
    tests: server,
  },
  {
    name: 'a chirp is sent at once, not kept in the outbox',
    edits: [
      {
        file: '../src/app.ts',
        find: '{ now, durable: true }',
        replace: '{ now }',
      },
    ],
    tests: client,
  },
  {
    name: 'your posts are anyone’s, so a chirp of yours does not join them by its author',
    edits: [
      {
        file: '../src/operations.ts',
        find: 'Query.where(Expr.eq(Post.relations.author, input.authorId)),',
        replace: "Query.where(Expr.eq(Post.relations.author, 'nobody')),",
      },
    ],
    tests: why,
  },
]
