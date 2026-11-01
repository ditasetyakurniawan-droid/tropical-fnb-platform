import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Calculator,
  Layers,
  Leaf,
  Package,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { IngredientFormModal } from './IngredientFormModal'
import { createSubRecipe, fetchBOMOptions, updateSubRecipe } from './menu-api'
import type {
  BOMOptionsResponse,
  MasterIngredient,
  SaveRecipeIngredientInput,
  SaveRecipeRequest,
  SubRecipeDetail,
} from './types'
import {
  HUMAN_UNIT_GROUPS,
  convertClientUoMFactor,
  formatRupiah,
  isUnitInGroups,
} from './uom-helpers'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { NumberInput } from '@/shared/ui/NumberInput'

interface SubRecipeFormModalProps {
  isOpen: boolean
  editingSubRecipe: SubRecipeDetail | null
  zIndexClass?: string
  onClose: () => void
  onSaved: (saved: SubRecipeDetail) => void
}

interface SubRecipeRowState {
  key: string
  sourceType: 'INVENTORY' | 'SUB_RECIPE'
  inventory_item_id: string
  sub_recipe_id: string
  cost_basis: 'EP_YIELDED' | 'AP_RAW'
  quantity: number
  unit: string
  yield_percent_applied: number
}

export function SubRecipeFormModal(props: SubRecipeFormModalProps) {
  if (!props.isOpen) return null
  const content = (
    <SubRecipeFormModalContent
      key={props.editingSubRecipe?.id ?? 'new-sub-recipe'}
      {...props}
    />
  )
  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }
  return content
}

