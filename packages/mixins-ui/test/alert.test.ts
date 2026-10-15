/**
 * Alert in its two layouts. Inline it is a live region that reports or
 * interrupts by urgency; as a banner it is a region landmark named by its
 * label, and never a live region. Both draw an action as a link or a button
 * by what it is given, and a dismiss button only when the application can
 * dismiss it. The recipe maps each tone to its family, which `emphasis` reads
 * as a tint or a fill.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Alert, AlertSlots, Patterns, Recipes } from '../src/index.js'
import { h, message, sends, type TestMessage } from './fixture.js'

const style = Style.forSlots(AlertSlots)(Recipes.Alert({ tone: 'warning', emphasis: 'bold' }))

describe('Alert.view', () => {
  it('meets the alert pattern', () => {
    expect(A11y.validate(Patterns.Alert, AlertSlots)).toEqual([])
  })

  it('inline, reports by default and interrupts when assertive', () => {
    const quiet = Alert.view(
      { layout: 'inline', title: 'Saved', description: 'All changes kept.', style },
      h,
    )
    expect(Inert.byRole(quiet, 'status')).toHaveLength(1)
    expect(Inert.byRole(quiet, 'alert')).toHaveLength(0)
    expect(Inert.text(quiet)).toBe('SavedAll changes kept.')
    const loud = Alert.view({ layout: 'inline', title: 'Failed', assertive: true, style }, h)
    expect(Inert.byRole(loud, 'alert')).toHaveLength(1)
    expect(Inert.byRole(loud, 'status')).toHaveLength(0)
  })

  it('as a banner, is a region named by its label and no live region', () => {
    const drawn = Alert.view(
      { layout: 'banner', label: 'Maintenance', title: 'Down at noon.', style },
      h,
    )
    const [region] = Inert.byTag(drawn, 'section')
    expect(Inert.value(region, 'aria-label')).toBe('Maintenance')
    expect(Inert.value(region, 'role')).toBeUndefined()
    expect(Inert.text(region)).toBe('Down at noon.')
  })

  it('marks its layout and whether it holds a dismiss button, for the recipe', () => {
    const inline = Alert.view({ layout: 'inline', title: 'Saved', style }, h)
    expect(Inert.value(inline, 'data-layout')).toBe('inline')
    expect(Inert.value(inline, 'data-dismissible')).toBe('false')
    const banner = Alert.view(
      {
        layout: 'banner',
        label: 'News',
        title: 'v2 is out.',
        onDismiss: message('Clicked'),
        style,
      },
      h,
    )
    expect(Inert.value(banner, 'data-layout')).toBe('banner')
    expect(Inert.value(banner, 'data-dismissible')).toBe('true')
  })

  it('skips the icon, description, actions and dismiss button it is not given', () => {
    const bare = Alert.view({ layout: 'inline', title: 'Hi', style }, h)
    expect(Inert.text(bare)).toBe('Hi')
    expect(Inert.byTag(bare, 'button')).toEqual([])
    expect(Inert.byTag(bare, 'a')).toEqual([])
  })

  it('draws a link action as a link and a pressed one as a button, in the order given', () => {
    const drawn = Alert.view(
      {
        layout: 'banner',
        label: 'News',
        title: 'v2 is out.',
        actions: [
          { label: 'Upgrade', onClick: message('Other') },
          { label: 'Read', href: '#v2' },
        ],
        style,
      },
      h,
    )
    const [link] = Inert.byTag(drawn, 'a')
    expect(Inert.value(link, 'href')).toBe('#v2')
    expect(Inert.text(link)).toBe('Read')
    const [button] = Inert.byTag(drawn, 'button')
    expect(Inert.text(button)).toBe('Upgrade')
    expect(button?.data?.on?.['click']).toBeTypeOf('function')
    expect(Inert.text(drawn)).toBe('v2 is out.UpgradeRead')
  })

  it('names its dismiss button after the banner, after the inline title, or as told', () => {
    const named = (view: Parameters<typeof Alert.view<TestMessage>>[0]) => {
      const [button] = Inert.byTag(Alert.view(view, h), 'button')
      expect(button?.data?.on?.['click']).toBeTypeOf('function')
      return Inert.value(button, 'aria-label')
    }
    const onDismiss = message('Clicked')
    expect(named({ layout: 'banner', label: 'Cookies', title: 'We use cookies.', onDismiss })).toBe(
      'Dismiss Cookies',
    )
    expect(named({ layout: 'inline', title: 'Saved', onDismiss })).toBe('Dismiss Saved')
    expect(
      named({
        layout: 'banner',
        label: 'Cookies',
        title: 'We use cookies.',
        onDismiss,
        dismissLabel: 'Accept and close',
      }),
    ).toBe('Accept and close')
  })

  it('sends the action from the action and the dismissal from the dismiss button, neither submitting a form', () => {
    const view = (h: HtmlBuilder<TestMessage>) =>
      Alert.view(
        {
          layout: 'inline',
          title: 'Upload failed',
          actions: [{ label: 'Retry', onClick: message('Other') }],
          onDismiss: message('Clicked'),
          style,
        },
        h,
      )
    sends(
      view,
      Scene.click(Scene.role('button', { name: 'Retry' })),
      Scene.expectOutMessage(message('Other')),
      Scene.click(Scene.role('button', { name: 'Dismiss Upload failed' })),
      Scene.expectOutMessage(message('Clicked')),
    )
    expect(Inert.byTag(view(h), 'button').map(button => Inert.value(button, 'type'))).toEqual([
      'button',
      'button',
    ])
  })

  it('hides its icon, which the title already says', () => {
    const drawn = Alert.view(
      { layout: 'inline', title: 'Disk nearly full.', icon: h.span([], ['!']), style },
      h,
    )
    const [icon] = Inert.children(drawn)
    expect(Inert.value(icon, 'aria-hidden')).toBe('true')
  })
})

describe('Alert recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Alert>[0]): string =>
    Style.forSlots(AlertSlots)(Recipes.Alert(selection)).css

  it('reads every tone from its family, info by default', () => {
    expect(css({})).toContain('--_fk-alert-subtle:var(--fk-info-subtle)')
    expect(css({ tone: 'error' })).toContain('--_fk-alert-subtle:var(--fk-error-subtle)')
    expect(css({ tone: 'error' })).toContain('--_fk-alert-ink:var(--fk-error-ink)')
    expect(css({ tone: 'success' })).toContain('--_fk-alert-subtle:var(--fk-success-subtle)')
    expect(css({ tone: 'warning' })).toContain('--_fk-alert-fill:var(--fk-warning-default)')
  })

  it('tints by default and fills when bold', () => {
    expect(css({})).toContain('background:var(--_fk-alert-subtle)')
    expect(css({})).not.toContain('background:var(--_fk-alert-fill)')
    expect(css({ emphasis: 'bold' })).toContain('background:var(--_fk-alert-fill)')
    expect(css({ emphasis: 'bold' })).toContain('color:var(--_fk-alert-on-fill)')
  })

  it('lays a banner out as a strip, with room for a dismiss button only when it has one', () => {
    expect(css({})).toMatch(/\[data-layout="banner"\]\{[^}]*display:flex/)
    expect(css({})).toMatch(
      /\[data-layout="banner"\]\[data-dismissible="true"\]\{[^}]*padding-inline:/,
    )
  })
})
