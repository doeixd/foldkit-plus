import { Effect, Schema } from 'effect'
import { Query, Remote } from 'foldkit-remote'
import type { RemoteClient } from 'foldkit-remote'

/**
 * A form check that says, while the author types, what a publish would refuse:
 * this address belongs to something else. It asks the content type's `bySlug`
 * query, which an author reads through the same binding as everyone else — so it
 * sees unpublished rows too, and an address taken by work not yet shown is taken.
 *
 * It is named by the content type, not given it, so a form can be made with it
 * before the content type that nests the form exists.
 *
 * Put it in the form's `checks` under the slug key:
 * `checks: { slug: Cms.addressFree('posts') }`. The form must know which row it
 * is editing for the row to keep its own address; `Cms.editor` tells it.
 *
 * This is advice, and deliberately not the rule. Two authors can both be told an
 * address is free and both publish; the server refuses the second on the same
 * key, through `Form.Message.Refused`. Asking earlier makes that rarer, never
 * impossible.
 */
export const addressFree = (
  content: string,
): ((
  slug: string,
  context: { readonly subject: Readonly<Record<string, string>> },
) => Effect.Effect<string | undefined, never, RemoteClient>) => {
  // The same query the server registered for this content type: a descriptor is
  // its name and its input, so one made here asks what one made there answers.
  const descriptor = Query.make(`${content}BySlug`, {
    Input: { slug: Schema.String },
    Result: Schema.Unknown,
  })
  return (
    slug: string,
    context: { readonly subject: Readonly<Record<string, string>> },
  ): Effect.Effect<string | undefined, never, RemoteClient> =>
    Remote.query(descriptor.ref({ slug })).pipe(
      // An edge is an id, which is all this asks about.
      Effect.map(result =>
        result.edges.some(edge => edge.id !== context.subject.id)
          ? `"${slug}" is already used`
          : undefined,
      ),
      // A check that could not ask says nothing: the publish is still the rule,
      // and an address is not refused because the network was down.
      Effect.orElseSucceed(() => undefined),
    )
}
