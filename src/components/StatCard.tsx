import type { LucideIcon } from 'lucide-react'

export default function StatCard({ label, value, helper, icon: Icon }: { label: string; value: string; helper?: string; icon: LucideIcon }) {
  return (
    <div className="statCard">
      <div className="statIcon"><Icon size={20} /></div>
      <div><span>{label}</span><strong>{value}</strong>{helper && <small>{helper}</small>}</div>
    </div>
  )
}
