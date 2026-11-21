// @vitest-environment node
/** `docs/expressions.md`'s snippets, run: what the guide says each answers. */
import { Option, Schema } from 'effect'
import { Verdict } from 'metakit'
import {
  Collation,
  ContextMissingError,
  Entity,
  Expr,
  Held,
  Judge,
  Order,
  Query,
  QueryEvaluateError,
  Relation,
  Write,
  evaluate,
  type Predicate,
} from 'foldkit-entity'
import { describe, expect, it } from 'vitest'

describe('one Entity: sixty seconds, values, null, text, order, the context', () => {
  const Post = Entity.define(
    'Post',
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      words: Schema.Number,
      publishedAt: Schema.NullOr(Schema.Number),
    }),
  ).pipe(Entity.annotateMembers({ title: Collation.of(Collation.binary) }))

  const rows = [
    { id: 'p1', title: 'Notes on the Engine', words: 900, publishedAt: 100 },
    { id: 'p2', title: 'Compilers', words: 2400, publishedAt: null },
    { id: 'p3', title: 'compost', words: 300, publishedAt: 300 },
  ]
  const byTitle = Query.orderBy(Order.asc(Post.fields.title))
  const ids = (predicate: Predicate) =>
    evaluate(Query.from(Post).pipe(Query.where(predicate), byTitle), {}, rows).map(row => row.id)

  it('shows the body, answers it over rows, and says what it reads', () => {
    const Short = Query.from(Post).pipe(
      Query.where(Expr.lt(Post.fields.words, 1000)),
      Query.orderBy(Order.asc(Post.fields.title)),
    )
    expect(Query.show(Short)).toBe(
      ['FROM Post', 'WHERE Post.words < 1000', 'ORDER BY Post.title ASC'].join('\n'),
    )
    expect(evaluate(Short, {}, rows).map(row => row.id)).toEqual(['p1', 'p3'])
    expect(Query.dependencies(Short).predicate.map(field => field.key)).toEqual(['words'])
    expect(Query.dependencies(Short).order.map(field => field.key)).toEqual(['title'])
  })

  it('an input stands for what a run is given, and contains folds ASCII case', () => {
    const search = Expr.input('search', Schema.String)
    const Found = Query.from(Post).pipe(
      Query.where(Expr.contains(Post.fields.title, search)),
      byTitle,
    )
    expect(evaluate(Found, { search: 'COMP' }, rows).map(row => row.id)).toEqual(['p2', 'p3'])
    expect(evaluate(Found, { search: '' }, rows).map(row => row.id)).toEqual(['p2', 'p1', 'p3'])
  })

  it('a null is matched by neither a comparison nor its not', () => {
    const early = Expr.lt(Post.fields.publishedAt, 200)
    expect(ids(early)).toEqual(['p1'])
    expect(ids(Expr.not(early))).toEqual(['p3'])
    expect(ids(Expr.or(Expr.isNull(Post.fields.publishedAt), Expr.not(early)))).toEqual([
      'p2',
      'p3',
    ])
    expect(ids(Expr.eq(Post.fields.publishedAt, null))).toEqual([])
  })

  it('text compares under a declared collation, and not without one', () => {
    expect(ids(Expr.gte(Post.fields.title, 'a'))).toEqual(['p3'])
    expect(ids(Expr.gte(Post.fields.title, 'a', { collation: Collation.asciiFold }))).toEqual([
      'p2',
      'p1',
      'p3',
    ])
    const Plain = Entity.define('Plain', Schema.Struct({ id: Schema.String, name: Schema.String }))
    expect(() => Expr.lt(Plain.fields.name, 'M')).toThrow(
      /Plain\.name is text with no declared collation/,
    )
  })

  it('an order is total, places nulls by its direction, and says whether a client can place a row', () => {
    const Newest = Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.publishedAt)))
    expect(
      Query.orderFor(Newest, {}).map(
        term => `${Expr.show(term.expr)} ${term.direction} nulls ${term.nulls}`,
      ),
    ).toEqual(['Post.publishedAt desc nulls first', 'Post.id asc nulls last'])
    expect(evaluate(Newest, {}, rows).map(row => row.id)).toEqual(['p2', 'p3', 'p1'])
    expect(Query.placement(Newest, {})).toEqual({ _tag: 'Placeable' })
    const Plain = Entity.define('Plain', Schema.Struct({ id: Schema.String, name: Schema.String }))
    expect(
      Query.placement(Query.from(Plain).pipe(Query.orderBy(Order.asc(Plain.fields.name))), {}),
    ).toEqual({
      _tag: 'NotPlaceable',
      reason: 'it orders by Plain.name, text with no declared collation',
    })
    expect(Query.placement(Query.from(Post), {})._tag).toBe('NotPlaceable')
  })

  it('reads the time from the context, and refuses a run with no reading of it', () => {
    const Out = Query.from(Post).pipe(
      Query.where(Expr.lt(Post.fields.publishedAt, Expr.now)),
      byTitle,
    )
    const at = (now: Option.Option<number>) =>
      evaluate(Out, {}, rows, { context: { viewer: Option.none(), now } }).map(row => row.id)
    expect(at(Option.some(200))).toEqual(['p1'])
    expect(() => at(Option.none())).toThrow(ContextMissingError)
    expect(() => evaluate(Out, {}, rows)).toThrow(ContextMissingError)
  })
})

