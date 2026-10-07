/**
 * A Menu view with the consumer `toView` seam `@foldkit/ui/menu` lacks.
 * State, Messages, update, Commands, and Mounts stay upstream (imported
 * from `@foldkit/ui/menu`); only markup assembly is transcribed, from
 * `@foldkit/ui@0.165.0` (`packages/ui/src/menu/index.ts`, MIT (c) 2025
 * Devin Jameson) at tag `@foldkit/ui@0.165.0`, with the computed bundles
 * named (`MenuRenderInfo`) and handed to `toView`.
 *
 * The default `toView` reproduces upstream's markup; the parity battery
 * draws both views over the same models, so drift fails loudly. If upstream
 * gains a seam, delete this module; on a bump, re-transcribe and re-run
 * the battery.
 */
import { Array, Match, Option, Predicate, String, pipe } from 'effect'
import * as Menu from '@foldkit/ui/menu'
import { Message } from '@foldkit/ui/menu'
import type { GroupHeading, ItemConfig, Model, ViewInputs } from '@foldkit/ui/menu'
import type { ChildAttribute, Html, HtmlBuilder } from 'foldkit/html'
import { childAttributes } from 'foldkit/html'
import { defineView, type View as SubmodelView } from 'foldkit/submodel'
import type { ReturnWithOutMessage } from 'foldkit/update'
import {
  findFirstEnabledIndex,
  groupContiguous,
  isPrintableKey,
  keyToIndex,
  resolveTypeaheadMatch,
  whenOption as when,
} from './menuUtils.js'

export type MenuItemRender = Readonly<{
  key: string
  attributes: ReadonlyArray<ChildAttribute>
  content: Html
}>

export type MenuHeadingRender = Readonly<{
  id: string
  attributes: ReadonlyArray<ChildAttribute>
  content: Html
}>

export type MenuGroupRender = Readonly<{
  key: string
  heading: MenuHeadingRender | undefined
  group: { key: string; attributes: ReadonlyArray<ChildAttribute> } | undefined
  separator: { key: string; attributes: ReadonlyArray<ChildAttribute> } | undefined
  items: ReadonlyArray<MenuItemRender>
}>

/**
 * The menu's computed bundles. `backdrop`, `items`, `scroll`, and `groups`
 * are present only while visible; a closed menu carries the rest alone, as
 * upstream renders it.
 */
export type MenuRenderInfo = Readonly<{
  id: string
  isVisible: boolean
  wrapper: ReadonlyArray<ChildAttribute>
  button: ReadonlyArray<ChildAttribute>
  buttonContent: Html
  backdrop: { key: string; attributes: ReadonlyArray<ChildAttribute> } | undefined
  items: { key: string; attributes: ReadonlyArray<ChildAttribute> } | undefined
  scroll: ReadonlyArray<ChildAttribute> | undefined
  groups: ReadonlyArray<MenuGroupRender>
}>

/** Upstream `ViewInputs` plus `toView`. */
export type MenuViewInputs<Item extends string> = ViewInputs<Item> &
  Readonly<{
    toView?: (render: MenuRenderInfo) => Html
  }>

const itemId = (id: string, index: number): string => `${id}-item-${index}`

type ViewForItem<Item extends string> = SubmodelView<Model, Message, MenuViewInputs<Item>>

