import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { CartItem, Product } from '../types'

type CartContextValue = {
  items: CartItem[]
  addItem: (product: Product) => void
  decreaseItem: (productId: string) => void
  removeItem: (productId: string) => void
  clearCart: () => void
  totalItems: number
  subtotal: number
  hasAgeRestrictedItem: boolean
}

const CartContext = createContext<CartContextValue | undefined>(undefined)
const STORAGE_KEY = 'pedevo-demo-cart'

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = (product: Product) => {
    setItems((current) => {
      const existing = current.find((item) => item.product.id === product.id)
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        )
      }
      return [...current, { product, quantity: 1 }]
    })
  }

  const decreaseItem = (productId: string) => {
    setItems((current) =>
      current
        .map((item) =>
          item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  const removeItem = (productId: string) => {
    setItems((current) => current.filter((item) => item.product.id !== productId))
  }

  const clearCart = () => setItems([])

  const value = useMemo(
    () => ({
      items,
      addItem,
      decreaseItem,
      removeItem,
      clearCart,
      totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
      hasAgeRestrictedItem: items.some((item) => item.product.requiresAge18),
    }),
    [items],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart precisa estar dentro de CartProvider')
  return context
}