function SubRecipeFormModalContent({
  editingSubRecipe,
  zIndexClass = 'z-50',
  onClose,
  onSaved,
}: SubRecipeFormModalProps) {
  const queryClient = useQueryClient()
  const [bomOptions, setBomOptions] = useState<BOMOptionsResponse>({
    inventory_items: [],
    sub_recipes: [],
  })
  const [recipeName, setRecipeName] = useState(editingSubRecipe?.name ?? '')
  const [recipeCode, setRecipeCode] = useState(editingSubRecipe?.code ?? '')
  const [yieldPortions, setYieldPortions] = useState<number>(
    editingSubRecipe ? editingSubRecipe.yield_portions || 1 : 1000,
  )
  const initialYieldUnit = editingSubRecipe?.yield_unit || 'ml'
  const [useCustomYieldUnit, setUseCustomYieldUnit] = useState<boolean>(
    Boolean(editingSubRecipe?.yield_unit && !isUnitInGroups(editingSubRecipe.yield_unit, HUMAN_UNIT_GROUPS)),
  )
  const [yieldUnit, setYieldUnit] = useState<string>(initialYieldUnit)
  const [instructions, setInstructions] = useState(
    editingSubRecipe?.instructions ?? '',
  )
  const [rows, setRows] = useState<SubRecipeRowState[]>(() => {
    if (editingSubRecipe?.ingredients && editingSubRecipe.ingredients.length > 0) {
      return editingSubRecipe.ingredients.map((ing, idx) => ({
        key: `sub-ing-${idx}-${ing.id}`,
        sourceType: ing.is_sub_recipe ? 'SUB_RECIPE' : 'INVENTORY',
        inventory_item_id: ing.inventory_id ?? '',
        sub_recipe_id: ing.sub_recipe_id ?? '',
        cost_basis: ing.cost_basis ?? 'EP_YIELDED',
        quantity: ing.quantity,
        unit: ing.unit,
        yield_percent_applied: ing.yield_percent_applied || 100,
      }))
    }
    return [
      {
        key: 'sub-row-init-0',
        sourceType: 'INVENTORY',
        inventory_item_id: '',
        sub_recipe_id: '',
        cost_basis: 'EP_YIELDED',
        quantity: 100,
        unit: 'g',
        yield_percent_applied: 100,
      },
    ]
  })

  const [confirmRemoveRowKey, setConfirmRemoveRowKey] = useState<string | null>(null)
  const [isQuickIngOpen, setIsQuickIngOpen] = useState(false)
  const [quickIngTargetRowIdx, setQuickIngTargetRowIdx] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    fetchBOMOptions()
      .then((opts) => {
        if (mounted) setBomOptions(opts)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const handleQuickIngredientSaved = (saved: MasterIngredient) => {
    setIsQuickIngOpen(false)
    setBomOptions((prev) => ({
      ...prev,
      inventory_items: [
        ...prev.inventory_items.filter((i) => i.id !== saved.id),
        {
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
        },
      ],
    }))
    fetchBOMOptions()
      .then((opts) => setBomOptions(opts))
      .catch(() => {})
    void queryClient.invalidateQueries({ queryKey: ['master-ingredients'] })
    void queryClient.invalidateQueries({ queryKey: ['ingredient-categories'] })

    setRows((prev) => {
      if (quickIngTargetRowIdx !== null && prev[quickIngTargetRowIdx]) {
        const next = [...prev]
        const curr = next[quickIngTargetRowIdx]!
        next[quickIngTargetRowIdx] = {
          ...curr,
          sourceType: 'INVENTORY',
          inventory_item_id: saved.id,
          sub_recipe_id: '',
          unit: saved.unit || 'g',
          yield_percent_applied: saved.standard_yield_percent || 100,
        }
        return next
      }
      const emptyIdx = prev.findIndex(
        (r) => r.sourceType === 'INVENTORY' && !r.inventory_item_id,
      )
      if (emptyIdx >= 0 && prev[emptyIdx]) {
        const next = [...prev]
        const curr = next[emptyIdx]!
        next[emptyIdx] = {
          ...curr,
          inventory_item_id: saved.id,
          unit: saved.unit || 'g',
          yield_percent_applied: saved.standard_yield_percent || 100,
        }
        return next
      }
      return [
        ...prev,
        {
          ...createBlankRow(),
          sourceType: 'INVENTORY',
          inventory_item_id: saved.id,
          unit: saved.unit || 'g',
          yield_percent_applied: saved.standard_yield_percent || 100,
        },
      ]
    })
    setQuickIngTargetRowIdx(null)
  }

  const selectableSubRecipes = useMemo(() => {
    if (!editingSubRecipe) return bomOptions.sub_recipes
    return bomOptions.sub_recipes.filter((s) => s.id !== editingSubRecipe.id)
  }, [bomOptions.sub_recipes, editingSubRecipe])

  const calculatedRows = useMemo(() => {
    return rows.map((row) => {
      let unitCost = 0
      let subtotal = 0
      let baseUnit = row.unit
      let incompatibleUnit = false

      if (row.sourceType === 'INVENTORY' && row.inventory_item_id) {
        const item = bomOptions.inventory_items.find((i) => i.id === row.inventory_item_id)
        if (item) {
          baseUnit = item.unit
          const factor = convertClientUoMFactor(
            row.unit,
            item.unit,
            item.yield_output_unit,
            item.yield_conversion_ratio,
          )
          if (factor === null) {
            incompatibleUnit = true
          } else if (row.cost_basis === 'AP_RAW') {
            unitCost = item.cost_price * factor
            subtotal = row.quantity * unitCost
          } else {
            const appliedYield =
              row.yield_percent_applied > 0
                ? row.yield_percent_applied
                : item.standard_yield_percent || 100
            const effectiveBase = item.cost_price / (appliedYield / 100)
            unitCost = effectiveBase * factor
            subtotal = row.quantity * unitCost
          }
        }
      } else if (row.sourceType === 'SUB_RECIPE' && row.sub_recipe_id) {
        const sub = selectableSubRecipes.find((s) => s.id === row.sub_recipe_id)
        if (sub) {
          baseUnit = sub.yield_unit
          const factor = convertClientUoMFactor(row.unit, sub.yield_unit)
          if (factor === null) {
            incompatibleUnit = true
          } else {
            unitCost = sub.cost_per_portion * factor
            subtotal = row.quantity * unitCost
          }
        }
      }

      return {
        baseUnit,
        unitCost: Math.round(unitCost * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        incompatibleUnit,
      }
    })
  }, [rows, bomOptions.inventory_items, selectableSubRecipes])

  const liveBatchTotal = calculatedRows.reduce((acc, r) => acc + r.subtotal, 0)
  const liveCostPerUnit = yieldPortions > 0 ? liveBatchTotal / yieldPortions : 0

  const handleUpdateRow = (idx: number, patch: Partial<SubRecipeRowState>) => {
    setRows((prev) => {
      const curr = prev[idx]
      if (!curr) return prev
      const next = [...prev]
      next[idx] = { ...curr, ...patch }
      return next
    })
  }

  const handleAddRow = () => {
    setRows((prev) => [...prev, createBlankRow()])
  }

  const handleRequestRemoveRow = (idx: number, row: SubRecipeRowState) => {
    if (rows.length <= 1) return
    const hasSelection = Boolean(row.inventory_item_id || row.sub_recipe_id)
    if (!hasSelection) {
      setRows((prev) => prev.filter((_, i) => i !== idx))
      return
    }
    if (confirmRemoveRowKey !== row.key) {
      setConfirmRemoveRowKey(row.key)
      return
    }
    setConfirmRemoveRowKey(null)
    setRows((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    setErrorMsg(null)
    if (!recipeName.trim()) {
      setErrorMsg('Nama Saus / Bumbu / Biang Racikan wajib diisi.')
      return
    }
    if (yieldPortions <= 0) {
      setErrorMsg('Jumlah hasil 1 kali masak harus lebih besar dari 0.')
      return
    }
    if (!yieldUnit.trim()) {
      setErrorMsg('Pilih satuan hasil masak (contoh: ml, liter, kg, g, porsi, pcs).')
      return
    }
    if (rows.length === 0) {
      setErrorMsg('Tambahkan minimal 1 bahan baku penyusun racikan.')
      return
    }

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const calc = calculatedRows[i]
      if (!r) continue
      if (r.sourceType === 'INVENTORY' && !r.inventory_item_id) {
        setErrorMsg(`Pilih bahan mentah pada baris ke-${i + 1}.`)
        return
      }
      if (r.sourceType === 'SUB_RECIPE' && !r.sub_recipe_id) {
        setErrorMsg(`Pilih racikan dapur pada baris ke-${i + 1}.`)
        return
      }
      if (r.quantity <= 0) {
        setErrorMsg(`Takaran pada baris ke-${i + 1} harus lebih besar dari 0.`)
        return
      }
      if (calc?.incompatibleUnit) {
        setErrorMsg(
          `Satuan "${r.unit}" pada baris ke-${i + 1} tidak cocok dengan satuan dasar bahan (misal berat vs cairan).`,
        )
        return
      }
    }

    setIsSaving(true)
    try {
      const payload: SaveRecipeRequest = {
        ...(recipeCode.trim() ? { recipe_code: recipeCode.trim() } : {}),
        recipe_name: recipeName.trim(),
        yield_portions: yieldPortions,
        yield_unit: yieldUnit,
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ingredients: rows.map((r) => {
          const item: SaveRecipeIngredientInput = {
            cost_basis: r.cost_basis,
            quantity: r.quantity,
            unit: r.unit,
            yield_percent_applied: r.yield_percent_applied,
          }
          if (r.sourceType === 'INVENTORY') {
            item.inventory_item_id = r.inventory_item_id
          } else {
            item.sub_recipe_id = r.sub_recipe_id
          }
          return item
        }),
      }

      const saved = editingSubRecipe
        ? await updateSubRecipe(editingSubRecipe.id, payload)
        : await createSubRecipe(payload)

      onSaved(saved)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menyimpan racikan dapur.')
    } finally {
      setIsSaving(false)
    }
  }

  const cleanYieldUnit = yieldUnit.trim() || 'porsi'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="subrecipe-modal-title"
      className={cn(
        'fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in',
        zIndexClass,
      )}
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-white/40 bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-5 sm:p-6 border-b border-line bg-gradient-to-r from-amber-950 via-amber-900 to-orange-900 text-white">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-200">
              <Sparkles className="size-3.5" />
              <span>Racikan Dapur Setengah Jadi (Saus, Bumbu &amp; Biang)</span>
            </div>
            <h3 id="subrecipe-modal-title" className="text-lg sm:text-xl font-extrabold">
              {editingSubRecipe
                ? `Ubah Racikan: ${editingSubRecipe.name}`
                : 'Buat Saus / Bumbu / Biang Racikan Baru'}
            </h3>
            <p className="text-xs text-amber-100/85">
              Contoh: Saus Jamur 2.000 ml, Biang Gula Aren 5 liter, Bumbu Oles Bakar 3 kg. Modal eceran per ml, gram, atau porsi dihitung otomatis!
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-amber-200 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Tutup modal racikan"
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

          {/* Batch Header */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-4 rounded-xl bg-amber-50/40 border border-amber-200/80">
            <div className="sm:col-span-5">
              <label htmlFor="sub-name-input" className="block text-xs font-semibold text-ink-800 mb-1">
                Nama Saus / Bumbu / Biang <span className="text-red-500">*</span>
              </label>
              <input
                id="sub-name-input"
                type="text"
                value={recipeName}
                onChange={(e) => setRecipeName(e.target.value)}
                placeholder="Contoh: Biang Sirup Gula Aren Pandan"
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-900 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-ink-800 mb-1">
                Kode <span className="text-[10px] font-normal text-ink-400">(Opsional)</span>
              </label>
              <input
                type="text"
                value={recipeCode}
                onChange={(e) => setRecipeCode(e.target.value)}
                placeholder="Otomatis..."
                className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-xs font-mono text-ink-800 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="sub-yield-qty" className="block text-xs font-semibold text-ink-800 mb-1">
                Hasil 1x Masak <span className="text-red-500">*</span>
              </label>
              <NumberInput
                id="sub-yield-qty"
                min={0.01}
                value={yieldPortions}
                onChange={setYieldPortions}
                className="rounded-xl border-line bg-surface px-3 py-2 text-xs font-extrabold tabular text-ink-900 focus:border-amber-600 focus:ring-amber-600"
              />
            </div>

            <div className="sm:col-span-3">
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-ink-800">
                  Satuan Hasil <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setUseCustomYieldUnit((prev) => {
                      const next = !prev
                      if (!next && !isUnitInGroups(yieldUnit, HUMAN_UNIT_GROUPS)) {
                        setYieldUnit('ml')
                      }
                      return next
                    })
                  }}
                  className="text-[10px] font-bold text-amber-800 hover:text-amber-950 underline"
                >
                  {useCustomYieldUnit ? 'Pilih Umum' : '+ Ketik Sendiri'}
                </button>
              </div>
              {useCustomYieldUnit ? (
                <input
                  type="text"
                  value={yieldUnit}
                  onChange={(e) => setYieldUnit(e.target.value)}
                  placeholder="toples, loyang, panci..."
                  className="w-full rounded-xl border border-amber-400 bg-white px-2.5 py-2 text-xs font-bold text-ink-900 focus:border-amber-600 focus:outline-none"
                />
              ) : (
                <select
                  value={yieldUnit}
                  onChange={(e) => setYieldUnit(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface px-2.5 py-2 text-xs font-bold text-ink-900 focus:border-amber-600 focus:outline-none"
                >
                  {HUMAN_UNIT_GROUPS.map((grp) => (
                    <optgroup key={grp.group} label={grp.group}>
                      {grp.options.map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.value}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Ingredients List */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink-600 flex items-center gap-1.5">
                <Layers className="size-3.5 text-amber-600" />
                Daftar Bahan untuk 1 Kali Masak ({yieldPortions || 0} {cleanYieldUnit})
              </h4>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setQuickIngTargetRowIdx(null)
                    setIsQuickIngOpen(true)
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 px-2.5 py-1 text-[11px] font-extrabold transition-colors shadow-2xs"
                >
                  <Package className="size-3.5 text-emerald-700" />
                  + Buat Bahan Baku Baru Langsung
                </button>
                <span className="text-[11px] text-ink-400">{rows.length} baris bahan</span>
              </div>
            </div>

            {rows.map((row, idx) => {
              const calc = calculatedRows[idx]
              const isConfirmingRowRemove = confirmRemoveRowKey === row.key
              const customBaseUnit =
                calc?.baseUnit && !isUnitInGroups(calc.baseUnit, HUMAN_UNIT_GROUPS)
                  ? calc.baseUnit
                  : null

              return (
                <div
                  key={row.key}
                  className="rounded-xl border border-line bg-surface p-3.5 space-y-2.5 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line/60">
                    <div className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded bg-amber-100 text-amber-900 text-[11px] font-bold">
                        {idx + 1}
                      </span>
                      <div className="flex items-center rounded-lg bg-surface-muted p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRow(idx, {
                              sourceType: 'INVENTORY',
                              inventory_item_id: '',
                              sub_recipe_id: '',
                              unit: 'g',
                            })
                          }
                          className={cn(
                            'px-2.5 py-1 rounded-md font-semibold transition-all',
                            row.sourceType === 'INVENTORY'
                              ? 'bg-surface text-emerald-900 shadow-2xs font-bold'
                              : 'text-ink-500',
                          )}
                        >
                          <Leaf className="size-3 inline mr-1 text-emerald-600" />
                          Bahan Mentah
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRow(idx, {
                              sourceType: 'SUB_RECIPE',
                              inventory_item_id: '',
                              sub_recipe_id: '',
                              unit: 'ml',
                            })
                          }
                          className={cn(
                            'px-2.5 py-1 rounded-md font-semibold transition-all',
                            row.sourceType === 'SUB_RECIPE'
                              ? 'bg-surface text-amber-900 shadow-2xs font-bold'
                              : 'text-ink-500',
                          )}
                        >
                          <Sparkles className="size-3 inline mr-1 text-amber-600" />
                          Racikan Lain
                        </button>
                      </div>
                    </div>

                    {isConfirmingRowRemove ? (
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleRequestRemoveRow(idx, row)}
                          className="px-2 py-0.5 rounded bg-red-600 text-white text-[11px] font-bold hover:bg-red-700"
                        >
                          Ya, Hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveRowKey(null)}
                          className="px-2 py-0.5 rounded border border-line bg-surface text-ink-700 text-[11px] font-semibold hover:bg-surface-muted"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleRequestRemoveRow(idx, row)}
                        disabled={rows.length <= 1}
                        className="p-1 rounded text-red-500 hover:bg-red-50 disabled:opacity-35 disabled:cursor-not-allowed"
                        title={
                          rows.length <= 1
                            ? 'Minimal harus ada 1 bahan'
                            : 'Hapus baris bahan ini'
                        }
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                    <div className="sm:col-span-5">
                      {row.sourceType === 'INVENTORY' ? (
                        <div className="space-y-1">
                          <select
                            value={row.inventory_item_id}
                            onChange={(e) => {
                              const found = bomOptions.inventory_items.find(
                                (it) => it.id === e.target.value,
                              )
                              handleUpdateRow(idx, {
                                inventory_item_id: e.target.value,
                                unit: found?.unit ?? 'g',
                                yield_percent_applied: found?.standard_yield_percent || 100,
                              })
                            }}
                            className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-900"
                          >
                            <option value="">-- Pilih Bahan Baku Mentah --</option>
                            {bomOptions.inventory_items.map((it) => (
                              <option key={it.id} value={it.id}>
                                {it.name} ({formatRupiah(it.cost_price, 2)}/{it.unit})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              setQuickIngTargetRowIdx(idx)
                              setIsQuickIngOpen(true)
                            }}
                            className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline inline-flex items-center gap-1"
                          >
                            + Belum ada di daftar? Buat Bahan Baku Baru Langsung
                          </button>
                        </div>
                      ) : (
                        <select
                          value={row.sub_recipe_id}
                          onChange={(e) => {
                            const found = selectableSubRecipes.find(
                              (sr) => sr.id === e.target.value,
                            )
                            handleUpdateRow(idx, {
                              sub_recipe_id: e.target.value,
                              unit: found?.yield_unit ?? 'ml',
                            })
                          }}
                          className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-900"
                        >
                          <option value="">-- Pilih Racikan Dapur Lain --</option>
                          {selectableSubRecipes.map((sr) => (
                            <option key={sr.id} value={sr.id}>
                              {sr.name} ({formatRupiah(sr.cost_per_portion, 2)}/{sr.yield_unit})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <NumberInput
                        min={0.001}
                        value={row.quantity}
                        onChange={(val) => handleUpdateRow(idx, { quantity: val })}
                        className="rounded-lg border-line bg-surface px-2.5 py-1.5 text-xs font-bold tabular text-ink-900"
                        placeholder="Takaran"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <select
                        value={row.unit}
                        onChange={(e) => handleUpdateRow(idx, { unit: e.target.value })}
                        className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink-900"
                      >
                        {customBaseUnit && (
                          <optgroup label="Satuan Khusus Resto">
                            <option value={customBaseUnit}>{customBaseUnit}</option>
                          </optgroup>
                        )}
                        {HUMAN_UNIT_GROUPS.map((grp) => (
                          <optgroup key={grp.group} label={grp.group}>
                            {grp.options.map((u) => (
                              <option key={u.value} value={u.value}>
                                {u.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-3 text-right">
                      {calc?.incompatibleUnit ? (
                        <span className="text-[11px] font-bold text-red-600">
                          Satuan tidak cocok dgn {calc.baseUnit}
                        </span>
                      ) : (
                        <>
                          <span className="text-xs font-extrabold text-ink-900 tabular block">
                            {formatRupiah(calc?.subtotal ?? 0)}
                          </span>
                          <span className="text-[10px] text-ink-400">
                            @{formatRupiah(calc?.unitCost ?? 0, 2)}/{row.unit}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddRow}
              className="w-full justify-center border-dashed border-amber-400 text-amber-900 hover:bg-amber-50 text-xs"
            >
              <Plus className="size-3.5 mr-1" />
              + Tambah Bahan Racikan Lainnya
            </Button>
          </div>

          {/* Instructions */}
          <div>
            <label className="block text-xs font-semibold text-ink-700 mb-1">
              Catatan Cara Masak &amp; Penyimpanan <span className="text-[10px] font-normal text-ink-400">(Opsional)</span>
            </label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Contoh: Rebus gula aren & daun pandan 20 menit api kecil, saring, simpan di pendingin maksimal 7 hari..."
              className="w-full rounded-xl border border-line bg-surface p-3 text-xs text-ink-900 focus:border-amber-600 focus:outline-none"
            />
          </div>

          {/* Live Batch Output Summary */}
          <div className="rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50/50 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Calculator className="size-5 text-amber-700" />
              <div>
                <span className="text-xs font-bold text-amber-950 block">
                  Hitungan Modal Racikan (Otomatis)
                </span>
                <span className="text-[11px] text-amber-800">
                  Saat dipakai di resep menu, tinggal takar sesuai satuan <strong>{cleanYieldUnit}</strong> (bisa juga sdm, sdt, ml, liter, gram, kg).
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-right">
              <div>
                <span className="text-[10px] text-amber-800 block">Total Modal 1x Masak</span>
                <span className="text-base font-extrabold text-ink-900 tabular">
                  {formatRupiah(liveBatchTotal)}
                </span>
              </div>
              <div className="pl-4 border-l border-amber-300">
                <span className="text-[10px] text-amber-900 font-semibold block">
                  Modal Eceran per {cleanYieldUnit}
                </span>
                <span className="text-lg font-black text-amber-950 tabular">
                  {formatRupiah(liveCostPerUnit, 2)} / {cleanYieldUnit}
                </span>
              </div>
            </div>
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
            className="text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white px-5"
          >
            {isSaving ? (
              <>
                <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                Menyimpan &amp; Memperbarui Menu...
              </>
            ) : (
              <>
                <Save className="size-3.5 mr-1.5" />
                {editingSubRecipe ? 'Simpan & Perbarui Semua Menu Terkait' : 'Simpan Racikan Baru'}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Inline Quick-Create Raw Ingredient Modal (Stacked on Top) */}
      <IngredientFormModal
        isOpen={isQuickIngOpen}
        editingIngredient={null}
        zIndexClass="z-[70]"
        onClose={() => {
          setIsQuickIngOpen(false)
          setQuickIngTargetRowIdx(null)
        }}
        onSaved={handleQuickIngredientSaved}
      />
    </div>
  )
}

function createBlankRow(): SubRecipeRowState {
  return {
    key: `sub-row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceType: 'INVENTORY',
    inventory_item_id: '',
    sub_recipe_id: '',
    cost_basis: 'EP_YIELDED',
    quantity: 100,
    unit: 'g',
    yield_percent_applied: 100,
  }
}