const computeRender = <Item extends string>(
  model: Model,
  viewInputs: MenuViewInputs<Item>,
  h: HtmlBuilder<Message>,
): MenuRenderInfo => {
  const {
    id,
    isOpen,
    animation: { transitionState },
    maybeActiveItemIndex,
    searchQuery,
    maybeLastButtonPointerType,
  } = model

  const {
    items,
    itemToConfig,
    isItemDisabled,
    itemToSearchText = (item: Item) => item,
    isButtonDisabled,
    buttonContent,
    buttonClassName,
    buttonAttributes = [],
    itemsClassName,
    itemsAttributes = [],
    itemsScrollClassName,
    itemsScrollAttributes = [],
    backdropClassName,
    backdropAttributes = [],
    className,
    attributes = [],
    itemGroupKey,
    groupToHeading,
    groupClassName,
    groupAttributes = [],
    separatorClassName,
    separatorAttributes = [],
    anchor = {},
    ariaLabel,
    ariaLabelledBy,
  } = viewInputs

  const dispatchSelectedItem = (item: Item, index: number) => Message.SelectedItem({ index, item })

  const isLeaving = transitionState === 'LeaveStart' || transitionState === 'LeaveAnimating'
  const isVisible = isOpen || isLeaving

  const animationAttributes = Match.value(transitionState).pipe(
    Match.when('EnterStart', () => [
      h.DataAttribute('closed', ''),
      h.DataAttribute('enter', ''),
      h.DataAttribute('transition', ''),
    ]),
    Match.when('EnterAnimating', () => [
      h.DataAttribute('enter', ''),
      h.DataAttribute('transition', ''),
    ]),
    Match.when('LeaveStart', () => [
      h.DataAttribute('leave', ''),
      h.DataAttribute('transition', ''),
    ]),
    Match.when('LeaveAnimating', () => [
      h.DataAttribute('closed', ''),
      h.DataAttribute('leave', ''),
      h.DataAttribute('transition', ''),
    ]),
    Match.orElse(() => []),
  )

  const isDisabled = (index: number): boolean =>
    isItemDisabled !== undefined &&
    pipe(
      items,
      Array.get(index),
      Option.exists(item => isItemDisabled(item, index)),
    )

  const firstEnabledIndex = findFirstEnabledIndex(items.length, 0, isDisabled)(0, 1)

  const lastEnabledIndex = findFirstEnabledIndex(items.length, 0, isDisabled)(items.length - 1, -1)

  const handleButtonKeyDown = (key: string): Option.Option<Message> => {
    if (isOpen) {
      return handleItemsKeyDown(key)
    }

    return Match.value(key).pipe(
      Match.whenOr('Enter', ' ', 'ArrowDown', () =>
        Option.some(
          Message.Opened({
            maybeActiveItemIndex: Option.some(firstEnabledIndex),
          }),
        ),
      ),
      Match.when('ArrowUp', () =>
        Option.some(
          Message.Opened({
            maybeActiveItemIndex: Option.some(lastEnabledIndex),
          }),
        ),
      ),
      Match.orElse(() => Option.none()),
    )
  }

  const handleButtonPointerDown = (
    pointerType: string,
    button: number,
    screenX: number,
    screenY: number,
    timeStamp: number,
  ): Option.Option<Message> =>
    Option.some(
      Message.PressedPointerOnButton({
        pointerType,
        button,
        screenX,
        screenY,
        timeStamp,
      }),
    )

  const handleButtonClick = (): Message => {
    const isMouse = Option.exists(maybeLastButtonPointerType, type => type === 'mouse')

    if (isMouse) {
      return Message.IgnoredMouseClick()
    } else if (isOpen) {
      return Message.Closed()
    } else {
      return Message.Opened({ maybeActiveItemIndex: Option.none() })
    }
  }

  const handleSpaceKeyUp = (key: string): Option.Option<Message> =>
    when(key === ' ', Message.SuppressedSpaceScroll())

  const resolveActiveIndex = keyToIndex(
    'ArrowDown',
    'ArrowUp',
    items.length,
    Option.getOrElse(maybeActiveItemIndex, () => 0),
    isDisabled,
  )

  const searchForKey = (key: string): Option.Option<Message> => {
    const nextQuery = searchQuery + key
    const maybeTargetIndex = resolveTypeaheadMatch(
      items,
      nextQuery,
      maybeActiveItemIndex,
      isDisabled,
      itemToSearchText,
      String.isNonEmpty(searchQuery),
    )
    return Option.some(Message.Searched({ key, maybeTargetIndex }))
  }

  const handleItemsKeyDown = (key: string): Option.Option<Message> =>
    Match.value(key).pipe(
      Match.when('Escape', () => Option.some(Message.Closed())),
      Match.when('Enter', () =>
        Option.map(maybeActiveItemIndex, index => Message.RequestedItemClick({ index })),
      ),
      Match.when(' ', () =>
        String.isNonEmpty(searchQuery)
          ? searchForKey(' ')
          : Option.map(maybeActiveItemIndex, index => Message.RequestedItemClick({ index })),
      ),
      Match.whenOr('ArrowDown', 'ArrowUp', 'Home', 'End', 'PageUp', 'PageDown', () =>
        Option.some(
          Message.ActivatedItem({
            index: resolveActiveIndex(key),
            activationTrigger: 'Keyboard',
          }),
        ),
      ),
      Match.when(isPrintableKey, () => searchForKey(key)),
      Match.orElse(() => Option.none()),
    )

  const handleItemsPointerUp = (
    screenX: number,
    screenY: number,
    pointerType: string,
    timeStamp: number,
  ): Option.Option<Message> =>
    when(pointerType === 'mouse', Message.ReleasedPointerOnItems({ screenX, screenY, timeStamp }))

  const resolveButtonLabel = () => {
    if (Predicate.isNotUndefined(ariaLabel)) {
      return [h.AriaLabel(ariaLabel)]
    } else if (Predicate.isNotUndefined(ariaLabelledBy)) {
      return [h.AriaLabelledBy(ariaLabelledBy)]
    } else {
      return []
    }
  }

  const button = childAttributes([
    h.Id(`${id}-button`),
    h.Type('button'),
    h.AriaHasPopup('menu'),
    h.AriaExpanded(isVisible),
    ...(isVisible ? [h.AriaControls(`${id}-items`)] : []),
    ...resolveButtonLabel(),
    ...(isButtonDisabled
      ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')]
      : [
          h.OnPointerDown(handleButtonPointerDown),
          h.OnKeyDownPreventDefault(handleButtonKeyDown),
          h.OnKeyUpPreventDefault(handleSpaceKeyUp),
          h.OnClick(handleButtonClick()),
        ]),
    ...(isVisible
      ? [h.DataAttribute('open', ''), h.Style({ position: 'relative', zIndex: '1' })]
      : []),
    ...(buttonClassName ? [h.Class(buttonClassName)] : []),
    ...buttonAttributes,
  ])

  const maybeActiveDescendant = Option.match(maybeActiveItemIndex, {
    onNone: () => [],
    onSome: index => [h.AriaActiveDescendant(itemId(id, index))],
  })

  const anchorAttributes = [
    h.Style({ position: 'absolute', margin: '0', visibility: 'hidden' }),
    h.OnMount(Menu.AnchorMenu({ buttonId: `${id}-button`, anchor })),
  ]

  const wrapper = childAttributes([
    ...(className ? [h.Class(className)] : []),
    ...attributes,
    ...(isVisible ? [h.DataAttribute('open', '')] : []),
  ])

  if (!isVisible) {
    return {
      id,
      isVisible,
      wrapper,
      button,
      buttonContent,
      backdrop: undefined,
      items: undefined,
      scroll: undefined,
      groups: [],
    }
  }

  const backdrop = {
    key: `${id}-backdrop`,
    attributes: childAttributes([
      h.OnMount(Menu.PortalMenuBackdrop()),
      ...(isLeaving ? [] : [h.OnClick(Message.Closed())]),
      ...(backdropClassName ? [h.Class(backdropClassName)] : []),
      ...backdropAttributes,
    ]),
  }

  const itemsContainer = {
    key: `${id}-items-container`,
    attributes: childAttributes([
      h.Id(`${id}-items`),
      h.Role('menu'),
      h.AriaLabelledBy(`${id}-button`),
      ...maybeActiveDescendant,
      h.Tabindex(-1),
      ...anchorAttributes,
      ...animationAttributes,
      ...(isLeaving
        ? []
        : [
            h.OnKeyDownPreventDefault(handleItemsKeyDown),
            h.OnKeyUpPreventDefault(handleSpaceKeyUp),
            h.OnPointerUp(handleItemsPointerUp),
            h.OnBlur(Message.BlurredItems()),
          ]),
      ...(itemsClassName ? [h.Class(itemsClassName)] : []),
      ...itemsAttributes,
    ]),
  }

  const scroll =
    itemsScrollClassName || Array.isReadonlyArrayNonEmpty(itemsScrollAttributes)
      ? childAttributes([
          ...(itemsScrollClassName ? [h.Class(itemsScrollClassName)] : []),
          ...itemsScrollAttributes,
        ])
      : undefined

  const itemRenders: ReadonlyArray<MenuItemRender> = Array.map(items, (item, index) => {
    const isActiveItem = Option.exists(maybeActiveItemIndex, activeIndex => activeIndex === index)
    const isDisabledItem = isDisabled(index)
    const itemConfig: ItemConfig = itemToConfig(item, {
      isActive: isActiveItem,
      isDisabled: isDisabledItem,
    })

    const isInteractive = !isDisabledItem && !isLeaving

    return {
      key: itemId(id, index),
      attributes: childAttributes([
        h.Id(itemId(id, index)),
        h.Role('menuitem'),
        ...(isActiveItem ? [h.DataAttribute('active', '')] : []),
        ...(isDisabledItem ? [h.AriaDisabled(true), h.DataAttribute('disabled', '')] : []),
        ...(isInteractive
          ? [
              h.OnClick(dispatchSelectedItem(item, index)),
              ...(isActiveItem
                ? []
                : [
                    h.OnPointerMove((screenX, screenY, pointerType) =>
                      when(
                        pointerType !== 'touch',
                        Message.MovedPointerOverItem({
                          index,
                          screenX,
                          screenY,
                        }),
                      ),
                    ),
                  ]),
              h.OnPointerLeave(pointerType =>
                when(pointerType !== 'touch', Message.DeactivatedItem()),
              ),
            ]
          : []),
        ...(itemConfig.className ? [h.Class(itemConfig.className)] : []),
      ]),
      content: itemConfig.content,
    }
  })

  const groups: ReadonlyArray<MenuGroupRender> = itemGroupKey
    ? Array.flatMap(
        groupContiguous(itemRenders, (_render, index) =>
          Array.get(items, index).pipe(
            Option.match({
              onNone: () => '',
              onSome: item => itemGroupKey(item, index),
            }),
          ),
        ),
        (segment, segmentIndex) => {
          const maybeHeading = Option.fromNullishOr(groupToHeading && groupToHeading(segment.key))

          const headingId = `${id}-heading-${segment.key}`

          const heading: MenuHeadingRender | undefined = Option.match(maybeHeading, {
            onNone: () => undefined,
            onSome: (headingValue: GroupHeading) => ({
              id: headingId,
              attributes: childAttributes([
                h.Id(headingId),
                h.Role('presentation'),
                ...(headingValue.className ? [h.Class(headingValue.className)] : []),
              ]),
              content: headingValue.content,
            }),
          })

          return [
            {
              key: `${id}-group-${segment.key}`,
              heading,
              group: {
                key: `${id}-group-${segment.key}`,
                attributes: childAttributes([
                  h.Role('group'),
                  ...(heading ? [h.AriaLabelledBy(headingId)] : []),
                  ...(groupClassName ? [h.Class(groupClassName)] : []),
                  ...groupAttributes,
                ]),
              },
              separator:
                segmentIndex > 0 &&
                (separatorClassName || Array.isReadonlyArrayNonEmpty(separatorAttributes))
                  ? {
                      key: `${id}-separator-${segmentIndex}`,
                      attributes: childAttributes([
                        h.Role('separator'),
                        ...(separatorClassName ? [h.Class(separatorClassName)] : []),
                        ...separatorAttributes,
                      ]),
                    }
                  : undefined,
              items: segment.items,
            },
          ]
        },
      )
    : [
        {
          key: `${id}-group`,
          heading: undefined,
          group: undefined,
          separator: undefined,
          items: itemRenders,
        },
      ]

  return {
    id,
    isVisible,
    wrapper,
    button,
    buttonContent,
    backdrop,
    items: itemsContainer,
    scroll,
    groups,
  }
}

