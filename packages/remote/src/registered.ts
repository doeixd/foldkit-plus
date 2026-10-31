/** The runtime half of `Registered`: a descriptor the domain never declared is an error naming both. */
export const assertRegistered = (
  bound: { readonly contract: { readonly name: string } },
  kind: 'Entity' | 'Query' | 'Mutation',
  registered: ReadonlyMap<string, unknown>,
  name: string,
): void => {
  if (!registered.has(name)) {
    throw new Error(
      `Remote: ${kind} "${name}" is not registered with domain "${bound.contract.name}"`,
    )
  }
}
