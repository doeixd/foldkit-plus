/** Walking and rewriting metakit nodes, for what the SQL compiler does to a translation before it writes SQL. */
import { Option } from 'effect'
import { Node } from 'metakit'

/** The nodes directly under `node`, a `Rows` node's source and body included. */
export const children = (node: Node.Node): ReadonlyArray<Node.Node> =>
  Node.$match(node, {
    Lit: () => [],
    Path: () => [],
    Call: ({ args }) => args,
    If: ({ cond, then, otherwise }) => [cond, then, otherwise],
    Match: ({ on, cases, otherwise }) => [
      on,
      ...cases.map(([, arm]) => arm),
      ...Option.toArray(otherwise),
    ],
    Opaque: () => [],
    Rows: rows => [Node.rowsSource(rows.over), ...Node.rowsBody(rows)],
  })

/** Every node of the tree, `node` first. */
export const walk = (node: Node.Node): ReadonlyArray<Node.Node> => [
  node,
  ...children(node).flatMap(walk),
]

/** `node` with each node rewritten by `visit`, children first. */
export const rewrite = (node: Node.Node, visit: (node: Node.Node) => Node.Node): Node.Node => {
  const each = (inner: Node.Node): Node.Node => rewrite(inner, visit)
  return visit(
    Node.$match(node, {
      Lit: lit => lit,
      Path: path => path,
      Call: ({ op, args }) => Node.Call({ op, args: args.map(each) }),
      If: ({ cond, then, otherwise }) =>
        Node.If({ cond: each(cond), then: each(then), otherwise: each(otherwise) }),
      Match: ({ on, cases, otherwise }) =>
        Node.Match({
          on: each(on),
          cases: cases.map(([value, arm]) => [value, each(arm)] as const),
          otherwise: Option.map(otherwise, each),
        }),
      Opaque: opaque => opaque,
      Rows: rows => Node.mapRows(rows, each, each),
    }),
  )
}
