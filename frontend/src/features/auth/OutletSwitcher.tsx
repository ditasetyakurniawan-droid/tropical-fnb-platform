import { Building2, Check, ChevronDown, Flame, Lock, Trees } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from './auth-store'
import type { Outlet } from './types'
import { cn } from '@/shared/lib/cn'

function getOutletIcon(codeOrType: string) {
  if (codeOrType === 'ALL') {
    return <Building2 className="size-4 text-brand-700" aria-hidden />
  }
  if (codeOrType.toUpperCase().includes('TSH') || codeOrType.toLowerCase().includes('steak')) {
    return <Flame className="size-4 text-amber-600" aria-hidden />
  }
  return <Trees className="size-4 text-emerald-600" aria-hidden />
}

export function OutletSwitcher() {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const isGlobalAllOutlets = useAuthStore((s) => s.isGlobalAllOutlets)
  const accessibleOutlets = useAuthStore((s) => s.accessibleOutlets)
  const activeOutletId = useAuthStore((s) => s.activeOutletId)
  const setActiveOutletId = useAuthStore((s) => s.setActiveOutletId)
  const activeOutlet = useAuthStore((s) => s.getActiveOutlet())

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Non-global users with single branch or restricted access
  if (!isGlobalAllOutlets) {
    const singleOutlet = activeOutlet ?? accessibleOutlets[0]
    return (
      <div
        className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted/60 px-3 py-1.5 text-xs text-ink-700"
        title="Akses cabang terkunci sesuai penugasan Anda"
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-ink-200/50">
          {singleOutlet ? getOutletIcon(singleOutlet.code) : <Building2 className="size-3.5 text-ink-600" />}
        </span>
        <div className="flex flex-col text-left">
          <span className="font-semibold text-ink-900">{singleOutlet?.name ?? 'Cabang Resto'}</span>
          <span className="text-[10px] text-ink-500 font-mono flex items-center gap-1">
            <Lock className="size-2.5 text-ink-400" />
            {singleOutlet?.code ?? 'RESTO'}
          </span>
        </div>
      </div>
    )
  }

  // Global user (Owner / Direksi) with outlet switcher
  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-left text-xs transition-colors',
          'hover:border-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
          isOpen && 'border-brand-500 ring-2 ring-brand-500/20',
        )}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Pilih cabang restoran aktif"
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-brand-50">
          {activeOutletId === 'ALL' ? getOutletIcon('ALL') : getOutletIcon(activeOutlet?.code ?? '')}
        </span>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase font-semibold tracking-wider text-ink-400">Lingkup Data</span>
          <span className="font-semibold text-ink-900">
            {activeOutletId === 'ALL' ? 'Semua Resto (Konsolidasi Group)' : activeOutlet?.name}
          </span>
        </div>
        <ChevronDown
          className={cn('size-4 text-ink-500 transition-transform duration-150 ml-1', isOpen && 'rotate-180')}
          aria-hidden
        />
      </button>

      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-xl border border-line bg-surface p-1.5 shadow-lg shadow-black/10 transition-all focus:outline-none"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Pilih Tampilan Outlet
          </div>

          {/* Consolidated Group Mode */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setActiveOutletId('ALL')
              setIsOpen(false)
            }}
            className={cn(
              'flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
              activeOutletId === 'ALL' ? 'bg-brand-50/80 text-brand-900 font-semibold' : 'text-ink-700 hover:bg-ink-100',
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-800">
                <Building2 className="size-4" />
              </span>
              <div className="flex flex-col truncate">
                <span className="truncate">🏢 Semua Resto (Konsolidasi)</span>
                <span className="text-[10px] font-normal text-ink-500">Rekap Gabungan Tropical Group</span>
              </div>
            </div>
            {activeOutletId === 'ALL' && <Check className="size-4 text-brand-700 shrink-0" />}
          </button>

          <div className="my-1.5 border-t border-line" />

          {/* Individual Outlets */}
          {accessibleOutlets.map((outlet: Outlet) => {
            const isSelected = activeOutletId === outlet.id
            return (
              <button
                key={outlet.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setActiveOutletId(outlet.id)
                  setIsOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                  isSelected ? 'bg-brand-50/80 text-brand-900 font-semibold' : 'text-ink-700 hover:bg-ink-100',
                )}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-surface-muted">
                    {getOutletIcon(outlet.code)}
                  </span>
                  <div className="flex flex-col truncate">
                    <span className="truncate">{outlet.name}</span>
                    <span className="text-[10px] font-mono text-ink-500 font-normal">
                      {outlet.code} • Manding, Temanggung
                    </span>
                  </div>
                </div>
                {isSelected && <Check className="size-4 text-brand-700 shrink-0" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