/** Upstream's markup from the computed bundles: the default `toView`. */
export const defaultToView =
  (h: HtmlBuilder<Message>) =>
  (render: MenuRenderInfo): Html => {
    const drawItem = (item: MenuItemRender): Html =>
      h.keyed('div')(item.key, [...item.attributes], [item.content])
    const drawGroup = (group: MenuGroupRender): ReadonlyArray<Html> => {
      const drawn = group.items.map(drawItem)
      if (group.group === undefined) return drawn
      const headed: ReadonlyArray<Html> =
        group.heading === undefined
          ? []
          : [
              h.keyed('div')(
                group.heading.id,
                [...group.heading.attributes],
                [group.heading.content],
              ),
            ]
      const grouped = h.keyed('div')(
        group.group.key,
        [...group.group.attributes],
        [...headed, ...drawn],
      )
      return [
        ...(group.separator === undefined
          ? []
          : [h.keyed('div')(group.separator.key, [...group.separator.attributes])]),
        grouped,
      ]
    }
    const grouped = render.groups.flatMap(drawGroup)
    return h.div(
      [...render.wrapper],
      [
        h.keyed('button')(`${render.id}-button`, [...render.button], [render.buttonContent]),
        ...(render.backdrop === undefined
          ? []
          : [h.keyed('div')(render.backdrop.key, [...render.backdrop.attributes])]),
        ...(render.items === undefined
          ? []
          : [
              h.keyed('div')(
                render.items.key,
                [...render.items.attributes],
                render.scroll === undefined ? grouped : [h.div([...render.scroll], grouped)],
              ),
            ]),
      ],
    )
  }

