/**
 * Which ids joined or left a list. Order is not a change: the page draws by
 * title, then id, so a rename does not move membership.
 */
export interface MembershipChange {
  readonly added: ReadonlyArray<string>
  readonly removed: ReadonlyArray<string>
}

export const membershipChange = (
  previous: ReadonlySet<string>,
  next: ReadonlySet<string>,
): MembershipChange | undefined => {
  const added: string[] = []
  const removed: string[] = []
  for (const id of next) if (!previous.has(id)) added.push(id)
  for (const id of previous) if (!next.has(id)) removed.push(id)
  if (added.length === 0 && removed.length === 0) return undefined
  return { added, removed }
}
