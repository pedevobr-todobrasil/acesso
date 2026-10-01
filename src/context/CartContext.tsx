import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CartItem, Product, Store } from '../types'

type CartContextValue = {
  items: CartItem[]
  store: Store | null
  setStore: (store: Store) => void
  addItem: (product: Product) => void
  decreaseItem: (productId: string) => void
  removeItem: (productId: string) => void
  clearCart: () => void
  totalItems: number
  subtotal: number
  hasAgeRestrictedItem: boolean
}

const CartContext = createContext<CartContextValue | undefined>(undefined)
const STORAGE_KEY = 'pedevo-cart-v2'

type SavedCart = { items?: CartItem[]; store?: Store | null }

function readSavedCart(): SavedCart {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [initial] = useState<SavedCart>(() => readSavedCart())
  const [items, setItems] = useState<CartItem[]>(initial.items || [])
  const [store, setStoreState] = useState<Store | null>(initial.store || null)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, store }))
  }, [items, store])

  const setStore = useCallback((nextStore: Store) => {
    setStoreState((currentStore) => {
      if (currentStore && currentStore.id !== nextStore.id) {
        setItems([])
      }
      return nextStore
    })
  }, [])

  const addItem = useCallback((product: Product) => {
    setItems((current) => {
      if (product.stock === 0) return current
      const existing = current.find((item) => item.product.id === product.id)
      if (existing) {
        if (product.stock != null && existing.quantity >= product.stock) return current
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }
      return [...current, { product, quantity: 1 }]
    })
  }, [])

  const decreaseItem = useCallback((productId: string) => {
    setItems((current) =>
      current
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }, [])

  const removeItem = useCallback((productId: string) => {
    setItems((current) => current.filter((item) => item.product.id !== productId))
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const value = useMemo(
    () => ({
      items,
      store,
      setStore,
      addItem,
      decreaseItem,
      removeItem,
      clearCart,
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
      hasAgeRestrictedItem: items.some((item) => item.product.requiresAge18),
    }),
    [items, store, setStore, addItem, decreaseItem, removeItem, clearCart],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart precisa estar dentro de CartProvider')
  return context
}