const menuViewImpl = defineView<Model, Message, MenuViewInputs<string>>((model, viewInputs, h) => {
  const render = computeRender(model, viewInputs, h)
  return (viewInputs.toView ?? defaultToView(h))(render)
})

const internalView = <Item extends string>() => menuViewImpl as unknown as ViewForItem<Item>

type BundleUpdateReturn<Item extends string> = ReturnWithOutMessage<
  Model,
  Message,
  Menu.OutMessage<Item>
>

/** Upstream's `Bundle` with the forked `view`. */
export type MenuBundle<Item extends string = string> = Readonly<{
  view: ViewForItem<Item>
  update: (model: Model, message: Message) => BundleUpdateReturn<Item>
  selectItem: (model: Model, item: Item, index: number) => BundleUpdateReturn<Item>
  open: (model: Model) => BundleUpdateReturn<Item>
  close: (model: Model) => BundleUpdateReturn<Item>
}>

/** The forked `view` with upstream's `update` and helpers. */
export const create = <Item extends string = string>(): MenuBundle<Item> => {
  const upstream = Menu.create<Item>()
  const cast = (
    result: ReturnWithOutMessage<Model, Message, Menu.OutMessage<Item>>,
  ): BundleUpdateReturn<Item> => result
  return {
    view: internalView<Item>(),
    update: (model, message) => cast(upstream.update(model, message)),
    selectItem: (model, item, index) => cast(upstream.selectItem(model, item, index)),
    open: model => cast(upstream.open(model)),
    close: model => cast(upstream.close(model)),
  }
}
