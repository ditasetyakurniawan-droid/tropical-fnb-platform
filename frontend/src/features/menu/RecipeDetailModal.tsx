import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Edit3,
  FlaskConical,
  Info,
  Layers,
  Leaf,
  Package,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { IngredientFormModal } from './IngredientFormModal'
import { SubRecipeFormModal } from './SubRecipeFormModal'
import { fetchBOMOptions, saveMenuRecipe } from './menu-api'
import type {
  BOMOptionsResponse,
  MasterIngredient,
  MenuItemDetail,
  MenuItemWithHPA,
  SaveRecipeIngredientInput,
  SaveRecipeRequest,
  SubRecipeDetail,
} from './types'
import {
  HUMAN_UNIT_GROUPS,
  calculateRecommendedSellingPrice,
  convertClientUoMFactor,
  formatRupiah,
  getKitchenStationLabel,
  isUnitInGroups,
} from './uom-helpers'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { NumberInput } from '@/shared/ui/NumberInput'

interface RecipeDetailModalProps {
  detail: MenuItemDetail | null
  initialMode?: 'view' | 'edit'
  onClose: () => void
  onSaved?: (updated: MenuItemDetail) => void
  onEditMenuInfo?: (item: MenuItemWithHPA) => void
}

interface EditableIngredientRow {
  key: string
  sourceType: 'INVENTORY' | 'SUB_RECIPE'
  inventory_item_id: string
  sub_recipe_id: string
  cost_basis: 'EP_YIELDED' | 'AP_RAW'
  quantity: number
  unit: string
  yield_percent_applied: number
}

interface RecipeDetailModalContentProps extends Omit<RecipeDetailModalProps, 'detail'> {
  detail: MenuItemDetail
}

export function RecipeDetailModal(props: RecipeDetailModalProps) {
  if (!props.detail) return null
  const content = (
    <RecipeDetailModalContent
      key={`${props.detail.menu_item.id}-${props.initialMode ?? 'auto'}`}
      {...props}
      detail={props.detail}
    />
  )
  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }
  return content
}

