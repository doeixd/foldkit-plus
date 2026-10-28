/**
 * The example's own claims, each broken in turn: `pnpm mutate
 * examples/chirp/test/chirp.mutations.ts`.
 */
const server = ['examples/chirp/test/server.test.ts']
const client = ['examples/chirp/test/like.test.ts']

export default [
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
      {
        file: '../src/guard.ts',
        find: 'Guards.attach(G, { row: { Write: [G.isAuthor, G.isAdmin] } })',
        replace: 'Guards.attach(G, { row: {} })',
      },
    ],
    tests: server,
  },
  {
    name: 'an admin may write only their own posts',
    edits: [
      {
        file: '../src/guard.ts',
        find: 'Write: [G.isAuthor, G.isAdmin]',
        replace: 'Write: [G.isAuthor]',
      },
    ],
    tests: server,
  },
  {
    name: 'every post counts as the asker’s own',
    edits: [
      {
        file: '../src/guard.ts',
        find: 'Expr.eq(PostFields.fields.authorId, p.id)',
        replace: 'Expr.eq(PostFields.fields.authorId, PostFields.fields.authorId)',
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
    name: 'a chirp is stamped with someone other than its poster',
    edits: [
      {
        file: '../src/server/server.ts',
        find: 'authorId: user => user.id',
        replace: "authorId: () => 'ada'",
      },
    ],
    tests: server,
  },
  {
    name: 'a profile lists everyone’s posts',
    edits: [
      {
        file: '../src/operations.ts',
        find: 'Query.where(Expr.eq(Post.fields.authorId, input.authorId)),',
        replace: '',
      },
    ],
    tests: server,
  },
  {
    name: 'a like is anyone’s to make',
    edits: [
      {
        file: '../src/server/server.ts',
        find: 'mine(context.principal, Entity.refKey(user)),',
        replace: 'true,',
      },
    ],
    tests: server,
  },
  {
    name: 'a like is anyone’s to take back',
    edits: [
      {
        file: '../src/server/server.ts',
        find: 'onSome: row => mine(context.principal, row.user),',
        replace: 'onSome: () => true,',
      },
    ],
    tests: server,
  },
  {
    name: 'every reader is read as you',
    edits: [
      {
        file: '../src/server/server.ts',
        find: 'viewer: asker }),',
        replace: "viewer: () => asker(principalOf('you')) }),",
      },
    ],
    tests: server,
  },
  {
    name: 'the page predicts a like for no one',
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
          'onSome: () => Data.mutate(model, LikePost, { id: likeOf(postId, model.me), postId, userId: model.me }),',
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
    tests: server,
  },
  {
    name: 'a guarded writer hides where its row points',
    edits: [
      {
        file: '../../../packages/guard/src/server.ts',
        find: '...(writer.linked === undefined ? {} : { linked: writer.linked }),',
        replace: '',
      },
    ],
    tests: server,
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
]
