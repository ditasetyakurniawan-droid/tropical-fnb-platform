import {
  AlertCircle,
  Calculator,
  ChefHat,
  Coffee,
  Cookie,
  FlaskConical,
  Layers,
  RefreshCw,
  Rocket,
  Save,
  Sparkles,
  UtensilsCrossed,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { createMenuItem, updateMenuItem } from './menu-api'
import type {
  KitchenStationCode,
  MenuCategory,
  MenuItemDetail,
  MenuItemWithHPA,
  MenuStatus,
  MenuType,
  SaveMenuItemRequest,
} from './types'
import {
  KITCHEN_STATION_OPTIONS,
  calculateRecommendedSellingPrice,
  formatRupiah,
  suggestKitchenStation,
} from './uom-helpers'
import { useAuthStore } from '@/features/auth/auth-store'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { NumberInput } from '@/shared/ui/NumberInput'

interface MenuFormModalProps {
  isOpen: boolean
  editingItem: MenuItemWithHPA | null
  categories: MenuCategory[]
  onClose: () => void
  onSaved: (detail: MenuItemDetail, openBomBuilderNext: boolean) => void
}

const MENU_TYPE_CARDS: ReadonlyArray<{
  type: MenuType
  title: string
  subtitle: string
  defaultTargetFC: number
  icon: typeof UtensilsCrossed
  activeClass: string
}> = [
  {
    type: 'FOOD',
    title: 'Makan Besar',
    subtitle: 'Steak, Bakar, Nasi, Sup',
    defaultTargetFC: 38,
    icon: UtensilsCrossed,
    activeClass: 'border-brand-600 bg-brand-50/80 text-brand-950 ring-2 ring-brand-500/20',
  },
  {
    type: 'SNACK',
    title: 'Snack & Camilan',
    subtitle: 'Kentang, Gorengan, Pisang, Kue',
    defaultTargetFC: 30,
    icon: Cookie,
    activeClass: 'border-amber-600 bg-amber-50/80 text-amber-950 ring-2 ring-amber-500/20',
  },
  {
    type: 'BEVERAGE',
    title: 'Minuman & Bar',
    subtitle: 'Mocktail, Kopi, Jus, Kelapa',
    defaultTargetFC: 25,
    icon: Coffee,
    activeClass: 'border-teal-600 bg-teal-50/80 text-teal-950 ring-2 ring-teal-500/20',
  },
]

export function MenuFormModal(props: MenuFormModalProps) {
  if (!props.isOpen) return null
  const content = (
    <MenuFormModalContent
      key={props.editingItem?.id ?? 'new-menu-item'}
      {...props}
    />
  )
  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }
  return content
}