function RecipeDetailModalContent({
  detail,
  initialMode,
  onClose,
  onSaved,
  onEditMenuInfo,
}: RecipeDetailModalContentProps) {
  const queryClient = useQueryClient()
  const hasInitialIngredients = Boolean(detail.ingredients && detail.ingredients.length > 0)
  const [mode, setMode] = useState<'view' | 'edit'>(
    initialMode ?? (hasInitialIngredients ? 'view' : 'edit'),
  )
  const [bomOptions, setBomOptions] = useState<BOMOptionsResponse>({
    inventory_items: [],
    sub_recipes: [],
  })
  const [confirmRemoveRowKey, setConfirmRemoveRowKey] = useState<string | null>(null)
  const [isQuickIngOpen, setIsQuickIngOpen] = useState(false)
  const [quickIngTargetRowIdx, setQuickIngTargetRowIdx] = useState<number | null>(null)
  const [isQuickSubOpen, setIsQuickSubOpen] = useState(false)
  const [quickSubTargetRowIdx, setQuickSubTargetRowIdx] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const [recipeName, setRecipeName] = useState(
    detail.recipe_name || `Resep ${detail.menu_item.name}`,
  )
  const [recipeCode, setRecipeCode] = useState(
    detail.recipe_code || `REC-${detail.menu_item.code}`,
  )
  const [yieldPortions, setYieldPortions] = useState(detail.yield_portions || 1)
  const [yieldUnit, setYieldUnit] = useState(detail.yield_unit || 'porsi')
  const [instructions, setInstructions] = useState(detail.instructions || '')
  const [ingredientRows, setIngredientRows] = useState<EditableIngredientRow[]>(() => {
    if (detail.ingredients && detail.ingredients.length > 0) {
      return detail.ingredients.map((ing, idx) => ({
        key: `ing-${idx}-${ing.id}`,
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
        key: 'row-init-0',
        sourceType: 'INVENTORY',
        inventory_item_id: '',
        sub_recipe_id: '',
        cost_basis: 'EP_YIELDED',
        quantity: 1,
        unit: detail.menu_item.menu_type === 'BEVERAGE' ? 'ml' : 'g',
        yield_percent_applied: 100,
      },
    ]
  })

  // Load ingredient & sub-recipe options whenever modal mounts
  useEffect(() => {
    let isMounted = true
    fetchBOMOptions()
      .then((opts) => {
        if (isMounted) setBomOptions(opts)
      })
      .catch(() => {})
    return () => {
      isMounted = false
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

    setIngredientRows((prev) => {
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
          key: `row-quick-ing-${Date.now()}`,
          sourceType: 'INVENTORY',
          inventory_item_id: saved.id,
          sub_recipe_id: '',
          cost_basis: 'EP_YIELDED',
          quantity: 1,
          unit: saved.unit || 'g',
          yield_percent_applied: saved.standard_yield_percent || 100,
        },
      ]
    })
    setQuickIngTargetRowIdx(null)
  }

  const handleQuickSubRecipeSaved = (saved: SubRecipeDetail) => {
    setIsQuickSubOpen(false)
    setBomOptions((prev) => ({
      ...prev,
      sub_recipes: [
        ...prev.sub_recipes.filter((s) => s.id !== saved.id),
        {
          id: saved.id,
          code: saved.code,
          name: saved.name,
          recipe_type: 'SUB_RECIPE',
          yield_portions: saved.yield_portions,
          yield_unit: saved.yield_unit,
          total_cost_hpa: saved.total_cost_hpa,
          cost_per_portion: saved.cost_per_portion,
        },
      ],
    }))
    fetchBOMOptions()
      .then((opts) => setBomOptions(opts))
      .catch(() => {})
    void queryClient.invalidateQueries({ queryKey: ['sub-recipes'] })

    setIngredientRows((prev) => {
      if (quickSubTargetRowIdx !== null && prev[quickSubTargetRowIdx]) {
        const next = [...prev]
        const curr = next[quickSubTargetRowIdx]!
        next[quickSubTargetRowIdx] = {
          ...curr,
          sourceType: 'SUB_RECIPE',
          inventory_item_id: '',
          sub_recipe_id: saved.id,
          cost_basis: 'EP_YIELDED',
          unit: saved.yield_unit || 'porsi',
          yield_percent_applied: 100,
        }
        return next
      }
      const emptyIdx = prev.findIndex(
        (r) => r.sourceType === 'SUB_RECIPE' && !r.sub_recipe_id,
      )
      if (emptyIdx >= 0 && prev[emptyIdx]) {
        const next = [...prev]
        const curr = next[emptyIdx]!
        next[emptyIdx] = {
          ...curr,
          sub_recipe_id: saved.id,
          unit: saved.yield_unit || 'porsi',
        }
        return next
      }
      return [
        ...prev,
        {
          key: `row-quick-sub-${Date.now()}`,
          sourceType: 'SUB_RECIPE',
          inventory_item_id: '',
          sub_recipe_id: saved.id,
          cost_basis: 'EP_YIELDED',
          quantity: 1,
          unit: saved.yield_unit || 'porsi',
          yield_percent_applied: 100,
        },
      ]
    })
    setQuickSubTargetRowIdx(null)
  }

  // Live client-side calculation of rows in edit mode (supports all human units: kg, ons, g, mg, liter, ml, sdm, sdt, pcs, etc.)
  const calculatedRows = useMemo(() => {
    return ingredientRows.map((row) => {
      let unitCost = 0
      let subtotal = 0
      let grossQty = row.quantity
      let itemName = ''
      let baseUnit = row.unit
      let incompatibleUnit = false

      if (row.sourceType === 'INVENTORY' && row.inventory_item_id) {
        const item = bomOptions.inventory_items.find((i) => i.id === row.inventory_item_id)
        if (item) {
          itemName = item.name
          baseUnit = item.unit
          const costPrice = item.cost_price
          const factor = convertClientUoMFactor(
            row.unit,
            item.unit,
            item.yield_output_unit,
            item.yield_conversion_ratio,
          )

          if (factor === null) {
            incompatibleUnit = true
          } else if (row.cost_basis === 'AP_RAW') {
            unitCost = costPrice * factor
            subtotal = row.quantity * unitCost
            grossQty = row.quantity
          } else {
            const appliedYield =
              row.yield_percent_applied > 0
                ? row.yield_percent_applied
                : item.standard_yield_percent || 100
            const effectiveCost = costPrice / (appliedYield / 100)
            unitCost = effectiveCost * factor
            subtotal = row.quantity * unitCost
            grossQty = row.quantity / (appliedYield / 100)
          }
        }
      } else if (row.sourceType === 'SUB_RECIPE' && row.sub_recipe_id) {
        const sub = bomOptions.sub_recipes.find((s) => s.id === row.sub_recipe_id)
        if (sub) {
          itemName = sub.name
          baseUnit = sub.yield_unit
          const factor = convertClientUoMFactor(row.unit, sub.yield_unit)
          if (factor === null) {
            incompatibleUnit = true
          } else {
            unitCost = sub.cost_per_portion * factor
            subtotal = row.quantity * unitCost
            grossQty = row.quantity
          }
        }
      }

      return {
        ...row,
        itemName,
        baseUnit,
        incompatibleUnit,
        unitCost: Math.round(unitCost * 100) / 100,
        subtotal: Math.round(subtotal * 100) / 100,
        grossQty: Math.round(grossQty * 10000) / 10000,
      }
    })
  }, [ingredientRows, bomOptions])

  const { menu_item } = detail
  const targetFC = menu_item.target_food_cost_pct || 35

  const liveTotalHPA = calculatedRows.reduce((acc, r) => acc + (r.subtotal || 0), 0)
  const liveCostPerPortion =
    yieldPortions > 0 ? Math.round((liveTotalHPA / yieldPortions) * 100) / 100 : 0
  const liveGrossMargin = menu_item.selling_price - liveCostPerPortion
  const liveFoodCostPct =
    menu_item.selling_price > 0
      ? Math.round((liveCostPerPortion / menu_item.selling_price) * 10000) / 100
      : 0

  const viewRecommended = calculateRecommendedSellingPrice(menu_item.hpa, targetFC)
  const liveRecommended = calculateRecommendedSellingPrice(liveCostPerPortion, targetFC)

  const getFoodCostBadge = (pct: number, hasSellingPrice: boolean) => {
    if (!hasSellingPrice) {
      return {
        label: 'Konsep (Harga Jual Belum Diisi)',
        bg: 'bg-indigo-100 text-indigo-950 border-indigo-300',
      }
    }
    if (pct <= 35) {
      return {
        label: 'Sangat Sehat (≤ 35%)',
        bg: 'bg-emerald-100 text-emerald-950 border-emerald-300',
      }
    }
    if (pct <= 40) {
      return {
        label: 'Wajar Resto (36% - 40%)',
        bg: 'bg-amber-100 text-amber-950 border-amber-300',
      }
    }
    return {
      label: 'Modal Tinggi (> 40%) - Cek Harga',
      bg: 'bg-red-100 text-red-950 border-red-300',
    }
  }

  const handleAddRow = () => {
    setIngredientRows((prev) => [
      ...prev,
      {
        key: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        sourceType: 'INVENTORY',
        inventory_item_id: '',
        sub_recipe_id: '',
        cost_basis: 'EP_YIELDED',
        quantity: 1,
        unit: menu_item.menu_type === 'BEVERAGE' ? 'ml' : 'g',
        yield_percent_applied: 100,
      },
    ])
  }

  const handleRequestRemoveRow = (idx: number, row: EditableIngredientRow) => {
    if (ingredientRows.length <= 1) return
    const hasSelection = Boolean(row.inventory_item_id || row.sub_recipe_id)
    if (!hasSelection) {
      setIngredientRows((prev) => prev.filter((_, i) => i !== idx))
      return
    }
    if (confirmRemoveRowKey !== row.key) {
      setConfirmRemoveRowKey(row.key)
      return
    }
    setConfirmRemoveRowKey(null)
    setIngredientRows((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleUpdateRow = (idx: number, updates: Partial<EditableIngredientRow>) => {
    setIngredientRows((prev) => {
      const current = prev[idx]
      if (!current) return prev
      const next = [...prev]
      next[idx] = { ...current, ...updates }
      return next
    })
  }

  const handleSaveRecipe = async () => {
    setSaveError(null)
    setSaveSuccess(false)

    if (yieldPortions <= 0) {
      setSaveError('Jumlah hasil porsi resep harus lebih besar dari 0.')
      return
    }

    if (ingredientRows.length === 0) {
      setSaveError('Resep harus memiliki minimal 1 bahan baku.')
      return
    }

    for (let i = 0; i < ingredientRows.length; i++) {
      const row = ingredientRows[i]
      const calc = calculatedRows[i]
      if (!row) continue
      if (row.sourceType === 'INVENTORY' && !row.inventory_item_id) {
        setSaveError(`Pilih bahan baku mentah pada baris ke-${i + 1}.`)
        return
      }
      if (row.sourceType === 'SUB_RECIPE' && !row.sub_recipe_id) {
        setSaveError(`Pilih saus / bumbu racikan pada baris ke-${i + 1}.`)
        return
      }
      if (row.quantity <= 0) {
        setSaveError(`Takaran bahan pada baris ke-${i + 1} harus lebih besar dari 0.`)
        return
      }
      if (calc?.incompatibleUnit) {
        setSaveError(
          `Satuan "${row.unit}" pada baris ke-${i + 1} tidak cocok dengan satuan dasar bahan (misal berat vs cairan).`,
        )
        return
      }
    }

    setIsSaving(true)
    try {
      const payload: SaveRecipeRequest = {
        ...(recipeCode.trim() ? { recipe_code: recipeCode.trim() } : {}),
        recipe_name: recipeName.trim() || `Resep ${menu_item.name}`,
        yield_portions: yieldPortions,
        yield_unit: yieldUnit || 'porsi',
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ingredients: ingredientRows.map((r) => {
          const ing: SaveRecipeIngredientInput = {
            cost_basis: r.cost_basis,
            quantity: r.quantity,
            unit: r.unit,
            yield_percent_applied: r.yield_percent_applied,
          }
          if (r.sourceType === 'INVENTORY') {
            ing.inventory_item_id = r.inventory_item_id
          } else {
            ing.sub_recipe_id = r.sub_recipe_id
          }
          return ing
        }),
      }

      const updated = await saveMenuRecipe(menu_item.id, payload)
      if (updated.ingredients && updated.ingredients.length > 0) {
        setIngredientRows(
          updated.ingredients.map((ing, idx) => ({
            key: `ing-${idx}-${ing.id}`,
            sourceType: ing.is_sub_recipe ? 'SUB_RECIPE' : 'INVENTORY',
            inventory_item_id: ing.inventory_id ?? '',
            sub_recipe_id: ing.sub_recipe_id ?? '',
            cost_basis: ing.cost_basis ?? 'EP_YIELDED',
            quantity: ing.quantity,
            unit: ing.unit,
            yield_percent_applied: ing.yield_percent_applied || 100,
          })),
        )
      }
      setRecipeName(updated.recipe_name || `Resep ${updated.menu_item.name}`)
      setRecipeCode(updated.recipe_code || `REC-${updated.menu_item.code}`)
      setYieldPortions(updated.yield_portions || 1)
      setYieldUnit(updated.yield_unit || 'porsi')
      setInstructions(updated.instructions || '')
      setSaveSuccess(true)
      onSaved?.(updated)
      setTimeout(() => {
        setMode('view')
        setSaveSuccess(false)
      }, 900)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan takaran resep'
      setSaveError(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const rawIngredients = detail.ingredients?.filter((i) => !i.is_sub_recipe) ?? []
  const subRecipes = detail.ingredients?.filter((i) => i.is_sub_recipe) ?? []
  const isDraft = menu_item.status === 'DRAFT'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-line bg-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6 border-b border-line bg-gradient-to-r from-surface via-surface to-brand-50/20">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-brand-100 text-brand-800">
                <Utensils className="size-4" />
              </span>
              <span className="text-xs font-mono font-semibold text-brand-700 uppercase tracking-wider">
                {menu_item.code}
              </span>
              <span className="text-xs text-ink-400">•</span>
              <span className="text-xs font-medium text-ink-500">
                {menu_item.outlet_name ?? 'Semua Cabang Resto'}
              </span>
              {isDraft ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                  <FlaskConical className="size-3" />
                  KONSEP / UJI COBA
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
                  <Rocket className="size-3" />
                  TAYANG DI KASIR
                </span>
              )}
              {menu_item.kitchen_station && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-muted text-ink-600 border border-line">
                  {getKitchenStationLabel(menu_item.kitchen_station)}
                </span>
              )}
            </div>
            <h3
              id="modal-title"
              className="text-lg sm:text-xl font-bold text-ink-900 mt-1 flex flex-wrap items-center gap-2"
            >
              {menu_item.name}
              {mode === 'edit' && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200">
                  Mode Racik Takaran Resep
                </span>
              )}
            </h3>
            <p className="text-xs text-ink-500">
              {detail.recipe_name || 'Belum Ada Takaran Resep'} ({detail.recipe_code || 'Baru'})
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onEditMenuInfo && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEditMenuInfo(menu_item)}
                className="text-xs"
              >
                Atur Harga / Tayangkan
              </Button>
            )}
            {mode === 'view' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMode('edit')}
                className="text-xs font-semibold border-brand-300 hover:bg-brand-50 text-brand-800"
              >
                <Edit3 className="size-3.5 mr-1 text-brand-700" />
                Ubah Takaran Resep
              </Button>
            ) : (
              detail.ingredients.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMode('view')}
                  className="text-xs"
                >
                  Kembali ke Ringkasan
                </Button>
              )
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100 transition-colors"
              aria-label="Tutup modal"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* VIEW MODE */}
          {mode === 'view' && (
            <div className="space-y-6">
              {/* Financial KPI Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 rounded-xl bg-ink-900 text-white shadow-lg">
                <div>
                  <span className="text-[11px] text-ink-400 block">Harga Jual Menu</span>
                  <span className="text-xl font-bold tabular text-white">
                    {menu_item.selling_price > 0
                      ? formatRupiah(menu_item.selling_price)
                      : 'Rp 0 (Konsep)'}
                  </span>
                  {viewRecommended.roundedThousand > 0 && (
                    <span className="text-[10px] text-emerald-300 block mt-0.5">
                      Saran ({targetFC}% Modal): {formatRupiah(viewRecommended.roundedThousand)}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[11px] text-ink-400 block">Total Modal Bahan (HPA)</span>
                  <span className="text-xl font-bold tabular text-amber-400">
                    {formatRupiah(menu_item.hpa)}
                  </span>
                  <span className="text-[10px] text-amber-200 block mt-0.5">
                    Batas Sehat: &le; {targetFC}%
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-ink-400 block">Untung Kotor per Porsi</span>
                  <span className="text-xl font-bold tabular text-emerald-400">
                    {menu_item.selling_price > 0 ? formatRupiah(menu_item.gross_margin) : '-'}
                  </span>
                  <span className="text-[10px] text-emerald-300 block mt-0.5">
                    {menu_item.selling_price > 0
                      ? `${((menu_item.gross_margin / menu_item.selling_price) * 100).toFixed(1)}% untung kotor`
                      : 'Tentukan harga jual'}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-ink-400 block">Persentase Modal Bahan</span>
                  <div className="mt-1">
                    <span
                      className={cn(
                        'inline-block px-2.5 py-1 rounded-md text-xs font-black border',
                        getFoodCostBadge(menu_item.food_cost_pct, menu_item.selling_price > 0).bg,
                      )}
                    >
                      {menu_item.selling_price > 0
                        ? `${menu_item.food_cost_pct.toFixed(1)}%`
                        : 'Konsep'}
                    </span>
                  </div>
                  <span className="text-[9px] text-ink-400 block mt-1">
                    {getFoodCostBadge(menu_item.food_cost_pct, menu_item.selling_price > 0).label}
                  </span>
                </div>
              </div>

              {/* Recipe Ingredients Breakdown */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500 flex items-center gap-1.5">
                    <Layers className="size-3.5 text-brand-600" />
                    Rincian Takaran Bahan &amp; Saus Racikan
                  </h4>
                  <span className="text-xs text-ink-400">
                    Hasil Resep:{' '}
                    <strong>
                      {detail.yield_portions} {detail.yield_unit || 'porsi'}
                    </strong>
                  </span>
                </div>

                {/* Saus, Bumbu & Biang Racikan */}
                {subRecipes.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-amber-900">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="size-3.5 text-amber-600" />
                        Saus, Bumbu &amp; Biang Racikan Dapur
                      </span>
                      <span className="text-[10px] text-amber-700 font-semibold">
                        Olahan Sendiri
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {subRecipes.map((ing) => (
                        <div
                          key={ing.id}
                          className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs border border-amber-100 shadow-2xs"
                        >
                          <div>
                            <span className="font-semibold text-ink-900 block">{ing.item_name}</span>
                            <span className="text-[11px] text-ink-500">
                              Takaran porsi: {ing.quantity} {ing.unit} @ {formatRupiah(ing.unit_cost, 2)}
                            </span>
                          </div>
                          <span className="font-bold text-amber-900 tabular">
                            {formatRupiah(ing.subtotal_cost)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bahan Baku Mentah */}
                <div className="rounded-xl border border-line bg-surface-muted/30 p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink-700">
                    <span className="flex items-center gap-1.5">
                      <Leaf className="size-3.5 text-brand-600" />
                      Bahan Baku Mentah &amp; Pelengkap Langsung
                    </span>
                    <span className="text-[10px] text-ink-400 font-semibold">Bahan Gudang</span>
                  </div>
                  <div className="space-y-1.5">
                    {rawIngredients.length === 0 ? (
                      <p className="text-xs text-ink-400 italic py-2 text-center">
                        Belum ada bahan mentah.
                      </p>
                    ) : (
                      rawIngredients.map((ing) => (
                        <div
                          key={ing.id}
                          className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-xs border border-line shadow-2xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink-900">{ing.item_name}</span>
                              <span
                                className={cn(
                                  'text-[10px] px-1.5 py-0.2 rounded font-semibold',
                                  ing.cost_basis === 'AP_RAW'
                                    ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200',
                                )}
                              >
                                {ing.cost_basis === 'AP_RAW'
                                  ? 'Takaran Kotor'
                                  : `Takaran Bersih (${ing.yield_percent_applied}% bersih)`}
                              </span>
                            </div>
                            <span className="text-[11px] text-ink-500">
                              Takaran: {ing.quantity} {ing.unit} @ {formatRupiah(ing.unit_cost, 2)}/{ing.unit}
                              {ing.gross_quantity > 0 &&
                                ing.cost_basis === 'EP_YIELDED' &&
                                ing.yield_percent_applied < 100 && (
                                  <span className="text-ink-400 ml-1">
                                    (Butuh bahan kotor: {ing.gross_quantity} {ing.unit})
                                  </span>
                                )}
                            </span>
                          </div>
                          <span className="font-semibold text-ink-900 tabular">
                            {formatRupiah(ing.subtotal_cost)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {instructions && (
                <div className="text-xs text-ink-600 bg-surface-muted/50 p-4 rounded-xl border border-line">
                  <span className="font-semibold text-ink-800 block mb-1">
                    Catatan Cara Masak &amp; Penyajian:
                  </span>
                  <p className="leading-relaxed whitespace-pre-line">{instructions}</p>
                </div>
              )}
            </div>
          )}

          {/* EDIT / CREATE MODE (Interactive Multi-Unit Recipe Builder) */}
          {mode === 'edit' && (
            <div className="space-y-6">
              {/* Recipe Meta Header */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-surface-muted/40 border border-line">
                <div>
                  <label className="block text-xs font-semibold text-ink-700 mb-1">
                    Nama Catatan Resep
                  </label>
                  <input
                    type="text"
                    value={recipeName}
                    onChange={(e) => setRecipeName(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                    placeholder="Nama Resep..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-700 mb-1">
                    Kode Resep
                  </label>
                  <input
                    type="text"
                    value={recipeCode}
                    onChange={(e) => setRecipeCode(e.target.value)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-mono text-ink-900 focus:border-brand-500 focus:outline-none"
                    placeholder="REC-..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="recipe-yield-portions" className="block text-xs font-semibold text-ink-700 mb-1">
                      Hasil Porsi
                    </label>
                    <NumberInput
                      id="recipe-yield-portions"
                      min={0.1}
                      value={yieldPortions}
                      onChange={setYieldPortions}
                      className="rounded-lg border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-700 mb-1">
                      Satuan Hasil
                    </label>
                    <input
                      type="text"
                      value={yieldUnit}
                      onChange={(e) => setYieldUnit(e.target.value)}
                      className="w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                      placeholder="porsi, gelas, kotak..."
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Ingredients Table */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-600 flex items-center gap-1.5">
                    <Layers className="size-3.5 text-brand-600" />
                    Daftar Bahan &amp; Takaran Resep
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
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
                    <button
                      type="button"
                      onClick={() => {
                        setQuickSubTargetRowIdx(null)
                        setIsQuickSubOpen(true)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 px-2.5 py-1 text-[11px] font-extrabold transition-colors shadow-2xs"
                    >
                      <Sparkles className="size-3.5 text-amber-700" />
                      + Buat Saus / Racikan Baru
                    </button>
                    <span className="text-[11px] text-ink-400">
                      {ingredientRows.length} Bahan Dipilih
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {ingredientRows.map((row, idx) => {
                    const calc = calculatedRows[idx]
                    const isConfirmingRowRemove = confirmRemoveRowKey === row.key
                    const customBaseUnit =
                      calc?.baseUnit && !isUnitInGroups(calc.baseUnit, HUMAN_UNIT_GROUPS)
                        ? calc.baseUnit
                        : null

                    return (
                      <div
                        key={row.key}
                        className="rounded-xl border border-line bg-surface p-3.5 shadow-2xs space-y-3 transition-all hover:border-brand-300"
                      >
                        {/* Row Header & Controls */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-line/60">
                          <div className="flex items-center gap-2">
                            <span className="flex size-6 items-center justify-center rounded-md bg-brand-50 text-brand-800 text-xs font-bold">
                              {idx + 1}
                            </span>

                            <div className="flex items-center rounded-lg bg-surface-muted p-0.5 text-xs">
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
                                  'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
                                  row.sourceType === 'INVENTORY'
                                    ? 'bg-surface text-brand-800 shadow-2xs font-bold'
                                    : 'text-ink-500 hover:text-ink-800',
                                )}
                              >
                                <Leaf className="size-3 inline mr-1 text-emerald-600" />
                                Bahan Baku Mentah
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateRow(idx, {
                                    sourceType: 'SUB_RECIPE',
                                    inventory_item_id: '',
                                    sub_recipe_id: '',
                                    cost_basis: 'EP_YIELDED',
                                    unit: 'ml',
                                  })
                                }
                                className={cn(
                                  'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
                                  row.sourceType === 'SUB_RECIPE'
                                    ? 'bg-surface text-amber-800 shadow-2xs font-bold'
                                    : 'text-ink-500 hover:text-ink-800',
                                )}
                              >
                                <Sparkles className="size-3 inline mr-1 text-amber-600" />
                                Saus / Bumbu Racikan
                              </button>
                            </div>
                          </div>

                          {row.sourceType === 'INVENTORY' && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="text-[10px] text-ink-400 font-semibold">Cara Takar:</span>
                              <button
                                type="button"
                                onClick={() => handleUpdateRow(idx, { cost_basis: 'EP_YIELDED' })}
                                className={cn(
                                  'px-2 py-0.5 rounded text-[10px] font-bold border transition-colors',
                                  row.cost_basis === 'EP_YIELDED'
                                    ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                    : 'bg-surface text-ink-500 border-line hover:bg-ink-50',
                                )}
                                title="Berat bersih siap masak (otomatis memperhitungkan susut kupas/potong)"
                              >
                                Takaran Bersih (Siap Masak)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateRow(idx, { cost_basis: 'AP_RAW' })}
                                className={cn(
                                  'px-2 py-0.5 rounded text-[10px] font-bold border transition-colors',
                                  row.cost_basis === 'AP_RAW'
                                    ? 'bg-blue-100 text-blue-950 border-blue-300'
                                    : 'bg-surface text-ink-500 border-line hover:bg-ink-50',
                                )}
                                title="Berat kotor utuh sebelum dikupas atau dipotong"
                              >
                                Takaran Kotor (Utuh)
                              </button>
                            </div>
                          )}

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
                              disabled={ingredientRows.length <= 1}
                              className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors disabled:opacity-35 disabled:cursor-not-allowed"
                              title={
                                ingredientRows.length <= 1
                                  ? 'Minimal harus ada 1 bahan'
                                  : 'Hapus bahan ini'
                              }
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>

                        {/* Dropdown & Quantity Inputs */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-start">
                          <div className="sm:col-span-5 space-y-1">
                            <label className="block text-[10px] font-medium text-ink-400">
                              Pilih {row.sourceType === 'INVENTORY' ? 'Bahan Baku Mentah' : 'Saus / Bumbu Racikan'}
                            </label>
                            {row.sourceType === 'INVENTORY' ? (
                              <>
                                <select
                                  value={row.inventory_item_id}
                                  onChange={(e) => {
                                    const item = bomOptions.inventory_items.find(
                                      (i) => i.id === e.target.value,
                                    )
                                    handleUpdateRow(idx, {
                                      inventory_item_id: e.target.value,
                                      unit: item?.unit || 'g',
                                      yield_percent_applied: item?.standard_yield_percent || 100,
                                    })
                                  }}
                                  className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
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
                              </>
                            ) : (
                              <>
                                <select
                                  value={row.sub_recipe_id}
                                  onChange={(e) => {
                                    const sub = bomOptions.sub_recipes.find(
                                      (s) => s.id === e.target.value,
                                    )
                                    handleUpdateRow(idx, {
                                      sub_recipe_id: e.target.value,
                                      unit: sub?.yield_unit || 'porsi',
                                    })
                                  }}
                                  className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                                >
                                  <option value="">-- Pilih Saus / Bumbu Racikan --</option>
                                  {bomOptions.sub_recipes.map((sub) => (
                                    <option key={sub.id} value={sub.id}>
                                      {sub.name} ({formatRupiah(sub.cost_per_portion, 2)} / {sub.yield_unit})
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickSubTargetRowIdx(idx)
                                    setIsQuickSubOpen(true)
                                  }}
                                  className="text-[11px] font-bold text-amber-800 hover:text-amber-950 underline inline-flex items-center gap-1"
                                >
                                  + Belum ada racikan? Buat Saus / Racikan Baru Langsung
                                </button>
                              </>
                            )}
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-medium text-ink-400 mb-1">
                              Takaran ({row.cost_basis === 'EP_YIELDED' ? 'Bersih' : 'Kotor'})
                            </label>
                            <NumberInput
                              min={0.001}
                              value={row.quantity}
                              onChange={(val) => handleUpdateRow(idx, { quantity: val })}
                              className="rounded-lg border-line bg-surface px-2.5 py-1.5 text-xs font-semibold tabular text-ink-900"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-[10px] font-medium text-ink-400 mb-1">
                              Satuan Takar
                            </label>
                            <select
                              value={row.unit}
                              onChange={(e) => handleUpdateRow(idx, { unit: e.target.value })}
                              className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
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
                            <span className="block text-[10px] text-ink-400 mb-1">
                              Modal Bahan Ini
                            </span>
                            {calc?.incompatibleUnit ? (
                              <span className="text-[11px] font-bold text-red-600 block">
                                Satuan tidak cocok dgn {calc.baseUnit}
                              </span>
                            ) : (
                              <>
                                <span className="text-sm font-extrabold text-ink-900 tabular block">
                                  {formatRupiah(calc?.subtotal || 0)}
                                </span>
                                <span className="text-[10px] text-ink-400">
                                  @{formatRupiah(calc?.unitCost || 0, 2)}/{row.unit}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddRow}
                  className="w-full py-2 border-dashed border-brand-300 text-brand-800 hover:bg-brand-50 text-xs justify-center"
                >
                  <Plus className="size-3.5 mr-1 text-brand-600" />
                  + Tambah Baris Bahan / Saus Racikan Lainnya
                </Button>
              </div>

              {/* Cooking Instructions */}
              <div>
                <label className="block text-xs font-semibold text-ink-700 mb-1">
                  Catatan Cara Masak &amp; Penyajian
                </label>
                <textarea
                  rows={3}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface p-3 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                  placeholder="Langkah memasak, takaran es/hiasan, tingkat kematangan, dan tata saji..."
                />
              </div>

              {/* Live Reactive Financial Summary Card & Recommended Price */}
              <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50/50 to-emerald-50/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-brand-950 flex items-center gap-1.5">
                    <Calculator className="size-4 text-brand-700" />
                    Hitungan Modal &amp; Untung Resep (Otomatis)
                  </span>
                  <span
                    className={cn(
                      'px-2.5 py-0.5 rounded-full text-xs font-black border',
                      getFoodCostBadge(liveFoodCostPct, menu_item.selling_price > 0).bg,
                    )}
                  >
                    {menu_item.selling_price > 0
                      ? `Persentase Modal: ${liveFoodCostPct.toFixed(1)}%`
                      : `Saran Harga Jual (${targetFC}% Modal): ${formatRupiah(liveRecommended.roundedThousand)}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                  <div className="bg-surface rounded-lg p-2.5 border border-line/70">
                    <span className="text-[10px] text-ink-400 block">Harga Jual Saat Ini</span>
                    <span className="font-extrabold text-ink-900 tabular text-sm">
                      {menu_item.selling_price > 0
                        ? formatRupiah(menu_item.selling_price)
                        : 'Rp 0 (Konsep)'}
                    </span>
                  </div>

                  <div className="bg-surface rounded-lg p-2.5 border border-amber-200">
                    <span className="text-[10px] text-amber-700 block">Total Modal Resep</span>
                    <span className="font-extrabold text-amber-900 tabular text-sm">
                      {formatRupiah(liveTotalHPA)}
                    </span>
                  </div>

                  <div className="bg-surface rounded-lg p-2.5 border border-brand-200">
                    <span className="text-[10px] text-brand-700 block">Modal / Porsi Saji</span>
                    <span className="font-extrabold text-brand-900 tabular text-sm">
                      {formatRupiah(liveCostPerPortion)}
                    </span>
                  </div>

                  <div className="bg-surface rounded-lg p-2.5 border border-emerald-200">
                    <span className="text-[10px] text-emerald-700 block">Untung / Porsi</span>
                    <span className="font-extrabold text-emerald-900 tabular text-sm">
                      {menu_item.selling_price > 0 ? formatRupiah(liveGrossMargin) : '-'}
                    </span>
                  </div>

                  <div className="bg-emerald-900 text-white rounded-lg p-2.5">
                    <span className="text-[10px] text-emerald-200 block">
                      Saran Harga ({targetFC}% Modal)
                    </span>
                    <span className="font-black text-amber-300 tabular text-sm">
                      {liveRecommended.roundedThousand > 0
                        ? formatRupiah(liveRecommended.roundedThousand)
                        : '-'}
                    </span>
                  </div>
                </div>

                {menu_item.selling_price > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-ink-500 font-medium">
                      <span>Hemat (&le; 35%)</span>
                      <span>Wajar (36-40%)</span>
                      <span>Tinggi (&gt; 40%)</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-line overflow-hidden relative">
                      <div
                        className={cn(
                          'h-full transition-all duration-300',
                          liveFoodCostPct <= 35
                            ? 'bg-emerald-500'
                            : liveFoodCostPct <= 40
                              ? 'bg-amber-500'
                              : 'bg-red-500',
                        )}
                        style={{ width: `${Math.min(100, Math.max(5, liveFoodCostPct))}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {saveError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="size-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Gagal Menyimpan Resep:</span>
                    <p className="mt-0.5">{saveError}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-line bg-surface-muted/30 flex items-center justify-between gap-3">
          <span className="text-xs text-ink-500 flex items-center gap-1">
            <Info className="size-3.5 text-ink-400" />
            Perubahan takaran resep otomatis memperbarui modal menu (HPA) &amp; Laporan Laba Rugi.
          </span>

          <div className="flex items-center gap-2">
            {mode === 'edit' ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => (detail.ingredients.length > 0 ? setMode('view') : onClose())}
                  disabled={isSaving}
                  className="text-xs"
                >
                  Batal
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleSaveRecipe}
                  disabled={isSaving}
                  className="text-xs font-semibold px-4"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                      Menyimpan Resep...
                    </>
                  ) : saveSuccess ? (
                    <>
                      <CheckCircle2 className="size-3.5 text-emerald-300 mr-1.5" />
                      Tersimpan!
                    </>
                  ) : (
                    <>
                      <Save className="size-3.5 mr-1.5" />
                      Simpan Resep &amp; Perbarui Modal
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs font-semibold"
              >
                Tutup
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Inline Quick-Create Raw Ingredient Modal (Stacked on Top) */}
      <IngredientFormModal
        isOpen={isQuickIngOpen}
        editingIngredient={null}
        zIndexClass="z-[60]"
        onClose={() => {
          setIsQuickIngOpen(false)
          setQuickIngTargetRowIdx(null)
        }}
        onSaved={handleQuickIngredientSaved}
      />

      {/* Inline Quick-Create Sub-Recipe Modal (Stacked on Top) */}
      <SubRecipeFormModal
        isOpen={isQuickSubOpen}
        editingSubRecipe={null}
        zIndexClass="z-[60]"
        onClose={() => {
          setIsQuickSubOpen(false)
          setQuickSubTargetRowIdx(null)
        }}
        onSaved={handleQuickSubRecipeSaved}
      />
    </div>
  )
}
