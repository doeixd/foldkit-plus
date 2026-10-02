import { Array } from 'effect'

import type { Cart, Item } from '../domain/index.js'

/** Dollars to two places, as every page shows a price: `$1.50`. */
export const formatPrice = (amount: number): string => `$${amount.toFixed(2)}`

export const lineTotal = ({ item, quantity }: Item.CartItem): number => item.price * quantity

export const cartTotal = (cart: Cart.Cart): number =>
  Array.reduce(cart, 0, (total, cartItem) => total + lineTotal(cartItem))
