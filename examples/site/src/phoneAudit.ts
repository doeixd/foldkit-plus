/**
 * What a demo's page gets wrong on a phone, read in the page itself:
 * `await page.evaluate(phoneAudit)` in an e2e test, at a phone's width.
 *
 * - `overflow`: how far the page runs past the viewport's width, which a
 *   reader can only reach by scrolling sideways.
 * - `small`: each visible target under WCAG 2.5.8's 24 by 24 pixels that no
 *   exception covers. An undersized target passes when a 24px circle on its
 *   centre touches no other target nor another undersized one's circle
 *   (spacing), when it is a link inside running text (inline), or when it is
 *   a checkbox or radio whose label is itself a target that size. A visually
 *   hidden control, a pixel square, is no target.
 *
 * Self-contained: Playwright sends the function's source to the page, so it
 * may not read anything from its module.
 */
export interface PhoneAudit {
  readonly overflow: number
  readonly small: ReadonlyArray<string>
}

export const phoneAudit = (): PhoneAudit => {
  const MIN = 24
  const selector = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[role="checkbox"]',
    '[role="switch"]',
    '[role="radio"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
  ].join(', ')
  const shown = (element: Element): boolean => {
    if (element.closest('[inert], [aria-hidden="true"]') !== null) return false
    const style = getComputedStyle(element)
    if (style.visibility !== 'visible' || style.display === 'none') return false
    const rect = element.getBoundingClientRect()
    // A visually hidden control (1px, clipped) is pressed through another one: a file input's label.
    return rect.width > 1 && rect.height > 1
  }
  const targets = Array.from(document.querySelectorAll(selector)).filter(shown)
  const rects = new Map(targets.map(target => [target, target.getBoundingClientRect()]))
  const big = (rect: DOMRect) => rect.width >= MIN && rect.height >= MIN
  const centre = (rect: DOMRect) => ({
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  })
  const toRect = (point: { x: number; y: number }, rect: DOMRect) =>
    Math.hypot(
      Math.max(rect.left - point.x, 0, point.x - rect.right),
      Math.max(rect.top - point.y, 0, point.y - rect.bottom),
    )
  const inline = (target: Element) =>
    target.tagName === 'A' && getComputedStyle(target).display === 'inline'
  const labelled = (target: Element) =>
    target instanceof HTMLInputElement &&
    Array.from(target.labels ?? []).some(
      label => shown(label) && big(label.getBoundingClientRect()),
    )
  const spaced = (target: Element, rect: DOMRect) => {
    const at = centre(rect)
    return targets.every(other => {
      if (other === target || other.contains(target) || target.contains(other)) return true
      const its = rects.get(other)!
      if (toRect(at, its) < MIN / 2) return false
      return big(its) || Math.hypot(at.x - centre(its).x, at.y - centre(its).y) >= MIN
    })
  }
  const named = (target: Element) => {
    const name = target.getAttribute('aria-label') ?? (target.textContent ?? '').trim().slice(0, 30)
    const id = target.id === '' ? '' : `#${target.id}`
    const rect = rects.get(target)!
    return `${target.tagName.toLowerCase()}${id} "${name}" ${Math.round(rect.width)}x${Math.round(rect.height)}`
  }
  const small = targets.flatMap(target => {
    const rect = rects.get(target)!
    if (big(rect) || inline(target) || labelled(target) || spaced(target, rect)) return []
    return [named(target)]
  })
  // Against the layout viewport: a phone zooms out to fit a wide page, so
  // `innerWidth` grows with the overflow and their difference reads 0.
  const root = document.documentElement
  return { overflow: root.scrollWidth - root.clientWidth, small }
}

/** What `auditPhone` needs of a Playwright `Page`. */
interface Evaluates {
  evaluate<R>(script: string | (() => R)): Promise<R>
}

/**
 * `phoneAudit` run in `page`. A transform that keeps function names (tsx,
 * Vitest) wraps the audit's own helpers in `__name`, which the page lacks.
 */
export const auditPhone = async (page: Evaluates): Promise<PhoneAudit> => {
  await page.evaluate('globalThis.__name ??= fn => fn')
  return page.evaluate(phoneAudit)
}
