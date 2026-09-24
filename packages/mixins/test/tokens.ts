/** The token groups of styleImprovements-DESIGN.md sections 2.2 and 2.4. */
export const declaredTokens: ReadonlyArray<string> = [
  ...['base', 'muted', 'subtle', 'default', 'overt', 'bedrock'].map(n => `surface-${n}`),
  ...['default', 'muted', 'subtle', 'overt', 'on-accent', 'link', 'link-hover'].map(
    n => `text-${n}`,
  ),
  ...['subtle', 'default', 'overt', 'focus'].map(n => `outline-${n}`),
  ...['accent', 'secondary', 'tertiary'].flatMap(g =>
    ['default', 'hover', 'active', 'subtle', 'text'].map(n => `${g}-${n}`),
  ),
  ...['success', 'warning', 'error', 'info'].flatMap(g =>
    ['default', 'subtle', 'text', 'outline'].map(n => `${g}-${n}`),
  ),
  ...['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'].map(n => `space-${n}`),
  ...['xs', 'sm', 'md', 'lg', 'xl', 'full'].map(n => `radius-${n}`),
  ...['body', 'heading', 'mono'].map(n => `font-${n}`),
  ...['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'].map(n => `size-${n}`),
  ...['tight', 'snug', 'normal', 'relaxed'].map(n => `leading-${n}`),
  ...['normal', 'medium', 'semibold', 'bold'].map(n => `weight-${n}`),
  ...['fast', 'normal', 'ease'].map(n => `motion-${n}`),
  ...['thin', 'thick', 'heavy'].map(n => `border-${n}`),
]

export const tokenReferences = (css: string): ReadonlyArray<string> =>
  [...css.matchAll(/var\(--fk-([a-z0-9-]+)/g)].map(match => match[1] ?? '')
