import { Menu } from 'lucide-react'
import { useState } from 'react'
import OwnerSidebar from './OwnerSidebar'

export default function OwnerShell({ children }: { children: React.ReactNode }) {
  const [mobileMenu, setMobileMenu] = useState(false)
  return (
    <div className="ownerLayout">
      <div className={mobileMenu ? 'sidebarWrap visible' : 'sidebarWrap'} onClick={() => setMobileMenu(false)}>
        <OwnerSidebar />
      </div>
      <main className="ownerMain">
        <div className="ownerMobileTopbar">
          <button className="iconButton" onClick={() => setMobileMenu(true)}><Menu /></button>
          <strong>Pedevo</strong>
        </div>
        {children}
      </main>
    </div>
  )
}
