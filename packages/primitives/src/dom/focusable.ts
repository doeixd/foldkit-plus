/** What the focus Mounts share: which elements can take focus, and whether one is showing. */
export const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
  '[contenteditable="true"]',
].join(', ')

export const isVisible = (element: Element): boolean => {
  const probe = element as { checkVisibility?: () => boolean }
  return element.closest('[hidden], [inert]') === null && (probe.checkVisibility?.() ?? true)
}

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
