/**
 * Font stacks a `type.body` or `type.heading` knob may name: each a family
 * and the fallbacks a page without it draws in. A knob takes any stack; these
 * are the ones `/create` offers.
 */
export const fonts = {
  system: 'system-ui, sans-serif',
  geist: '"Geist", ui-sans-serif, system-ui, sans-serif',
  roboto: 'Roboto, "Segoe UI", system-ui, sans-serif',
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  mono: '"Geist Mono", ui-monospace, monospace',
  rounded: 'ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif',
  classic: '"MS Sans Serif", "Microsoft Sans Serif", Tahoma, Verdana, sans-serif',
} as const
