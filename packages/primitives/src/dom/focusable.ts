/** What the focus Mounts share: which elements can take focus, and whether one is showing. */
export const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
  // Editable is any value but `false`: `plaintext-only` and the empty value too.
  '[contenteditable]:not([contenteditable="false"])',
  // Only a details' own summary is its toggle, and takes focus.
  'details > summary:first-of-type',
].join(', ')

export const isVisible = (element: Element): boolean => {
  const probe = element as { checkVisibility?: () => boolean }
  return element.closest('[hidden], [inert]') === null && (probe.checkVisibility?.() ?? true)
}

/** Tabbable descendants in DOM order: focusable, visible, and not `tabindex="-1"`. */
export const tabbableWithin = (root: Element): ReadonlyArray<HTMLElement> =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    element => element.tabIndex >= 0 && isVisible(element),
  )

/** Connected, showing, not disabled, and a kind of element that takes focus. */
export const canTakeFocus = (element: Element): boolean =>
  element.isConnected &&
  element.matches(FOCUSABLE) &&
  !element.matches(':disabled') &&
  isVisible(element)

/** The `data-` names (without the prefix) that mark focus owners and their parts. */
export const FOCUS_MARK = {
  owner: 'fk-focus-owner',
  part: 'fk-focus-part',
  key: 'fk-focus-key',
  parent: 'fk-focus-parent',
} as const

/** The element's value of a mark, by `getAttribute`: an id is compared, never put in a selector. */
export const markOf = (
  element: Element,
  mark: Exclude<keyof typeof FOCUS_MARK, 'owner'>,
): string | null => element.getAttribute(`data-${FOCUS_MARK[mark]}`)

/** The innermost owner above an element, or `null`. */
export const ownerAbove = (element: Element): Element | null =>
  element.parentElement?.closest(`[data-${FOCUS_MARK.owner}]`) ?? null

/**
 * The `data-` name (without the prefix) a container of roving tab stops
 * writes, so `FollowTabStop` takes its own stop, never one a nested roving
 * widget holds. Apart from the focus owner marks: a roving container owns no
 * part, so it never stands between a `FocusRecovery` and the parts inside it.
 */
export const ROVING_MARK = 'fk-roving'

/** Focuses the target if it can take it; the page may be scrolled elsewhere, so it scrolls only to show it. */
export const take = (target: HTMLElement | undefined): boolean => {
  if (target === undefined || !canTakeFocus(target)) return false
  target.focus({ preventScroll: true })
  if (target.ownerDocument.activeElement !== target) return false
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  return true
}
