import {
  AlertCircle,
  Box,
  Calculator,
  Info,
  Package,
  RefreshCw,
  Save,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  createMasterIngredient,
  fetchIngredientCategories,
  updateMasterIngredient,
} from './menu-api'
import type {
  InventoryCategory,
  MasterIngredient,
  SaveMasterIngredientRequest,
} from './types'
import { BASE_INGREDIENT_UNITS, formatRupiah, isUnitInGroups } from './uom-helpers'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { NumberInput } from '@/shared/ui/NumberInput'

interface IngredientFormModalProps {
  isOpen: boolean
  editingIngredient: MasterIngredient | null
  categories?: InventoryCategory[]
  zIndexClass?: string
  onClose: () => void
  onSaved: (saved: MasterIngredient) => void
}

export function IngredientFormModal(props: IngredientFormModalProps) {
  if (!props.isOpen) return null
  const content = (
    <IngredientFormModalContent
      key={props.editingIngredient?.id ?? 'new-ingredient'}
      {...props}
    />
  )
  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }
  return content
}

function IngredientFormModalContent({
  editingIngredient,
  categories,
  zIndexClass = 'z-50',
  onClose,
  onSaved,
}: IngredientFormModalProps) {
  const hasPackPricing = Boolean(
    editingIngredient?.purchase_pack_qty &&
      editingIngredient.purchase_pack_qty > 0 &&
      editingIngredient.purchase_pack_price !== undefined,
  )
  const initialStorage = editingIngredient?.storage_type?.toUpperCase()
  const initialUnit = editingIngredient?.unit || (editingIngredient ? 'kg' : 'ml')
  const initialIsCustomUnit = Boolean(
    editingIngredient?.unit && !isUnitInGroups(editingIngredient.unit, BASE_INGREDIENT_UNITS),
  )

  const [fetchedCategories, setFetchedCategories] = useState<InventoryCategory[]>([])
  const availableCategories =
    categories && categories.length > 0 ? categories : fetchedCategories

  const [name, setName] = useState(editingIngredient?.name ?? '')
  const [code, setCode] = useState(editingIngredient?.code ?? '')
  const [useCustomCategory, setUseCustomCategory] = useState(
    editingIngredient ? false : Boolean(categories && categories.length === 0),
  )
  const [categoryId, setCategoryId] = useState(
    editingIngredient?.category_id || categories?.[0]?.id || '',
  )
  const [customCategoryName, setCustomCategoryName] = useState('')
  const [storageType, setStorageType] = useState<'DRY' | 'CHILLER' | 'FREEZER'>(
    initialStorage === 'CHILLER' || initialStorage === 'FREEZER' ? initialStorage : 'DRY',
  )
  const [useCustomUnit, setUseCustomUnit] = useState(initialIsCustomUnit)
  const [unit, setUnit] = useState(initialUnit)

  useEffect(() => {
    if (categories && categories.length > 0) return
    let active = true
    fetchIngredientCategories()
      .then((cats) => {
        if (!active) return
        setFetchedCategories(cats)
        if (cats.length === 0 && !editingIngredient) {
          setUseCustomCategory(true)
        }
      })
      .catch(() => {
        if (active && !editingIngredient) {
          setUseCustomCategory(true)
        }
      })
    return () => {
      active = false
    }
  }, [categories, editingIngredient])

  // Pricing Mode: 'PACK' (Kemasan Beli -> Satuan Dasar) vs 'DIRECT' (Langsung per Satuan Dasar)
  const [pricingMode, setPricingMode] = useState<'PACK' | 'DIRECT'>(
    editingIngredient ? (hasPackPricing ? 'PACK' : 'DIRECT') : 'PACK',
  )
  const [purchaseUnit, setPurchaseUnit] = useState(
    editingIngredient
      ? editingIngredient.purchase_unit ?? 'Kemasan'
      : 'Botol / Pack',
  )
  const [purchasePackQty, setPurchasePackQty] = useState<number>(
    hasPackPricing && editingIngredient?.purchase_pack_qty
      ? editingIngredient.purchase_pack_qty
      : 1000,
  )
  const [purchasePackPrice, setPurchasePackPrice] = useState<number>(
    hasPackPricing && editingIngredient?.purchase_pack_price !== undefined
      ? editingIngredient.purchase_pack_price
      : 0,
  )
  const [directCostPrice, setDirectCostPrice] = useState<number>(
    editingIngredient?.cost_price ?? 0,
  )

  const [standardYieldPercent, setStandardYieldPercent] = useState<number>(
    editingIngredient?.standard_yield_percent || 100,
  )
  const [minStockAlert, setMinStockAlert] = useState<number>(
    editingIngredient?.min_stock_alert || 0,
  )

  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const effectiveCategoryId = categoryId || availableCategories[0]?.id || ''
  const cleanUnit = unit.trim() || 'pcs'

  const computedBaseCost =
    pricingMode === 'PACK'
      ? purchasePackQty > 0
        ? Math.round((purchasePackPrice / purchasePackQty) * 10000) / 10000
        : 0
      : directCostPrice

  const computedEffectiveCost =
    standardYieldPercent > 0
      ? Math.round((computedBaseCost / (standardYieldPercent / 100)) * 10000) / 10000
      : computedBaseCost

  const handleSave = async () => {
    setErrorMsg(null)
    if (!name.trim()) {
      setErrorMsg('Nama bahan baku wajib diisi.')
      return
    }
    if (!unit.trim()) {
      setErrorMsg('Satuan pakai di resep wajib diisi (contoh: gram, ml, pcs, ekor, siung).')
      return
    }
    if (useCustomCategory && !customCategoryName.trim()) {
      setErrorMsg('Ketik nama kategori bahan baku baru terlebih dahulu.')
      return
    }
    if (!useCustomCategory && !effectiveCategoryId) {
      setErrorMsg('Pilih kategori bahan baku atau ketik kategori baru.')
      return
    }
    if (pricingMode === 'PACK') {
      if (purchasePackQty <= 0) {
        setErrorMsg('Isi per kemasan beli harus lebih besar dari 0.')
        return
      }
      if (purchasePackPrice < 0) {
        setErrorMsg('Harga beli kemasan tidak boleh negatif.')
        return
      }
    } else if (directCostPrice < 0) {
      setErrorMsg('Harga modal per satuan dasar tidak boleh negatif.')
      return
    }
    if (standardYieldPercent <= 0 || standardYieldPercent > 200) {
      setErrorMsg('Persentase bersih siap masak harus di antara 1% hingga 200%.')
      return
    }

    setIsSaving(true)
    try {
      const payload: SaveMasterIngredientRequest = {
        ...(useCustomCategory
          ? { custom_category_name: customCategoryName.trim() }
          : { category_id: effectiveCategoryId }),
        ...(code.trim() ? { code: code.trim() } : {}),
        name: name.trim(),
        unit: unit.trim().toLowerCase(),
        storage_type: storageType,
        cost_price: computedBaseCost,
        ...(pricingMode === 'PACK'
          ? {
              purchase_unit: purchaseUnit.trim() || 'Kemasan',
              purchase_pack_qty: purchasePackQty,
              purchase_pack_price: purchasePackPrice,
            }
          : {}),
        standard_yield_percent: standardYieldPercent,
        min_stock_alert: minStockAlert >= 0 ? minStockAlert : 0,
      }

      const saved = editingIngredient
        ? await updateMasterIngredient(editingIngredient.id, payload)
        : await createMasterIngredient(payload)

      onSaved(saved)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan bahan baku.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ingredient-modal-title"
      className={cn(
        'fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in',
        zIndexClass,
      )}
    >
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-2xl border border-white/40 bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-line bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-950 text-white">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
              <Package className="size-3.5" />
              <span>Bahan Mentah Dapur &amp; Gudang</span>
            </div>
            <h3 id="ingredient-modal-title" className="text-lg sm:text-xl font-extrabold">
              {editingIngredient
                ? `Ubah Bahan Baku: ${editingIngredient.name}`
                : 'Tambah Bahan Baku Baru'}
            </h3>
            <p className="text-xs text-emerald-100/85">
              Otomatis masuk ke daftar stok gudang dan menghitung modal eceran (per gram, ml, atau potong) dari harga kemasan beli.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Tutup modal bahan baku"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {errorMsg && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-800 flex items-start gap-2.5">
              <AlertCircle className="size-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
            <div className="sm:col-span-8">
              <label htmlFor="ing-name-input" className="block text-xs font-semibold text-ink-700 mb-1">
                Nama Bahan Baku <span className="text-red-500">*</span>
              </label>
              <input
                id="ing-name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Sirup Lychee Monin, Susu Segar, Kentang Goreng..."
                className="w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-semibold text-ink-900 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-xs font-semibold text-ink-700 mb-1">
                Kode Bahan <span className="text-[10px] font-normal text-ink-400">(Otomatis)</span>
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Otomatis dibuat..."
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-mono text-ink-800 focus:border-brand-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-5">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-ink-700">
                  Kategori Bahan <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setUseCustomCategory((prev) => !prev)}
                  className="text-[11px] font-bold text-brand-700 hover:text-brand-900 underline"
                >
                  {useCustomCategory ? 'Pilih Kategori Ada' : '+ Ketik Kategori Baru'}
                </button>
              </div>
              {useCustomCategory ? (
                <input
                  type="text"
                  value={customCategoryName}
                  onChange={(e) => setCustomCategoryName(e.target.value)}
                  placeholder="Contoh: Bahan Kopi & Bar..."
                  className="w-full rounded-xl border border-brand-400 bg-brand-50/30 px-3 py-2 text-xs font-semibold text-ink-900 focus:border-brand-600 focus:outline-none"
                />
              ) : (
                <select
                  value={effectiveCategoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-900 focus:border-brand-500 focus:outline-none"
                >
                  <option value="">-- Pilih Kategori Bahan --</option>
                  {availableCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.item_count} bahan)
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-semibold text-ink-700 mb-1">
                Tempat Simpan
              </label>
              <select
                value={storageType}
                onChange={(e) =>
                  setStorageType(e.target.value as 'DRY' | 'CHILLER' | 'FREEZER')
                }
                className="w-full rounded-xl border border-line bg-surface px-2.5 py-2 text-xs font-semibold text-ink-900"
              >
                <option value="DRY">📦 Gudang Kering (Suhu Ruang)</option>
                <option value="CHILLER">❄️ Pendingin (Chiller)</option>
                <option value="FREEZER">🧊 Pembeku (Freezer)</option>
              </select>
            </div>

            <div className="sm:col-span-4">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="ing-base-unit" className="text-xs font-semibold text-ink-700">
                  Satuan Pakai <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUseCustomUnit((prev) => {
                      const next = !prev
                      if (!next && !isUnitInGroups(unit, BASE_INGREDIENT_UNITS)) {
                        setUnit('g')
                      }
                      return next
                    })
                  }}
                  className="text-[11px] font-bold text-brand-700 hover:text-brand-900 underline"
                >
                  {useCustomUnit ? 'Pilih Satuan Umum' : '+ Ketik Satuan Sendiri'}
                </button>
              </div>
              {useCustomUnit ? (
                <input
                  id="ing-base-unit"
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Ketik bebas: ekor, siung, loyang, papan..."
                  className="w-full rounded-xl border border-brand-400 bg-brand-50/30 px-3 py-2 text-xs font-bold text-ink-900 focus:border-brand-600 focus:outline-none"
                />
              ) : (
                <select
                  id="ing-base-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-2.5 py-2 text-xs font-bold text-ink-900"
                >
                  {BASE_INGREDIENT_UNITS.map((grp) => (
                    <optgroup key={grp.group} label={grp.group}>
                      {grp.options.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Human-Friendly Pack-to-Base Cost Calculator */}
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <Calculator className="size-4 text-emerald-700" />
                Cara Hitung Harga Modal Bahan
              </span>
              <div className="flex items-center rounded-lg bg-white p-0.5 border border-emerald-200 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPricingMode('PACK')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-bold transition-all',
                    pricingMode === 'PACK'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-ink-600 hover:text-ink-900',
                  )}
                >
                  <Box className="size-3 inline mr-1" />
                  Hitung dari Kemasan Beli
                </button>
                <button
                  type="button"
                  onClick={() => setPricingMode('DIRECT')}
                  className={cn(
                    'px-2.5 py-1 rounded-md font-bold transition-all',
                    pricingMode === 'DIRECT'
                      ? 'bg-emerald-700 text-white shadow-2xs'
                      : 'text-ink-600 hover:text-ink-900',
                  )}
                >
                  Isi Langsung per {cleanUnit}
                </button>
              </div>
            </div>

            {pricingMode === 'PACK' ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-ink-700 mb-1">
                    Nama Kemasan Beli
                  </label>
                  <input
                    type="text"
                    value={purchaseUnit}
                    onChange={(e) => setPurchaseUnit(e.target.value)}
                    placeholder="Botol / Jerigen / Bungkus / Karung"
                    className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-900"
                  />
                </div>
                <div>
                  <label htmlFor="ing-pack-qty" className="block text-[11px] font-semibold text-ink-700 mb-1">
                    Isi 1 Kemasan (dalam {cleanUnit})
                  </label>
                  <NumberInput
                    id="ing-pack-qty"
                    min={0.001}
                    value={purchasePackQty}
                    onChange={setPurchasePackQty}
                    className="rounded-xl border-line bg-surface px-3 py-2 text-xs font-extrabold tabular text-ink-900"
                  />
                </div>
                <div>
                  <label htmlFor="ing-pack-price" className="block text-[11px] font-semibold text-ink-700 mb-1">
                    Harga Beli 1 Kemasan (Rp)
                  </label>
                  <NumberInput
                    id="ing-pack-price"
                    min={0}
                    value={purchasePackPrice}
                    onChange={setPurchasePackPrice}
                    className="rounded-xl border-line bg-surface px-3 py-2 text-xs font-extrabold tabular text-ink-900"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label htmlFor="ing-direct-cost" className="block text-[11px] font-semibold text-ink-700 mb-1">
                  Harga Modal Beli per 1 {cleanUnit} (Rp)
                </label>
                <NumberInput
                  id="ing-direct-cost"
                  min={0}
                  value={directCostPrice}
                  onChange={setDirectCostPrice}
                  className="rounded-xl border-line bg-surface px-3 py-2 text-sm font-extrabold tabular text-ink-900"
                />
              </div>
            )}

            {/* Yield % & Minimum Stock */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-emerald-200/70">
              <div>
                <label htmlFor="ing-yield-pct" className="block text-[11px] font-semibold text-ink-700 mb-1">
                  Persentase Bersih Siap Masak (%) <span className="text-[10px] font-normal text-ink-500">(100% jika tanpa kupas/susut)</span>
                </label>
                <NumberInput
                  id="ing-yield-pct"
                  min={1}
                  max={200}
                  value={standardYieldPercent}
                  onChange={setStandardYieldPercent}
                  className="rounded-xl border-line bg-surface px-3 py-1.5 text-xs font-bold tabular text-ink-900"
                />
              </div>
              <div>
                <label htmlFor="ing-min-stock" className="block text-[11px] font-semibold text-ink-700 mb-1">
                  Batas Peringatan Stok Menipis ({cleanUnit})
                </label>
                <NumberInput
                  id="ing-min-stock"
                  min={0}
                  value={minStockAlert}
                  onChange={setMinStockAlert}
                  className="rounded-xl border-line bg-surface px-3 py-1.5 text-xs font-bold tabular text-ink-900"
                />
              </div>
            </div>

            {/* Live Computed Base Cost & Net Cost Banner */}
            <div className="rounded-xl bg-white border border-emerald-300 p-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-ink-400 block">
                  Harga Beli per {cleanUnit}
                </span>
                <span className="text-base font-black text-ink-900 tabular">
                  {formatRupiah(computedBaseCost, 2)} / {cleanUnit}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 block">
                  Modal Bersih Siap Masak ({standardYieldPercent}% bersih)
                </span>
                <span className="text-base font-black text-emerald-800 tabular">
                  {formatRupiah(computedEffectiveCost, 2)} / {cleanUnit}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-ink-500 bg-surface-muted/60 p-3 rounded-xl border border-line">
            <Info className="size-4 text-brand-600 shrink-0 mt-0.5" />
            <span>
              <strong>Update Modal Otomatis:</strong> Setiap kali harga beli bahan ini berubah (baik diubah di sini maupun saat terima belanja gudang), modal seluruh saus racikan dan menu yang memakai bahan ini langsung ikut terhitung ulang otomatis.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-line bg-surface-muted/40 flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
            Batal
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white px-5"
          >
            {isSaving ? (
              <>
                <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                Menyimpan...
              </>
            ) : (
              <>
                <Save className="size-3.5 mr-1.5" />
                {editingIngredient ? 'Simpan & Perbarui Modal Menu' : 'Simpan Bahan Baku Baru'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
