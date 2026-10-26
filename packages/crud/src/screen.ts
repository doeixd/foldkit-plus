/**
 * A CRUD screen's Messages and their handling, for a page that places a
 * `Crud.editor` and a `Crud.remover` itself: opening a row, starting a new one,
 * closing, and asking to delete, each answered through the placements' own
 * helpers, and the editor's sync run after every Message. It places nothing and
 * owns no Model: the children, their `onOut`, the query's input and the wiring
 * stay the page's, so the pieces are as usable without it as with it.
 */
import { Option, Schema } from 'effect'

/** The four Messages a screen answers, named after it: `OpenedPost`, `CreatedPost`, … */
export type ScreenCases<Name extends string, Id extends Schema.Top> = {
  readonly [K in `Opened${Name}`]: { readonly id: Id }
} & { readonly [K in `Created${Name}`]: {} } & { readonly [K in `Closed${Name}`]: {} } & {
  readonly [K in `AskedToRemove${Name}`]: { readonly id: Id }
}

/**
 * What the screen asks of the page's placed pieces. `Out` and `Asked` are what
 * the editor's and the remover's helpers return, the page's own Model and
 * Commands, which the screen hands back.
 */
export interface ScreenPieces<
  Root,
  Id,
  Out extends { readonly model: Root },
  Asked extends { readonly model: Root },
> {
  /** The placed editor (`Editor.at(...)`), whose sync runs after every Message. */
  readonly editor: {
    readonly after: <M, R extends { readonly model: Root }>(
      update: (model: Root, message: M) => R,
    ) => (model: Root, message: M) => R
  }
  /**
   * The editor's placement (`Page.children.editor`): its `open`, `blank` and
   * `close`, and its link, which reads the form's Messages out of the page's.
   */
  readonly editing: {
    readonly helpers: {
      readonly open: (id: Id) => (model: Root) => Out
      readonly blank: () => (model: Root) => Out
      readonly close: () => (model: Root) => Out
    }
    readonly link: { readonly fromParentMessage: (message: never) => Option.Option<unknown> }
  }
  /** The remover's placement, when the screen can delete: its `ask`. */
  readonly removing?:
    | { readonly helpers: { readonly ask: (id: Id) => (model: Root) => Asked } }
    | undefined
  /**
   * The form's pickers (`Crud.options`), when they page: a picker's
   * `AskedForMore` shows one more page of its list, and still reaches the form.
   */
  // `NoInfer`: the page's Model comes from its own `update`, so pickers over
  // another Model are the mistake reported.
  readonly pickers?:
    // The key is one of the form's, read out of the Message untyped.
    { readonly ask: (root: NoInfer<Root>, key: never) => NoInfer<Root> } | undefined
}

const isAskedForMore = Schema.is(Schema.TaggedStruct('AskedForMore', { key: Schema.String }))

export const screen = <const Name extends string, Id extends Schema.Top>(
  name: Name,
  config: { readonly id: Id },
) => {
  const opened = Schema.TaggedStruct(`Opened${name}`, { id: config.id })
  const created = Schema.TaggedStruct(`Created${name}`, {})
  const closed = Schema.TaggedStruct(`Closed${name}`, {})
  const asked = Schema.TaggedStruct(`AskedToRemove${name}`, { id: config.id })
  const isOpened = Schema.is(opened)
  const isCreated = Schema.is(created)
  const isClosed = Schema.is(closed)
  const isAsked = Schema.is(asked)
  // The id of a Message one of the guards above has just checked: the Schema
  // decoded it, but with `Id` still generic the checker cannot see its field.
  const idOf = (message: object): Id['Type'] => (message as { readonly id: Id['Type'] }).id
  const messages = {
    [`Opened${name}`]: { id: config.id },
    [`Created${name}`]: {},
    [`Closed${name}`]: {},
    [`AskedToRemove${name}`]: { id: config.id },
  } as ScreenCases<Name, Id>

  return {
    /** For `Bundle.withMessages`, beside the page's own. */
    messages,

    /**
     * Wraps the page's `update`: the screen's Messages are answered here, and
     * every other goes to `update`; the editor's sync runs after each, so the
     * loaded value is shown whichever Message brings it.
     */
    update: <
      Root,
      Message extends { readonly _tag: string },
      Result extends { readonly model: Root },
      Out extends { readonly model: Root },
      Asked extends { readonly model: Root } = never,
    >(
      pieces: ScreenPieces<Root, Id['Type'], Out, Asked>,
      update: (model: Root, message: Message) => Result,
    ) =>
      // Wrapped once, when the page's update is made, not on every Message.
      pieces.editor.after((root: Root, received: Message): Result | Out | Asked => {
        if (isOpened(received)) return pieces.editing.helpers.open(idOf(received))(root)
        if (isCreated(received)) return pieces.editing.helpers.blank()(root)
        if (isClosed(received)) return pieces.editing.helpers.close()(root)
        if (isAsked(received) && pieces.removing !== undefined)
          return pieces.removing.helpers.ask(idOf(received))(root)
        const { pickers } = pieces
        if (pickers === undefined) return update(root, received)
        const asked = Option.filter(
          pieces.editing.link.fromParentMessage(received as never),
          isAskedForMore,
        )
        return update(
          Option.match(asked, {
            onNone: () => root,
            onSome: ({ key }) => pickers.ask(root, key as never),
          }),
          received,
        )
      }),
  }
}
