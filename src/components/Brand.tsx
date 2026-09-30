import { ShoppingBag } from 'lucide-react'

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brandLockup" aria-label="Pedevo">
      <span className="brandMark"><ShoppingBag size={compact ? 18 : 22} strokeWidth={2.4} /></span>
      <span className={compact ? 'brandText compact' : 'brandText'}>Pedevo</span>
    </div>
  )
}
