import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Citrus,
  Fish,
  Flame,
  Info,
  Layers,
  Package,
  PlusCircle,
  RefreshCw,
  Scale,
  Sparkles,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { IngredientFormModal } from './IngredientFormModal'
import { fetchBOMOptions, recordYieldTest } from './menu-api'
import type {
  ButcheringYieldTest,
  InventoryItemBOMOption,
  MasterIngredient,
} from './types'
import { convertClientUoMFactor } from './uom-helpers'
import { useAuthStore } from '@/features/auth/auth-store'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { NumberInput } from '@/shared/ui/NumberInput'

interface YieldCalculatorCardProps {
  onSuccess?: (test: ButcheringYieldTest) => void
}

type TestCategory = 'GENERAL_YIELD' | 'MEAT_BUTCHERING' | 'POULTRY_FISH' | 'PRODUCE_JUICE'

export function YieldCalculatorCard({ onSuccess }: YieldCalculatorCardProps) {
  const queryClient = useQueryClient()
  const activeOutlet = useAuthStore((s) => s.getActiveOutlet())
  const accessibleOutlets = useAuthStore((s) => s.accessibleOutlets)

  const defaultOutletId = activeOutlet?.id ?? accessibleOutlets[0]?.id ?? ''

  // Default to GENERAL_YIELD ("Semua Bahan") so 100% of restaurant-created ingredients are visible
  const [selectedCategory, setSelectedCategory] = useState<TestCategory>('GENERAL_YIELD')
  const [bomItems, setBomItems] = useState<InventoryItemBOMOption[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string>('')
  const [isQuickIngOpen, setIsQuickIngOpen] = useState(false)

  // Form Inputs (Dynamically adapted to selected ingredient)
  const [initialWeight, setInitialWeight] = useState(5)
  const [costPerUnit, setCostPerUnit] = useState(0)
  const [usableOutput, setUsableOutput] = useState(4)
  const [outputUnit, setOutputUnit] = useState('kg')
  const [wasteAmount, setWasteAmount] = useState(1)
  const [portionSize, setPortionSize] = useState(200)
  const [portionUnit, setPortionUnit] = useState('g')
  const [batchNumber, setBatchNumber] = useState(`SUSUT-${new Date().getFullYear()}-001`)
  const [notes, setNotes] = useState('')
  const [applyToMaster, setApplyToMaster] = useState(true)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const applyItemDefaults = (item: InventoryItemBOMOption) => {
    const baseUnit = item.unit || 'kg'
    const outUnit = item.yield_output_unit || baseUnit
    const stdYield =
      item.standard_yield_percent && item.standard_yield_percent > 0
        ? item.standard_yield_percent
        : 100
    const defaultInitQty = baseUnit === 'g' || baseUnit === 'ml' ? 1000 : 5
    const computedOut =
      outUnit === baseUnit
        ? Math.round(defaultInitQty * (stdYield / 100) * 100) / 100
        : item.yield_conversion_ratio && item.yield_conversion_ratio > 0
          ? Math.round(defaultInitQty * item.yield_conversion_ratio * 100) / 100
          : Math.round(defaultInitQty * (stdYield / 100) * 100) / 100

    setSelectedItemId(item.id)
    setCostPerUnit(item.cost_price)
    setInitialWeight(defaultInitQty)
    setOutputUnit(outUnit)
    setUsableOutput(computedOut)
    setWasteAmount(
      outUnit === baseUnit ? Math.max(0, Math.round((defaultInitQty - computedOut) * 100) / 100) : 0,
    )
    if (outUnit === 'kg') {
      setPortionUnit('g')
      setPortionSize(200)
    } else if (outUnit === 'liter') {
      setPortionUnit('ml')
      setPortionSize(150)
    } else if (outUnit === 'g' || outUnit === 'ml') {
      setPortionUnit(outUnit)
      setPortionSize(100)
    } else {
      setPortionUnit(outUnit)
      setPortionSize(1)
    }
  }

  // Load raw inventory items dynamically from DB
  useEffect(() => {
    let active = true
    fetchBOMOptions()
      .then((opts) => {
        if (!active) return
        setBomItems(opts.inventory_items)
        const first = opts.inventory_items[0]
        if (first) {
          applyItemDefaults(first)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const selectedItem = useMemo(
    () => bomItems.find((i) => i.id === selectedItemId) ?? null,
    [bomItems, selectedItemId],
  )
  const inputUnit = selectedItem?.unit || 'kg'

  // Optional category quick-filter; GENERAL_YIELD shows every single ingredient
  const filteredItems = useMemo(() => {
    if (selectedCategory === 'GENERAL_YIELD') return bomItems
    return bomItems.filter((item) => {
      const code = (item.category_code || '').toUpperCase()
      const catName = (item.category_name || '').toLowerCase()
      const name = item.name.toLowerCase()
      if (selectedCategory === 'MEAT_BUTCHERING') {
        return (
          code.includes('MEAT') ||
          catName.includes('daging') ||
          name.includes('daging') ||
          name.includes('sapi') ||
          name.includes('iga') ||
          name.includes('beef') ||
          name.includes('steak')
        )
      }
      if (selectedCategory === 'POULTRY_FISH') {
        return (
          code.includes('POULTRY') ||
          code.includes('SEAFOOD') ||
          catName.includes('ayam') ||
          catName.includes('ikan') ||
          catName.includes('seafood') ||
          name.includes('ayam') ||
          name.includes('gurame') ||
          name.includes('ikan') ||
          name.includes('udang')
        )
      }
      if (selectedCategory === 'PRODUCE_JUICE') {
        return (
          code.includes('PRODUCE') ||
          code.includes('VEG') ||
          code.includes('FRUIT') ||
          catName.includes('buah') ||
          catName.includes('sayur') ||
          name.includes('jeruk') ||
          name.includes('buah') ||
          name.includes('sayur')
        )
      }
      return true
    })
  }, [bomItems, selectedCategory])

  const handleSelectItem = (itemId: string) => {
    setSelectedItemId(itemId)
    const item = bomItems.find((i) => i.id === itemId)
    if (item) {
      applyItemDefaults(item)
    }
  }

  const handleQuickIngredientSaved = (saved: MasterIngredient) => {
    setIsQuickIngOpen(false)
    const newOpt: InventoryItemBOMOption = {
      id: saved.id,
      code: saved.code,
      name: saved.name,
      unit: saved.unit,
      storage_type: saved.storage_type || 'DRY',
      cost_price: saved.cost_price,
      standard_yield_percent: saved.standard_yield_percent,
      effective_cost_per_unit: saved.effective_cost_per_unit || saved.cost_price,
      category_code: saved.category_code,
      category_name: saved.category_name,
      ...(saved.yield_output_unit ? { yield_output_unit: saved.yield_output_unit } : {}),
      ...(saved.yield_conversion_ratio
        ? { yield_conversion_ratio: saved.yield_conversion_ratio }
        : {}),
    }
    setSelectedCategory('GENERAL_YIELD')
    setBomItems((prev) => [...prev.filter((i) => i.id !== saved.id), newOpt])
    applyItemDefaults(newOpt)
    fetchBOMOptions()
      .then((opts) => setBomItems(opts.inventory_items))
      .catch(() => {})
    void queryClient.invalidateQueries({ queryKey: ['master-ingredients'] })
    void queryClient.invalidateQueries({ queryKey: ['ingredient-categories'] })
  }

  // Live Universal Calculations across any unit pair
  const totalCost = initialWeight * costPerUnit
  const outputToInputFactor = convertClientUoMFactor(outputUnit, inputUnit)
  const yieldPercent = useMemo(() => {
    if (initialWeight <= 0 || usableOutput <= 0) return 0
    if (outputToInputFactor !== null) {
      return ((usableOutput * outputToInputFactor) / initialWeight) * 100
    }
    if (inputUnit === 'kg' && outputUnit === 'ml') {
      return (usableOutput / (initialWeight * 1000)) * 100
    }
    return (usableOutput / initialWeight) * 100
  }, [initialWeight, usableOutput, outputToInputFactor, inputUnit, outputUnit])

  const effectiveCostPerUnit = usableOutput > 0 ? totalCost / usableOutput : 0
  const portionToOutputFactor = convertClientUoMFactor(portionUnit, outputUnit) ?? 1
  const costPerPortion =
    effectiveCostPerUnit * (portionSize > 0 ? portionSize * portionToOutputFactor : 0)
  const estimatedPortions =
    usableOutput > 0 && portionSize > 0 && portionToOutputFactor > 0
      ? usableOutput / (portionSize * portionToOutputFactor)
      : 0

  const costInflationPerUnit =
    outputToInputFactor === 1 ? effectiveCostPerUnit - costPerUnit : 0

  const formatRupiah = (num: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(num)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSaveSuccess(false)
    setSaveError(null)

    if (!selectedItemId) {
      setSaveError('Pilih bahan baku yang dihitung terlebih dahulu.')
      setIsSubmitting(false)
      return
    }

    const backendPortionValue =
      outputUnit === 'kg'
        ? portionSize * (convertClientUoMFactor(portionUnit, 'g') ?? 1)
        : portionSize * portionToOutputFactor

    try {
      const res = await recordYieldTest({
        outlet_id: defaultOutletId,
        item_id: selectedItemId,
        test_type: selectedCategory,
        batch_number: batchNumber,
        initial_weight_kg: initialWeight,
        initial_cost_per_kg: costPerUnit,
        usable_meat_kg:
          outputUnit === 'kg'
            ? usableOutput
            : outputUnit === 'g' || outputUnit === 'ml'
              ? usableOutput / 1000
              : usableOutput,
        output_quantity: usableOutput,
        output_unit: outputUnit,
        waste_fat_kg: wasteAmount,
        usable_trim_kg: 0,
        portion_cut_grams: backendPortionValue,
        notes: notes.trim() || `Uji bersih ${selectedItem?.name ?? 'bahan baku'}`,
        apply_to_master: applyToMaster,
      })
      setSaveSuccess(true)
      onSuccess?.(res)
      setTimeout(() => setSaveSuccess(false), 4000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan hasil hitung susut'
      setSaveError(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  const availableOutputUnits = useMemo(() => {
    const base = ['kg', 'g', 'liter', 'ml', 'pcs', 'porsi']
    if (inputUnit && !base.includes(inputUnit)) base.unshift(inputUnit)
    if (outputUnit && !base.includes(outputUnit)) base.unshift(outputUnit)
    return base
  }, [inputUnit, outputUnit])

  const availablePortionUnits = useMemo(() => {
    const base = ['g', 'kg', 'ml', 'liter', 'pcs', 'porsi']
    if (outputUnit && !base.includes(outputUnit)) base.unshift(outputUnit)
    if (portionUnit && !base.includes(portionUnit)) base.unshift(portionUnit)
    return base
  }, [outputUnit, portionUnit])

  return (
    <Card className="overflow-hidden border border-line/80 shadow-md transition-all hover:shadow-lg">
      {/* Tropical accent header */}
      <div className="bg-gradient-to-r from-amber-600/10 via-brand-600/10 to-teal-600/10 border-b border-line p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm shadow-amber-500/30 animate-tropical-float">
            <Scale className="size-5" aria-hidden />
          </span>
          <div>
            <h3 className="text-base font-bold text-ink-900 flex items-center gap-2">
              Kalkulator Hitung Susut Bahan (Kupas, Potong &amp; Peras)
              <span className="inline-flex items-center gap-1 text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                <Sparkles className="size-3" />
                Semua Jenis Bahan
              </span>
            </h3>
            <p className="text-xs text-ink-500">
              Bebas pilih atau tambah bahan baku apa saja untuk menghitung persentase bersih &amp; modal siap masak secara otomatis.
            </p>
          </div>
        </div>

        {/* Category Filter Pills (Default: Semua Bahan) */}
        <div className="flex flex-wrap items-center gap-1 bg-surface p-1 rounded-xl border border-line text-xs font-semibold">
          <button
            type="button"
            onClick={() => setSelectedCategory('GENERAL_YIELD')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors',
              selectedCategory === 'GENERAL_YIELD'
                ? 'bg-ink-900 text-white shadow-2xs'
                : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            <Layers className="size-3" />
            Semua Bahan ({bomItems.length})
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('MEAT_BUTCHERING')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors',
              selectedCategory === 'MEAT_BUTCHERING'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            <Flame className="size-3" />
            Daging
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('POULTRY_FISH')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors',
              selectedCategory === 'POULTRY_FISH'
                ? 'bg-emerald-700 text-white shadow-2xs'
                : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            <Fish className="size-3" />
            Unggas &amp; Seafood
          </button>

          <button
            type="button"
            onClick={() => setSelectedCategory('PRODUCE_JUICE')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors',
              selectedCategory === 'PRODUCE_JUICE'
                ? 'bg-orange-600 text-white shadow-2xs'
                : 'text-ink-600 hover:bg-ink-100',
            )}
          >
            <Citrus className="size-3" />
            Buah &amp; Sayur
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Inputs Section */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400 flex items-center gap-1.5">
                <Calculator className="size-3.5" />
                Data Timbangan Bahan Mentah
              </h4>
              <button
                type="button"
                onClick={() => setIsQuickIngOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 px-2.5 py-1 text-[11px] font-extrabold transition-colors shadow-2xs"
              >
                <Package className="size-3.5 text-emerald-700" />
                + Buat Bahan Baku Baru Langsung
              </button>
            </div>

            {/* Select Material from Master DB */}
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1">
                Pilih Bahan Baku dari Daftar Gudang
              </label>
              <select
                value={selectedItemId}
                onChange={(e) => handleSelectItem(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-900 focus:border-brand-500 focus:outline-none"
              >
                <option value="">-- Pilih Bahan Baku --</option>
                {filteredItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.code}) — Harga Beli: {formatRupiah(item.cost_price)}/{item.unit}
                  </option>
                ))}
              </select>
            </div>

            {/* Berat Awal & Harga Beli */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="yield-initial-weight" className="block text-xs font-medium text-ink-700 mb-1">
                  Jumlah Beli Awal / Kotor ({inputUnit})
                </label>
                <NumberInput
                  id="yield-initial-weight"
                  min={0.01}
                  value={initialWeight}
                  suffix={inputUnit}
                  onChange={(val) => {
                    setInitialWeight(val)
                    if (outputUnit === inputUnit) {
                      setUsableOutput(Math.max(0, Math.round((val - wasteAmount) * 100) / 100))
                    }
                  }}
                  className="border-line bg-surface px-3 py-1.5 text-sm font-semibold tabular text-ink-900"
                />
              </div>

              <div>
                <label htmlFor="yield-cost-per-unit" className="block text-xs font-medium text-ink-700 mb-1">
                  Harga Beli Kotor (Rp/{inputUnit})
                </label>
                <NumberInput
                  id="yield-cost-per-unit"
                  min={0}
                  value={costPerUnit}
                  onChange={setCostPerUnit}
                  className="border-line bg-surface px-3 py-1.5 text-sm font-semibold tabular text-ink-900"
                />
              </div>
            </div>

            {/* Hasil Bersih Siap Pakai & Satuan */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="yield-usable-output" className="block text-xs font-medium text-emerald-800 mb-1">
                  Hasil Bersih Siap Masak
                </label>
                <NumberInput
                  id="yield-usable-output"
                  min={0}
                  value={usableOutput}
                  onChange={(val) => {
                    setUsableOutput(val)
                    if (outputUnit === inputUnit) {
                      setWasteAmount(Math.max(0, Math.round((initialWeight - val) * 100) / 100))
                    }
                  }}
                  className="border-emerald-300 bg-emerald-50/30 px-3 py-1.5 text-sm font-semibold text-emerald-900 tabular"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Satuan Hasil Bersih
                </label>
                <select
                  value={outputUnit}
                  onChange={(e) => setOutputUnit(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-900 focus:border-brand-500 focus:outline-none"
                >
                  {availableOutputUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Standar Porsi Saji (Flexible NumberInput + Unit Picker) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-5">
                <label htmlFor="yield-portion-size" className="block text-xs font-medium text-ink-700 mb-1">
                  Takaran 1 Porsi Saji
                </label>
                <NumberInput
                  id="yield-portion-size"
                  min={0.01}
                  value={portionSize}
                  onChange={setPortionSize}
                  className="border-line bg-surface px-3 py-1.5 text-sm font-semibold tabular text-ink-900"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Satuan Porsi
                </label>
                <select
                  value={portionUnit}
                  onChange={(e) => setPortionUnit(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-900 focus:border-brand-500 focus:outline-none"
                >
                  {availablePortionUnits.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-4 text-right pb-1">
                <span className="text-[11px] text-ink-400 block">Perkiraan jadi:</span>
                <strong className="text-xs font-extrabold text-brand-700 tabular">
                  {estimatedPortions > 0 ? estimatedPortions.toFixed(1) : '0'} porsi
                </strong>
              </div>
            </div>

            {/* Nomor Catatan & Keterangan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Kode Catatan Uji
                </label>
                <input
                  type="text"
                  value={batchNumber}
                  onChange={(e) => setBatchNumber(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-mono text-ink-900 focus:border-brand-500 focus:outline-none"
                  placeholder="SUSUT-..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  Catatan Kualitas Bahan
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                  placeholder="Catatan kupasan atau kualitas pemasok..."
                />
              </div>
            </div>

            {/* Auto Update Checkbox */}
            <div className="rounded-lg border border-brand-200 bg-brand-50/40 p-3 flex items-start gap-2.5">
              <input
                id="apply-to-master"
                type="checkbox"
                checked={applyToMaster}
                onChange={(e) => setApplyToMaster(e.target.checked)}
                className="size-4 mt-0.5 accent-brand-700 rounded border-line"
              />
              <label htmlFor="apply-to-master" className="text-xs text-brand-950 font-medium cursor-pointer">
                <strong>Simpan ke Bahan Baku &amp; Perbarui Modal Semua Menu Terkait</strong>
                <p className="text-[11px] text-brand-800/80 font-normal mt-0.5">
                  Otomatis menyimpan persentase bersih bahan ini dan menghitung ulang modal seluruh saus racikan serta menu yang memakainya.
                </p>
              </label>
            </div>
          </div>

          {/* Results Display Panel */}
          <div className="flex flex-col justify-between rounded-xl border border-line bg-surface-muted/30 p-4 sm:p-5 relative overflow-hidden">
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Hasil Hitungan Modal Bersih (Otomatis)
              </h4>

              {/* Yield Metric Banner */}
              <div className="flex items-center justify-between rounded-xl bg-surface p-3.5 border border-line shadow-sm">
                <div>
                  <span className="text-xs text-ink-500 block">Persentase Hasil Bersih</span>
                  <span
                    className={cn(
                      'text-3xl font-extrabold tracking-tight tabular',
                      yieldPercent >= 75
                        ? 'text-emerald-700'
                        : yieldPercent >= 50
                          ? 'text-amber-600'
                          : 'text-red-600',
                    )}
                  >
                    {yieldPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-ink-400 block">Kualitas Bahan:</span>
                  <span
                    className={cn(
                      'inline-block px-2.5 py-1 rounded-md text-xs font-semibold',
                      yieldPercent >= 75
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800',
                    )}
                  >
                    {yieldPercent >= 75 ? 'Bagus & Hemat' : 'Banyak Susut (Cek Pemasok)'}
                  </span>
                </div>
              </div>

              {/* Breakdown Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-lg border border-line bg-surface p-3">
                  <span className="text-ink-400 block text-[11px]">Harga Beli Kotor</span>
                  <span className="font-semibold text-ink-700 tabular">
                    {formatRupiah(costPerUnit)} / {inputUnit}
                  </span>
                </div>

                <div className="rounded-lg border border-amber-300 bg-amber-50/40 p-3">
                  <span className="text-amber-800 font-medium block text-[11px]">Modal Bersih Siap Masak</span>
                  <span className="font-bold text-amber-900 tabular text-sm">
                    {formatRupiah(effectiveCostPerUnit)} / {outputUnit}
                  </span>
                  {costInflationPerUnit > 0 && (
                    <span className="text-[10px] text-amber-700 block mt-0.5">
                      (+{formatRupiah(costInflationPerUnit)}/{outputUnit} karena susut kupas/potong)
                    </span>
                  )}
                </div>
              </div>

              {/* Key Output: Cost Per Portion */}
              <div className="rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-brand-100 font-medium">
                    Modal Bahan Bersih per Porsi ({portionSize} {portionUnit})
                  </span>
                  <span className="text-[10px] uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded font-mono">
                    Modal Bersih
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular">
                    {formatRupiah(costPerPortion)}
                  </span>
                  <span className="text-xs text-brand-200">/ porsi saji</span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {saveError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-800 flex items-start gap-1.5 mt-3">
                <AlertCircle className="size-4 text-red-600 shrink-0 mt-0.5" />
                <p>{saveError}</p>
              </div>
            )}

            {/* Save Button */}
            <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between gap-3">
              <span className="text-[11px] text-ink-500 flex items-center gap-1">
                <Info className="size-3 text-ink-400" />
                {applyToMaster
                  ? 'Menyimpan ke bahan & memperbarui modal menu.'
                  : 'Hanya catatan uji coba dapur.'}
              </span>

              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || initialWeight <= 0}
                className="text-xs py-1.5 px-3.5"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin mr-1" />
                    Memproses...
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="size-3.5 text-emerald-300 mr-1" />
                    Berhasil Disimpan!
                  </>
                ) : (
                  <>
                    <PlusCircle className="size-3.5 mr-1" />
                    Simpan Hasil Hitung
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </form>

      <IngredientFormModal
        isOpen={isQuickIngOpen}
        editingIngredient={null}
        zIndexClass="z-[60]"
        onClose={() => setIsQuickIngOpen(false)}
        onSaved={handleQuickIngredientSaved}
      />
    </Card>
  )
}
