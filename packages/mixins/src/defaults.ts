/**
 * `foldkit-mixins/defaults`: the baseline plain HTML gets before any slot is
 * styled. Every member is element-selector CSS over `--fk-*` tokens with a
 * fallback, so it re-themes with the tokens and still reads without them.
 * The pieces are unlayered; a page puts `reset` in `reset` and the rest in
 * `defaults` with `Layers.standard.in`. Selectors use `:where()` so any
 * class rule beats them.
 */
import { compose, global } from './styleValue.js'
import type { StyleValue } from './styleValue.js'

const v = (name: string, fallback: string): string => `var(--fk-${name}, ${fallback})`

/** Box model, margins, media, form-control fonts: what every page assumes. */
export const reset: StyleValue = global(
  [
    '*,*::before,*::after{box-sizing:border-box;margin:0;min-width:0}',
    ':where(html){text-size-adjust:none;-webkit-text-size-adjust:none;tab-size:4;font-synthesis:none;text-rendering:optimizeLegibility}',
    ':where(:is(img,picture,video,canvas,svg)){display:block;max-inline-size:100%;block-size:auto}',
    ':where(:is(input,button,textarea,select)){font:inherit;color:inherit}',
    ':where(textarea){field-sizing:content;min-block-size:2lh}',
    ':where(:is(h1,h2,h3,h4,h5,h6)){text-wrap:balance}',
    ':where(p){text-wrap:pretty;overflow-wrap:break-word}',
    `@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms!important;transition-duration:0.01ms!important;scroll-behavior:auto!important}}`,
  ].join(''),
)

/** The page's font, color, background, and color scheme. */
export const body: StyleValue = global(
  `:where(body){font-family:${v('font-body', 'system-ui, sans-serif')};font-size:${v('size-md', '1rem')};line-height:${v('leading-normal', '1.5')};font-weight:${v('weight-normal', '400')};color:${v('text-default', 'CanvasText')};background:${v('surface-base', 'Canvas')};-webkit-font-smoothing:antialiased}`,
)

/** A type hierarchy for h1 to h6 from the size scale. */
export const headings: StyleValue = global(
  [
    `:where(:is(h1,h2,h3,h4,h5,h6)){font-family:${v('font-heading', 'inherit')};font-weight:${v('weight-bold', '700')};line-height:${v('leading-tight', '1.2')};color:${v('text-overt', 'inherit')};letter-spacing:-0.01em}`,
    `:where(h1){font-size:${v('size-4xl', '2.25rem')}}`,
    `:where(h2){font-size:${v('size-3xl', '1.875rem')}}`,
    `:where(h3){font-size:${v('size-2xl', '1.5rem')}}`,
    `:where(h4){font-size:${v('size-xl', '1.25rem')}}`,
    `:where(h5){font-size:${v('size-lg', '1.125rem')}}`,
    `:where(h6){font-size:${v('size-md', '1rem')}}`,
  ].join(''),
)

/** Link color, hover, and a visible focus ring. */
export const links: StyleValue = global(
  [
    `:where(a){color:${v('text-link', 'LinkText')};text-decoration-thickness:from-font;text-underline-offset:0.15em}`,
    `:where(a:hover){color:${v('text-link-hover', 'LinkText')}}`,
    `:where(:is(a,button,input,select,textarea,summary,[tabindex]):focus-visible){outline:${v('border-thick', '2px')} solid ${v('outline-focus', 'Highlight')};outline-offset:2px}`,
  ].join(''),
)

/** Inline code and code blocks on the subtle surface. */
export const code: StyleValue = global(
  [
    `:where(:is(code,kbd,samp,pre)){font-family:${v('font-mono', 'ui-monospace, monospace')};font-size:${v('size-sm', '0.875rem')}}`,
    `:where(:not(pre)>code){padding:0.1em 0.35em;border-radius:${v('radius-sm', '3px')};background:${v('surface-subtle', 'transparent')};overflow-wrap:anywhere}`,
    `:where(pre){padding:${v('space-md', '1rem')};border:${v('border-thin', '1px')} solid ${v('outline-subtle', 'transparent')};border-radius:${v('radius-md', '6px')};background:${v('surface-subtle', 'transparent')};overflow-x:auto;line-height:${v('leading-snug', '1.375')}}`,
  ].join(''),
)

/** Text inputs, selects, textareas, and buttons: one radius, one border, one focus. */
export const controls: StyleValue = global(
  [
    `:where(:is(input:not([type=checkbox],[type=radio],[type=range],[type=color],[type=file]),select,textarea)){padding:${v('space-xs', '0.5rem')} ${v('space-sm', '0.75rem')};border:${v('border-thin', '1px')} solid ${v('outline-default', 'ButtonBorder')};border-radius:${v('radius-md', '6px')};background:${v('surface-base', 'Field')};color:${v('text-default', 'FieldText')};transition:border-color ${v('motion-fast', '150ms')} ${v('motion-ease', 'ease-out')}}`,
    `:where(:is(input,select,textarea):focus-visible){border-color:${v('accent-default', 'Highlight')}}`,
    `:where(:is(input,select,textarea)[aria-invalid=true]){border-color:${v('error-default', 'red')}}`,
    `:where(button,[type=button],[type=submit],[type=reset]){padding:${v('space-xs', '0.5rem')} ${v('space-md', '1rem')};border:${v('border-thin', '1px')} solid ${v('outline-default', 'ButtonBorder')};border-radius:${v('radius-md', '6px')};background:${v('surface-subtle', 'ButtonFace')};color:${v('text-default', 'ButtonText')};cursor:pointer;transition:background ${v('motion-fast', '150ms')} ${v('motion-ease', 'ease-out')}}`,
    `:where(button,[type=button],[type=submit],[type=reset]):hover{background:${v('surface-muted', 'ButtonFace')}}`,
    `:where(:is(button,input,select,textarea):disabled){opacity:0.5;cursor:not-allowed}`,
    `:where(:is(input,select,textarea,button)::placeholder){color:${v('text-muted', 'GrayText')}}`,
  ].join(''),
)

/** Every default except `reset`, which belongs in its own layer. */
export const all: StyleValue = compose(body, headings, links, code, controls)

export const Defaults = { reset, body, headings, links, code, controls, all } as const