describe('related Entities: links, paths, exists, Judge, and the other declarations', () => {
  const AuthorFields = Entity.define(
    'Author',
    Schema.Struct({ id: Schema.String, name: Schema.String }),
  )
  const CommentFields = Entity.define(
    'Comment',
    Schema.Struct({ id: Schema.String, body: Schema.String }),
  )
  const PostFields = Entity.define(
    'Post',
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      words: Schema.Number,
      published: Schema.Boolean,
    }),
  ).pipe(Entity.annotateMembers({ title: Collation.of(Collation.binary) }))

  const { Author, Comment, Post } = Entity.relate(
    { Author: AuthorFields, Comment: CommentFields, Post: PostFields },
    {
      Post: {
        author: Relation.one(AuthorFields),
        editor: Relation.one(AuthorFields, { optional: true }),
      },
      Comment: { post: Relation.one(PostFields), author: Relation.one(AuthorFields) },
    },
  )
  const byTitle = Query.orderBy(Order.asc(Post.fields.title))
  const Mine = Query.from(Post).pipe(
    Query.where(Expr.eq(Post.relations.author, Expr.viewer(Author))),
    byTitle,
  )
  const ByAuthorName = Query.from(Post).pipe(
    Query.where(
      Expr.eq(
        Expr.path(Post.relations.author, Author.fields.name),
        Expr.input('name', Schema.String),
      ),
    ),
    byTitle,
  )
  const Discussed = Query.from(Post).pipe(
    Query.where(
      Expr.exists(Comment.relations.post, Expr.eq(Comment.relations.author, Expr.viewer(Author))),
    ),
    byTitle,
  )
  const posts = [
    {
      id: 'p1',
      title: 'Notes on the Engine',
      words: 900,
      published: true,
      author: 'a1',
      editor: null,
    },
    { id: 'p3', title: 'compost', words: 300, published: true, author: 'a2', editor: 'a1' },
  ]

  it('a link compares with the viewer, who is null as a visitor or as a row of another Entity', () => {
    const asked = (viewer: Option.Option<{ readonly entity: string; readonly id: string }>) =>
      evaluate(Mine, {}, posts, { context: { viewer, now: Option.none() } }).map(row => row.id)
    expect(asked(Option.some({ entity: 'Author', id: 'a1' }))).toEqual(['p1'])
    expect(asked(Option.none())).toEqual([])
    expect(asked(Option.some({ entity: 'Reader', id: 'a1' }))).toEqual([])
    expect(() => evaluate(Mine, {}, posts)).toThrow(ContextMissingError)
  })

  it('a path and an exists are reaches, not fields; evaluate refuses them, and an order refuses a path', () => {
    expect(Query.dependencies(ByAuthorName).predicate).toEqual([])
    expect(Query.dependencies(ByAuthorName).reaches.map(reach => Expr.show(reach))).toEqual([
      'Post.author.name',
    ])
    expect(Query.unsupported(Discussed, ['eq', 'viewer'])).toEqual(['exists'])
    expect(() => evaluate(ByAuthorName, { name: 'Ada' }, posts)).toThrow(QueryEvaluateError)
    expect(() => Order.asc(Expr.path(Post.relations.author, Author.fields.name))).toThrow(
      /a list orders by its own row's fields/,
    )
  })

  it('Judge answers from what a holder has: known, or unknown and why', () => {
    const page = Held.rows([
      { entity: Post, rows: posts },
      // Ada is held; this holder may lack other authors.
      { entity: Author, rows: [{ id: 'a1', name: 'Ada' }], complete: false },
    ])
    const verdict = (id: string) =>
      Option.map(page.row(Post, id), row => Judge.query(ByAuthorName, { name: 'Ada' }, row))
    expect(verdict('p1')).toEqual(Option.some(Verdict.True()))
    expect(verdict('p3')).toEqual(Option.some(Verdict.Unknown('Author a2 is not held')))
  })

  it('an invariant, a state and a precondition are predicates too', () => {
    const publishedHasWords = Entity.invariant<typeof Post>(
      'publishedHasWords',
      ({ after }) => Expr.or(Expr.eq(after.published, false), Expr.gt(after.words, 0)),
      { message: 'A published post has words', path: ['words'] },
    )
    const Checked = Post.pipe(publishedHasWords)
    const empty = {
      id: 'p9',
      title: 'Untitled',
      words: 0,
      published: true,
      author: 'a1',
      editor: null,
    }
    expect(Entity.judge(Checked, { after: empty })._tag).toBe('Invalid')
    expect(Entity.judge(Checked, { after: { ...empty, words: 1 } })._tag).toBe('Valid')

    const Live = Entity.refine(Post, 'Live', { published: true })
    expect(evaluate(Query.from(Live).pipe(byTitle), {}, posts).map(row => row.id)).toEqual([
      'p1',
      'p3',
    ])
    expect(evaluate(Query.from(Live).pipe(byTitle), {}, [{ ...empty, published: false }])).toEqual(
      [],
    )

    const Publish = Write.update(
      Entity.input(Post, Schema.Struct({ id: Schema.String, published: Schema.Literal(true) })),
      { id: 'id', when: () => Expr.gt(Post.fields.words, 0) },
    )
    expect(Write.reads(Publish).map(field => field.key)).toEqual(['words'])
  })
})
