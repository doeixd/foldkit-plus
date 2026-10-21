// Written by `pnpm icons` from icons.json. Do not edit.
// HeroIcons (MIT, Refactoring UI Inc): @iconify-json/heroicons 1.2.3, https://github.com/tailwindlabs/heroicons/blob/master/LICENSE
import type { IconData } from 'foldkit-media'

export type IconName =
  | 'search'
  | 'eye'
  | 'eye-off'
  | 'pipette'
  | 'rotate-ccw'
  | 'rotate-cw'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'lock'
  | 'close'

export const icons: { readonly [Name in IconName]: IconData } = {
  search: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'm21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607',
        },
        children: [],
      },
    ],
  },
  eye: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'g',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
        },
        children: [
          {
            tag: 'path',
            attributes: {
              d: 'M2.036 12.322a1 1 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178c.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178',
            },
            children: [],
          },
          { tag: 'path', attributes: { d: 'M15 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0' }, children: [] },
        ],
      },
    ],
  },
  'eye-off': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'M3.98 8.223A10.5 10.5 0 0 0 1.934 12c1.292 4.339 5.31 7.5 10.066 7.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.499a10.52 10.52 0 0 1-4.293 5.773M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88',
        },
        children: [],
      },
    ],
  },
  pipette: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'm15 11.25l1.5 1.5l.75-.75V8.758l2.276-.61a3 3 0 1 0-3.675-3.675l-.61 2.277H12l-.75.75l1.5 1.5M15 11.25l-8.47 8.47c-.34.34-.8.53-1.28.53s-.94.19-1.28.53l-.97.97l-.75-.75l.97-.97c.34-.34.53-.8.53-1.28s.19-.94.53-1.28L12.75 9M15 11.25L12.75 9',
        },
        children: [],
      },
    ],
  },
  'rotate-ccw': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 0 1 0 12h-3',
        },
        children: [],
      },
    ],
  },
  'rotate-cw': {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'm15 15l6-6m0 0l-6-6m6 6H9a6 6 0 0 0 0 12h3',
        },
        children: [],
      },
    ],
  },
  success: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'M9 12.75L11.25 15L15 9.75M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0',
        },
        children: [],
      },
    ],
  },
  warning: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0zM12 15.75h.007v.008H12z',
        },
        children: [],
      },
    ],
  },
  error: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'm9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0',
        },
        children: [],
      },
    ],
  },
  info: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'm11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0m-9-3.75h.008v.008H12z',
        },
        children: [],
      },
    ],
  },
  lock: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25',
        },
        children: [],
      },
    ],
  },
  close: {
    viewBox: '0 0 24 24',
    attributes: {},
    nodes: [
      {
        tag: 'path',
        attributes: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-width': '1.5',
          d: 'M6 18L18 6M6 6l12 12',
        },
        children: [],
      },
    ],
  },
}

/** Where an application imports each icon from: its set, and its name in `virtual:foldkit-icons/<set>`. */
export const imports: {
  readonly [Name in IconName]: { readonly set: string; readonly name: string }
} = {
  search: { set: 'heroicons', name: 'magnifyingGlass' },
  eye: { set: 'heroicons', name: 'eye' },
  'eye-off': { set: 'heroicons', name: 'eyeSlash' },
  pipette: { set: 'heroicons', name: 'eyeDropper' },
  'rotate-ccw': { set: 'heroicons', name: 'arrowUturnLeft' },
  'rotate-cw': { set: 'heroicons', name: 'arrowUturnRight' },
  success: { set: 'heroicons', name: 'checkCircle' },
  warning: { set: 'heroicons', name: 'exclamationTriangle' },
  error: { set: 'heroicons', name: 'xCircle' },
  info: { set: 'heroicons', name: 'informationCircle' },
  lock: { set: 'heroicons', name: 'lockClosed' },
  close: { set: 'heroicons', name: 'xMark' },
}