function MenuFormModalContent({
  editingItem,
  categories,
  onClose,
  onSaved,
}: MenuFormModalProps) {
  const accessibleOutlets = useAuthStore((s) => s.accessibleOutlets)
  const activeOutletId = useAuthStore((s) => s.activeOutletId)
  const isGlobalAllOutlets = useAuthStore((s) => s.isGlobalAllOutlets)

  const defaultNewOutletId =
    activeOutletId && activeOutletId !== 'ALL'
      ? activeOutletId
      : accessibleOutlets[0]?.id ?? 'ALL'
  const defaultNewOutletCode =
    defaultNewOutletId === 'ALL'
      ? ''
      : accessibleOutlets.find((o) => o.id === defaultNewOutletId)?.code ?? ''
  const initialMenuType: MenuType = editingItem?.menu_type ?? 'FOOD'

  const [name, setName] = useState(editingItem?.name ?? '')
  const [code, setCode] = useState(editingItem?.code ?? '')
  const [description, setDescription] = useState(editingItem?.description ?? '')
  const [menuType, setMenuType] = useState<MenuType>(initialMenuType)
  const [outletId, setOutletId] = useState<string>(
    editingItem ? editingItem.outlet_id ?? 'ALL' : defaultNewOutletId,
  )
  const [useCustomCategory, setUseCustomCategory] = useState(
    editingItem ? false : categories.length === 0,
  )
  const [categoryId, setCategoryId] = useState(
    editingItem
      ? editingItem.category_id ??
          categories.find((c) => c.code === editingItem.category_code)?.id ??
          categories[0]?.id ??
          ''
      : categories[0]?.id ?? '',
  )
  const [customCategoryName, setCustomCategoryName] = useState('')
  const [kitchenStation, setKitchenStation] = useState<KitchenStationCode>(
    editingItem
      ? (editingItem.kitchen_station as KitchenStationCode | undefined) ??
          suggestKitchenStation(editingItem.outlet_code ?? '', initialMenuType)
      : suggestKitchenStation(defaultNewOutletCode, 'FOOD'),
  )
  const [stationTouchedManually, setStationTouchedManually] = useState(
    Boolean(editingItem),
  )
  const [status, setStatus] = useState<MenuStatus>(
    editingItem?.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
  )
  const [sellingPrice, setSellingPrice] = useState<number>(
    editingItem?.selling_price ?? 0,
  )
  const [targetFoodCostPct, setTargetFoodCostPct] = useState<number>(
    editingItem ? editingItem.target_food_cost_pct || 35 : 38,
  )
  const [isAvailable, setIsAvailable] = useState<boolean>(
    editingItem ? editingItem.is_available : true,
  )

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const effectiveCategoryId = categoryId || categories[0]?.id || ''

  const selectedOutletCode = useMemo(() => {
    if (outletId === 'ALL') return ''
    return accessibleOutlets.find((o) => o.id === outletId)?.code ?? ''
  }, [outletId, accessibleOutlets])

  const currentHpa = editingItem?.hpa ?? 0
  const recommended = calculateRecommendedSellingPrice(currentHpa, targetFoodCostPct)
  const projectedMargin = sellingPrice - currentHpa
  const projectedFoodCostPct =
    sellingPrice > 0 && currentHpa > 0
      ? Math.round((currentHpa / sellingPrice) * 10000) / 100
      : 0

  const handleSelectMenuType = (nextType: MenuType, defaultFC: number) => {
    setMenuType(nextType)
    if (!editingItem) {
      setTargetFoodCostPct(defaultFC)
    }
    if (!stationTouchedManually) {
      setKitchenStation(suggestKitchenStation(selectedOutletCode, nextType))
    }
  }

  const handleChangeOutlet = (nextOutletId: string) => {
    setOutletId(nextOutletId)
    if (!stationTouchedManually) {
      const nextCode =
        nextOutletId === 'ALL'
          ? ''
          : accessibleOutlets.find((o) => o.id === nextOutletId)?.code ?? ''
      setKitchenStation(suggestKitchenStation(nextCode, menuType))
    }
  }

  const handleSubmit = async (openBomBuilderNext: boolean) => {
    setErrorMsg(null)

    if (!name.trim()) {
      setErrorMsg('Nama menu wajib diisi (ketik bebas nama makanan, camilan, atau minuman).')
      return
    }
    if (useCustomCategory && !customCategoryName.trim()) {
      setErrorMsg('Ketik nama kategori menu baru terlebih dahulu.')
      return
    }
    if (!useCustomCategory && !effectiveCategoryId) {
      setErrorMsg('Pilih kategori menu atau klik "+ Ketik Kategori Baru".')
      return
    }
    if (sellingPrice < 0) {
      setErrorMsg('Harga jual tidak boleh negatif.')
      return
    }
    if (status === 'PUBLISHED' && sellingPrice <= 0) {
      setErrorMsg(
        'Menu yang langsung Tayang di Layar Kasir wajib memiliki Harga Jual lebih dari Rp 0. Pilih "Simpan Konsep / Uji Coba" jika masih menghitung modal bahan dulu.',
      )
      return
    }

    setIsSubmitting(true)
    try {
      const payload: SaveMenuItemRequest = {
        ...(outletId && outletId !== 'ALL' ? { outlet_id: outletId } : {}),
        ...(useCustomCategory
          ? { custom_category_name: customCategoryName.trim() }
          : { category_id: effectiveCategoryId }),
        ...(code.trim() ? { code: code.trim() } : {}),
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        menu_type: menuType,
        kitchen_station: kitchenStation,
        status,
        selling_price: sellingPrice,
        target_food_cost_pct: targetFoodCostPct > 0 ? targetFoodCostPct : 35,
        is_available: isAvailable,
      }

      const savedDetail = editingItem
        ? await updateMenuItem(editingItem.id, payload)
        : await createMenuItem(payload)

      onSaved(savedDetail, openBomBuilderNext)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan data menu.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="menu-form-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-line bg-gradient-to-r from-emerald-950 via-brand-900 to-teal-900 text-white">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
              <ChefHat className="size-3.5" />
              <span>Dapur Kreasi &amp; Daftar Menu</span>
            </div>
            <h3 id="menu-form-title" className="text-lg sm:text-xl font-extrabold">
              {editingItem ? `Ubah Menu: ${editingItem.name}` : 'Buat Menu Baru'}
            </h3>
            <p className="text-xs text-emerald-100/85">
              Ketik bebas menu makan besar, camilan, atau minuman baru — lengkap dengan tujuan layar dapur &amp; saran harga jual otomatis.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Tutup modal menu"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {errorMsg && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800 flex items-start gap-2.5">
              <AlertCircle className="size-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Tipe Sajian Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-ink-600">
              1. Pilih Jenis Sajian Menu
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {MENU_TYPE_CARDS.map((card) => {
                const Icon = card.icon
                const active = menuType === card.type
                return (
                  <button
                    key={card.type}
                    type="button"
                    onClick={() => handleSelectMenuType(card.type, card.defaultTargetFC)}
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all',
                      active
                        ? card.activeClass
                        : 'border-line bg-surface hover:bg-surface-muted/60 text-ink-700',
                    )}
                  >
                    <span className="mt-0.5 rounded-lg bg-white/80 p-1.5 shadow-2xs border border-line/60">
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <span className="text-xs font-extrabold block">{card.title}</span>
                      <span className="text-[11px] opacity-80 block">{card.subtitle}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. Nama Menu, Outlet & Kategori Kustom */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-8">
              <label htmlFor="menu-name-input" className="block text-xs font-semibold text-ink-700 mb-1">
                Nama Menu (Ketik Bebas) <span className="text-red-500">*</span>
              </label>
              <input
                id="menu-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Es Kopi Susu Gula Aren, Kentang Keju, Iga Bakar Madu..."
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>

            <div className="sm:col-span-4">
              <label htmlFor="menu-code-input" className="block text-xs font-semibold text-ink-700 mb-1">
                Kode Menu <span className="text-[10px] font-normal text-ink-400">(Opsional / Otomatis)</span>
              </label>
              <input
                id="menu-code-input"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Otomatis dibuat..."
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-mono text-ink-800 focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* Cabang Resto */}
            <div className="sm:col-span-6">
              <label htmlFor="menu-outlet-select" className="block text-xs font-semibold text-ink-700 mb-1">
                Cabang Restoran
              </label>
              <select
                id="menu-outlet-select"
                value={outletId}
                onChange={(e) => handleChangeOutlet(e.target.value)}
                disabled={!isGlobalAllOutlets && accessibleOutlets.length <= 1}
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-900 focus:border-brand-500 focus:outline-none"
              >
                {isGlobalAllOutlets && (
                  <option value="ALL">🏢 Berlaku di Semua Resto (Steak &amp; Garden)</option>
                )}
                {accessibleOutlets.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Kategori Menu (Dropdown atau Ketik Baru) */}
            <div className="sm:col-span-6">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-ink-700">
                  Kategori Menu <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setUseCustomCategory((prev) => !prev)}
                  className="text-[11px] font-bold text-brand-700 hover:text-brand-900 underline"
                >
                  {useCustomCategory ? 'Pilih dari Kategori Ada' : '+ Ketik Kategori Baru'}
                </button>
              </div>

              {useCustomCategory ? (
                <input
                  type="text"
                  value={customCategoryName}
                  onChange={(e) => setCustomCategoryName(e.target.value)}
                  placeholder="Ketik kategori baru, contoh: Minuman Spesial..."
                  className="w-full rounded-xl border border-brand-400 bg-brand-50/30 px-3 py-2 text-xs font-semibold text-ink-900 focus:border-brand-600 focus:outline-none"
                />
              ) : (
                <select
                  value={effectiveCategoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-900 focus:border-brand-500 focus:outline-none"
                >
                  <option value="">-- Pilih Kategori Menu --</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.menu_count} menu)
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Deskripsi Singkat */}
            <div className="sm:col-span-12">
              <label className="block text-xs font-semibold text-ink-700 mb-1">
                Keterangan Menu / Catatan Sajian <span className="text-[10px] font-normal text-ink-400">(Opsional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contoh: Disajikan dingin dengan es kristal dan gula aren murni..."
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink-800 focus:border-brand-500 focus:outline-none"
              />
            </div>
          </div>

          {/* 3. Tujuan Layar Dapur */}
          <div className="rounded-xl border border-line bg-surface-muted/40 p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="kds-station-select" className="text-xs font-bold text-ink-800">
                Kirim Pesanan ke Layar Dapur Bagian Mana?
              </label>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                Otomatis Muncul di Layar Koki
              </span>
            </div>
            <select
              id="kds-station-select"
              value={kitchenStation}
              onChange={(e) => {
                setKitchenStation(e.target.value as KitchenStationCode)
                setStationTouchedManually(true)
              }}
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-900 focus:border-brand-500 focus:outline-none"
            >
              {KITCHEN_STATION_OPTIONS.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-500">
              Pilih <strong>&ldquo;Tanpa Masuk Layar Dapur (Ambil Langsung di Kasir)&rdquo;</strong> untuk keripik kemasan, air mineral botol, atau produk jadi yang tidak perlu dimasak.
            </p>
          </div>

          {/* 4. Mode Konsep vs Tayang Kasir */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setStatus('DRAFT')}
              className={cn(
                'rounded-xl border p-3.5 text-left transition-all space-y-1',
                status === 'DRAFT'
                  ? 'border-indigo-500 bg-indigo-50/80 text-indigo-950 ring-2 ring-indigo-500/20'
                  : 'border-line bg-surface text-ink-700 hover:bg-surface-muted/50',
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-extrabold">
                <FlaskConical className="size-4 text-indigo-600" />
                <span>Simpan Konsep / Uji Coba</span>
              </div>
              <p className="text-[11px] opacity-85 leading-snug">
                Aman untuk coba-coba resep &amp; hitung modal dulu. <strong>Belum muncul di layar Kasir</strong>. Harga jual boleh Rp 0.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setStatus('PUBLISHED')}
              className={cn(
                'rounded-xl border p-3.5 text-left transition-all space-y-1',
                status === 'PUBLISHED'
                  ? 'border-emerald-600 bg-emerald-50/80 text-emerald-950 ring-2 ring-emerald-500/20'
                  : 'border-line bg-surface text-ink-700 hover:bg-surface-muted/50',
              )}
            >
              <div className="flex items-center gap-1.5 text-xs font-extrabold">
                <Rocket className="size-4 text-emerald-600" />
                <span>Tayangkan di Layar Kasir (Siap Dijual)</span>
              </div>
              <p className="text-[11px] opacity-85 leading-snug">
                Menu resmi dijual dan langsung muncul di layar Kasir cabang terkait. Wajib isi Harga Jual lebih dari Rp 0.
              </p>
            </button>
          </div>

          {/* Pricing & Target Modal Bahan Simulator */}
          <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/40 to-amber-50/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-ink-900 flex items-center gap-1.5">
                <Calculator className="size-4 text-brand-700" />
                Harga Jual &amp; Target Batas Modal Bahan
              </span>
              {editingItem && (
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAvailable}
                    onChange={(e) => setIsAvailable(e.target.checked)}
                    className="rounded border-line text-brand-600"
                  />
                  <span>Menu Tersedia (Hilangkan centang jika sedang Habis)</span>
                </label>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div>
                <label htmlFor="target-fc-input" className="block text-[11px] font-semibold text-ink-600 mb-1">
                  Target Batas Modal Bahan (%)
                </label>
                <NumberInput
                  id="target-fc-input"
                  min={5}
                  max={95}
                  value={targetFoodCostPct}
                  onChange={setTargetFoodCostPct}
                  className="rounded-xl border-line bg-surface px-3 py-2 text-sm font-bold tabular text-ink-900"
                />
              </div>

              <div>
                <label htmlFor="selling-price-input" className="block text-[11px] font-semibold text-ink-600 mb-1">
                  Harga Jual Menu (Rp) {status === 'PUBLISHED' && <span className="text-red-500">*</span>}
                </label>
                <NumberInput
                  id="selling-price-input"
                  min={0}
                  value={sellingPrice}
                  onChange={setSellingPrice}
                  className="rounded-xl border-line bg-surface px-3 py-2 text-sm font-extrabold tabular text-ink-900"
                />
              </div>

              <div className="rounded-xl bg-surface p-2.5 border border-line/80 text-xs">
                {currentHpa > 0 ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-ink-500">Modal Resep (HPA):</span>
                      <span className="font-bold text-amber-800 tabular">{formatRupiah(currentHpa)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSellingPrice(recommended.roundedThousand)}
                      className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white py-1 px-2 text-[11px] font-bold flex items-center justify-center gap-1 transition-colors"
                    >
                      <Sparkles className="size-3" />
                      Pakai Saran {formatRupiah(recommended.roundedThousand)}
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] text-ink-500 leading-snug">
                    Racik takaran bahan setelah ini untuk melihat <strong>Modal Resep &amp; Saran Harga Jual</strong> otomatis.
                  </p>
                )}
              </div>
            </div>

            <p className="text-[11px] text-ink-500">
              Patokan batas modal sehat restoran: <strong>Makan Besar 35&ndash;40%</strong>, <strong>Camilan 25&ndash;30%</strong>, <strong>Minuman 20&ndash;25%</strong> dari harga jual.
            </p>

            {currentHpa > 0 && sellingPrice > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-brand-200/60 text-xs">
                <span className="text-ink-600">
                  Untung Kotor per Porsi:{' '}
                  <strong className={projectedMargin >= 0 ? 'text-emerald-800' : 'text-red-700'}>
                    {formatRupiah(projectedMargin)} / porsi
                  </strong>
                </span>
                <span className="text-ink-600">
                  Persentase Modal Bahan:{' '}
                  <strong
                    className={
                      projectedFoodCostPct <= targetFoodCostPct ? 'text-emerald-800' : 'text-amber-800'
                    }
                  >
                    {projectedFoodCostPct.toFixed(1)}%
                  </strong>{' '}
                  (Target &le; {targetFoodCostPct}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-line bg-surface-muted/40 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Batal
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting}
              className="text-xs font-semibold"
            >
              {isSubmitting ? (
                <RefreshCw className="size-3.5 animate-spin mr-1.5" />
              ) : (
                <Save className="size-3.5 mr-1.5" />
              )}
              {editingItem ? 'Simpan Perubahan Menu' : 'Simpan Info Menu Saja'}
            </Button>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleSubmit(true)}
              disabled={isSubmitting}
              className="text-xs font-bold bg-brand-700 hover:bg-brand-800 text-white px-4"
            >
              <Layers className="size-3.5 mr-1.5" />
              {editingItem ? 'Simpan & Buka Takaran Resep →' : '+ Simpan & Racik Takaran Resep →'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
