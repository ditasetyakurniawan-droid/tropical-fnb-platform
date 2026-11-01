import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  ChefHat,
  Citrus,
  Coffee,
  Cookie,
  Edit3,
  Fish,
  Flame,
  FlaskConical,
  Layers,
  Lock,
  Package,
  Percent,
  Plus,
  Rocket,
  Scale,
  Search,
  Sparkles,
  Trash2,
  Trees,
  TrendingUp,
  UtensilsCrossed,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { IngredientFormModal } from './IngredientFormModal'
import { MenuFormModal } from './MenuFormModal'
import { RecipeDetailModal } from './RecipeDetailModal'
import { SubRecipeFormModal } from './SubRecipeFormModal'
import { YieldCalculatorCard } from './YieldCalculatorCard'
import {
  deleteMasterIngredient,
  deleteMenuItem,
  deleteSubRecipe,
  fetchIngredientCategories,
  fetchMasterIngredients,
  fetchMenuCategories,
  fetchMenuItemDetail,
  fetchMenuItems,
  fetchSubRecipeDetail,
  fetchSubRecipes,
  fetchYieldTests,
  updateMenuItemStatus,
} from './menu-api'
import type {
  ButcheringYieldTest,
  InventoryCategory,
  MasterIngredient,
  MenuCategory,
  MenuItemDetail,
  MenuItemWithHPA,
  SubRecipeBOMOption,
  SubRecipeDetail,
} from './types'
import { formatRupiah, getKitchenStationLabel } from './uom-helpers'
import { useAuthStore } from '@/features/auth/auth-store'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { SmoothNumber } from '@/shared/ui/SmoothNumber'

type ActiveHubTab = 'menu' | 'subrecipes' | 'ingredients' | 'yield'

export function MenuRecipePage() {
  const queryClient = useQueryClient()
  const activeOutletId = useAuthStore((s) => s.activeOutletId)
  const activeOutlet = useAuthStore((s) => s.getActiveOutlet())

  const [activeTab, setActiveTab] = useState<ActiveHubTab>('menu')

  // Filters for Tab 1 (Daftar Menu & Resep)
  const [menuSearch, setMenuSearch] = useState('')
  const [selectedMenuType, setSelectedMenuType] = useState<'ALL' | 'FOOD' | 'SNACK' | 'BEVERAGE'>('ALL')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT'>('ALL')
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')

  // Filters for Tab 2 & Tab 3
  const [subRecipeSearch, setSubRecipeSearch] = useState('')
  const [ingredientSearch, setIngredientSearch] = useState('')
  const [selectedIngCategory, setSelectedIngCategory] = useState<string>('ALL')

  // Modals & Action Feedback State
  const [selectedMenuDetail, setSelectedMenuDetail] = useState<MenuItemDetail | null>(null)
  const [bomInitialMode, setBomInitialMode] = useState<'view' | 'edit' | undefined>(undefined)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  const [isMenuFormOpen, setIsMenuFormOpen] = useState(false)
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItemWithHPA | null>(null)

  const [isSubRecipeFormOpen, setIsSubRecipeFormOpen] = useState(false)
  const [editingSubRecipe, setEditingSubRecipe] = useState<SubRecipeDetail | null>(null)

  const [isIngredientFormOpen, setIsIngredientFormOpen] = useState(false)
  const [editingIngredient, setEditingIngredient] = useState<MasterIngredient | null>(null)

  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null)
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // Allow pressing Escape anywhere to cancel an active delete/archive confirmation
  useEffect(() => {
    if (!confirmDeleteKey) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirmDeleteKey(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [confirmDeleteKey])

  // Queries
  const { data: menuItems = [], refetch: refetchMenu } = useQuery({
    queryKey: ['menu-items', activeOutletId],
    queryFn: () => fetchMenuItems(activeOutletId),
  })

  const { data: menuCategories = [], refetch: refetchMenuCategories } = useQuery({
    queryKey: ['menu-categories'],
    queryFn: () => fetchMenuCategories(),
  })

  const { data: subRecipes = [], refetch: refetchSubRecipes } = useQuery({
    queryKey: ['sub-recipes'],
    queryFn: () => fetchSubRecipes(),
  })

  const { data: masterIngredients = [], refetch: refetchIngredients } = useQuery({
    queryKey: ['master-ingredients'],
    queryFn: () => fetchMasterIngredients(),
  })

  const { data: ingredientCategories = [], refetch: refetchIngCategories } = useQuery({
    queryKey: ['ingredient-categories'],
    queryFn: () => fetchIngredientCategories(),
  })

  const { data: yieldTests = [], refetch: refetchYield } = useQuery({
    queryKey: ['yield-tests', activeOutletId],
    queryFn: () => fetchYieldTests(activeOutletId),
  })

  // Defensive array normalizations
  const safeMenuItems: MenuItemWithHPA[] = useMemo(
    () => (Array.isArray(menuItems) ? menuItems : []),
    [menuItems],
  )
  const safeMenuCategories: MenuCategory[] = useMemo(
    () => (Array.isArray(menuCategories) ? menuCategories : []),
    [menuCategories],
  )
  const safeSubRecipes: SubRecipeBOMOption[] = useMemo(
    () => (Array.isArray(subRecipes) ? subRecipes : []),
    [subRecipes],
  )
  const safeIngredients: MasterIngredient[] = useMemo(
    () => (Array.isArray(masterIngredients) ? masterIngredients : []),
    [masterIngredients],
  )
  const safeIngCategories: InventoryCategory[] = useMemo(
    () => (Array.isArray(ingredientCategories) ? ingredientCategories : []),
    [ingredientCategories],
  )
  const safeYieldTests: ButcheringYieldTest[] = useMemo(
    () => (Array.isArray(yieldTests) ? yieldTests : []),
    [yieldTests],
  )

  const refreshAllCulinaryData = () => {
    void refetchMenu()
    void refetchMenuCategories()
    void refetchSubRecipes()
    void refetchIngredients()
    void refetchIngCategories()
    void refetchYield()
    void queryClient.invalidateQueries({ queryKey: ['menu-items'] })
  }

  // Computed Summary Metrics
  const totalMenuCount = safeMenuItems.length
  const draftCount = safeMenuItems.filter((m) => m.status === 'DRAFT').length
  const pricedMenus = safeMenuItems.filter((m) => m.selling_price > 0 && m.hpa > 0)
  const avgFoodCostPct =
    pricedMenus.length > 0
      ? pricedMenus.reduce((acc, m) => acc + (m.food_cost_pct || 0), 0) / pricedMenus.length
      : totalMenuCount > 0
        ? safeMenuItems.reduce((acc, m) => acc + (m.food_cost_pct || 0), 0) / totalMenuCount
        : 0
  const avgGrossMargin =
    pricedMenus.length > 0
      ? pricedMenus.reduce((acc, m) => acc + (m.gross_margin || 0), 0) / pricedMenus.length
      : totalMenuCount > 0
        ? safeMenuItems.reduce((acc, m) => acc + (m.gross_margin || 0), 0) / totalMenuCount
        : 0

  // Dynamic category list for Menu filtering
  const availableCategoryFilters = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of safeMenuCategories) {
      map.set(c.code, c.name)
    }
    for (const m of safeMenuItems) {
      if (m.category_code && m.category_name) {
        map.set(m.category_code, m.category_name)
      }
    }
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }))
  }, [safeMenuCategories, safeMenuItems])

  const filteredMenuItems = useMemo(() => {
    const q = menuSearch.trim().toLowerCase()
    return safeMenuItems.filter((item) => {
      if (q) {
        const hit =
          item.name.toLowerCase().includes(q) ||
          item.code.toLowerCase().includes(q) ||
          item.category_name.toLowerCase().includes(q)
        if (!hit) return false
      }
      if (selectedMenuType !== 'ALL' && (item.menu_type ?? 'FOOD') !== selectedMenuType) {
        return false
      }
      const st = item.status ?? 'PUBLISHED'
      if (selectedStatusFilter !== 'ALL' && st !== selectedStatusFilter) {
        return false
      }
      if (selectedCategory !== 'ALL' && item.category_code !== selectedCategory) {
        return false
      }
      return true
    })
  }, [safeMenuItems, menuSearch, selectedMenuType, selectedStatusFilter, selectedCategory])

  const filteredSubRecipes = useMemo(() => {
    const q = subRecipeSearch.trim().toLowerCase()
    if (!q) return safeSubRecipes
    return safeSubRecipes.filter(
      (sr) => sr.name.toLowerCase().includes(q) || sr.code.toLowerCase().includes(q),
    )
  }, [safeSubRecipes, subRecipeSearch])

  const filteredIngredients = useMemo(() => {
    const q = ingredientSearch.trim().toLowerCase()
    return safeIngredients.filter((ing) => {
      if (selectedIngCategory !== 'ALL' && ing.category_code !== selectedIngCategory) {
        return false
      }
      if (q) {
        return (
          ing.name.toLowerCase().includes(q) ||
          ing.code.toLowerCase().includes(q) ||
          ing.category_name.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [safeIngredients, ingredientSearch, selectedIngCategory])

  // Handlers
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedbackBanner({ type, message })
    setTimeout(() => {
      setFeedbackBanner((curr) => (curr?.message === message ? null : curr))
    }, 5500)
  }

  const handleSwitchTab = (tab: ActiveHubTab) => {
    setConfirmDeleteKey(null)
    setActiveTab(tab)
  }

  const handleOpenDetail = async (menuId: string, mode?: 'view' | 'edit') => {
    setIsLoadingDetail(true)
    try {
      const detail = await fetchMenuItemDetail(menuId)
      setBomInitialMode(mode)
      setSelectedMenuDetail(detail)
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Gagal memuat detail takaran resep.')
    } finally {
      setIsLoadingDetail(false)
    }
  }

  const handleTogglePublish = async (item: MenuItemWithHPA) => {
    const currentStatus = item.status ?? 'PUBLISHED'
    if (currentStatus === 'DRAFT' && item.selling_price <= 0) {
      setEditingMenuItem(item)
      setIsMenuFormOpen(true)
      showFeedback(
        'error',
        `Isi Harga Jual (lebih dari Rp 0) untuk "${item.name}" terlebih dahulu sebelum ditayangkan ke layar Kasir.`,
      )
      return
    }
    const nextStatus = currentStatus === 'DRAFT' ? 'PUBLISHED' : 'DRAFT'
    try {
      await updateMenuItemStatus(item.id, { status: nextStatus })
      refreshAllCulinaryData()
      showFeedback(
        'success',
        nextStatus === 'PUBLISHED'
          ? `Menu "${item.name}" sekarang TAYANG di layar Kasir!`
          : `Menu "${item.name}" diubah ke Konsep / Uji Coba (tersembunyi dari layar Kasir).`,
      )
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Gagal memperbarui status menu.')
    }
  }

  const handleToggleAvailability = async (item: MenuItemWithHPA) => {
    try {
      await updateMenuItemStatus(item.id, { is_available: !item.is_available })
      refreshAllCulinaryData()
      showFeedback(
        'success',
        !item.is_available
          ? `Menu "${item.name}" kembali tersedia di Kasir.`
          : `Menu "${item.name}" ditandai HABIS sementara di Kasir.`,
      )
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Gagal mengubah ketersediaan menu.')
    }
  }

  const handleDeleteMenu = async (item: MenuItemWithHPA) => {
    const key = `menu-${item.id}`
    if (confirmDeleteKey !== key) {
      setConfirmDeleteKey(key)
      return
    }
    setConfirmDeleteKey(null)
    try {
      await deleteMenuItem(item.id)
      refreshAllCulinaryData()
      showFeedback('success', `Menu "${item.name}" berhasil diarsipkan.`)
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Gagal mengarsipkan menu.')
    }
  }

  const handleOpenEditSubRecipe = async (id: string) => {
    try {
      const detail = await fetchSubRecipeDetail(id)
      setEditingSubRecipe(detail)
      setIsSubRecipeFormOpen(true)
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Gagal memuat detail racikan dapur.')
    }
  }

  const handleDeleteSubRecipe = async (sr: SubRecipeBOMOption) => {
    const usedCount = sr.used_in_count ?? 0
    if (usedCount > 0) {
      setConfirmDeleteKey(null)
      showFeedback(
        'error',
        `Racikan "${sr.name}" aman terlindungi karena sedang dipakai di ${usedCount} resep aktif. Lepaskan dari resep menu terlebih dahulu jika ingin menghapus.`,
      )
      return
    }
    const key = `sub-${sr.id}`
    if (confirmDeleteKey !== key) {
      setConfirmDeleteKey(key)
      return
    }
    setConfirmDeleteKey(null)
    try {
      await deleteSubRecipe(sr.id)
      refreshAllCulinaryData()
      showFeedback('success', `Racikan "${sr.name}" berhasil dihapus.`)
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Gagal menghapus racikan dapur.')
    }
  }

  const handleDeleteIngredient = async (ing: MasterIngredient) => {
    if (ing.used_in_recipes_count > 0) {
      setConfirmDeleteKey(null)
      showFeedback(
        'error',
        `Bahan "${ing.name}" aman terlindungi karena sedang dipakai di ${ing.used_in_recipes_count} resep aktif. Lepaskan dari resep terlebih dahulu jika ingin menghapus.`,
      )
      return
    }
    const key = `ing-${ing.id}`
    if (confirmDeleteKey !== key) {
      setConfirmDeleteKey(key)
      return
    }
    setConfirmDeleteKey(null)
    try {
      await deleteMasterIngredient(ing.id)
      refreshAllCulinaryData()
      showFeedback('success', `Bahan baku "${ing.name}" berhasil dihapus.`)
    } catch (err: unknown) {
      showFeedback('error', err instanceof Error ? err.message : 'Gagal menghapus bahan baku.')
    }
  }

  const getTestTypeBadge = (type: string) => {
    switch (type) {
      case 'MEAT_BUTCHERING':
        return {
          label: 'Daging Steak',
          icon: <Flame className="size-3 inline mr-1 text-amber-600" />,
          bg: 'bg-amber-100 text-amber-900 border-amber-200',
        }
      case 'POULTRY_FISH':
        return {
          label: 'Ayam & Ikan',
          icon: <Fish className="size-3 inline mr-1 text-emerald-600" />,
          bg: 'bg-emerald-100 text-emerald-900 border-emerald-200',
        }
      case 'PRODUCE_JUICE':
        return {
          label: 'Buah & Perasan',
          icon: <Citrus className="size-3 inline mr-1 text-orange-600" />,
          bg: 'bg-orange-100 text-orange-900 border-orange-200',
        }
      default:
        return {
          label: 'Umum',
          icon: <Scale className="size-3 inline mr-1 text-ink-600" />,
          bg: 'bg-slate-100 text-slate-800 border-slate-200',
        }
    }
  }

  const getMenuTypeBadge = (menuType?: string) => {
    switch (menuType) {
      case 'BEVERAGE':
        return {
          label: 'Minuman',
          icon: <Coffee className="size-3 inline mr-1" />,
          cls: 'bg-teal-50 text-teal-800 border-teal-200',
        }
      case 'SNACK':
        return {
          label: 'Camilan',
          icon: <Cookie className="size-3 inline mr-1" />,
          cls: 'bg-amber-50 text-amber-800 border-amber-200',
        }
      default:
        return {
          label: 'Makan Besar',
          icon: <UtensilsCrossed className="size-3 inline mr-1" />,
          cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        }
    }
  }

  const formatStorageLabel = (storage: string) => {
    switch (storage?.toUpperCase()) {
      case 'CHILLER':
        return 'Pendingin (Chiller)'
      case 'FREEZER':
        return 'Pembeku (Freezer)'
      default:
        return 'Gudang Kering'
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 tropical-glass text-slate-800">
      {/* Tropical Culinary Header Panel (Harmonized Golden Reference Warm Sage Frosted Glass) */}
      <div data-spot="panel" className="bg-white/95 rounded-3xl p-6 shadow-sm border border-slate-200/90 transition-all">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-500/20">
                <ChefHat className="size-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">
                    Kelola Menu, Resep &amp; Modal Bahan (HPA)
                  </h1>
                  <span className="text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
                    {activeOutletId === 'ALL'
                      ? 'Semua Cabang Resto Tropical'
                      : activeOutlet?.name ?? 'Cabang Resto'}
                  </span>
                </div>
                <p className="text-xs text-slate-600 mt-0.5 font-semibold">
                  Buat menu makanan, camilan, atau minuman baru secara mandiri, tambahkan bahan baku &amp; satuan bebas kapan saja, serta pantau hitungan modal otomatis.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setEditingIngredient(null)
                setIsIngredientFormOpen(true)
              }}
              className="bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-300 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all flex items-center gap-2 shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
            >
              <Package className="size-4 text-emerald-600" />
              + Buat Bahan Baku Baru Langsung
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingMenuItem(null)
                setIsMenuFormOpen(true)
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2.5 rounded-2xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="size-4" />
              + Buat Menu Baru
            </button>
          </div>
        </div>

        {/* 4 Navigation Command Cards (The 4 interactive buttons with clear high-contrast affordance) */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Tab 1: Daftar Menu & Resep */}
          <button
            type="button"
            onClick={() => handleSwitchTab('menu')}
            data-spot="workflow"
            data-active={activeTab === 'menu'}
            aria-pressed={activeTab === 'menu'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'menu'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/40 border-emerald-500'
                : 'bg-white hover:bg-emerald-50/40 border-slate-200/90 hover:border-emerald-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'menu' ? 'bg-emerald-500/50 text-white' : 'bg-emerald-100 text-emerald-800'
                )}
              >
                <UtensilsCrossed className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'menu' ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                )}
              >
                <SmoothNumber value={safeMenuItems.length} format="number" /> Menu
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'menu' ? 'text-white' : 'text-slate-900')}>
                1. Daftar Menu &amp; Resep
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'menu' ? 'text-emerald-100' : 'text-slate-600')}>
                Katalog Menu &amp; Hitung HPA
              </div>
            </div>
          </button>

          {/* Tab 2: Saus & Bumbu Racikan */}
          <button
            type="button"
            onClick={() => handleSwitchTab('subrecipes')}
            data-spot="workflow"
            data-active={activeTab === 'subrecipes'}
            aria-pressed={activeTab === 'subrecipes'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'subrecipes'
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40 border-amber-500'
                : 'bg-white hover:bg-amber-50/40 border-slate-200/90 hover:border-amber-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'subrecipes' ? 'bg-amber-500/50 text-white' : 'bg-amber-100 text-amber-800'
                )}
              >
                <Sparkles className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'subrecipes' ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-900 border border-amber-200'
                )}
              >
                <SmoothNumber value={safeSubRecipes.length} format="number" /> Racikan
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'subrecipes' ? 'text-white' : 'text-slate-900')}>
                2. Saus &amp; Bumbu Racikan
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'subrecipes' ? 'text-amber-100' : 'text-slate-600')}>
                Sub-Resep Kitchen BOH
              </div>
            </div>
          </button>

          {/* Tab 3: Bahan Baku Mentah */}
          <button
            type="button"
            onClick={() => handleSwitchTab('ingredients')}
            data-spot="workflow"
            data-active={activeTab === 'ingredients'}
            aria-pressed={activeTab === 'ingredients'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'ingredients'
                ? 'bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-md shadow-teal-500/25 ring-2 ring-teal-400/40 border-teal-500'
                : 'bg-white hover:bg-teal-50/40 border-slate-200/90 hover:border-teal-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'ingredients' ? 'bg-teal-500/50 text-white' : 'bg-teal-100 text-teal-800'
                )}
              >
                <Package className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'ingredients' ? 'bg-white text-teal-700' : 'bg-teal-100 text-teal-900 border border-teal-200'
                )}
              >
                <SmoothNumber value={safeIngredients.length} format="number" /> Bahan
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'ingredients' ? 'text-white' : 'text-slate-900')}>
                3. Bahan Baku Mentah
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'ingredients' ? 'text-teal-100' : 'text-slate-600')}>
                Master Inventori Dapur
              </div>
            </div>
          </button>

          {/* Tab 4: Hitung Susut Bahan */}
          <button
            type="button"
            onClick={() => handleSwitchTab('yield')}
            data-spot="workflow"
            data-active={activeTab === 'yield'}
            aria-pressed={activeTab === 'yield'}
            className={cn(
              'p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer',
              activeTab === 'yield'
                ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-400/40 border-indigo-500'
                : 'bg-white hover:bg-indigo-50/40 border-slate-200/90 hover:border-indigo-300 text-slate-800 shadow-2xs'
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div
                className={cn(
                  'p-1.5 rounded-lg',
                  activeTab === 'yield' ? 'bg-indigo-500/50 text-white' : 'bg-indigo-100 text-indigo-800'
                )}
              >
                <Scale className="size-4" />
              </div>
              <span
                className={cn(
                  'px-2 py-0.5 text-[10px] font-bold rounded-full',
                  activeTab === 'yield' ? 'bg-white text-indigo-700' : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                )}
              >
                <SmoothNumber value={safeYieldTests.length} format="number" /> Catatan Susut
              </span>
            </div>
            <div className="mt-2.5">
              <div className={cn('text-xs font-bold', activeTab === 'yield' ? 'text-white' : 'text-slate-900')}>
                4. Hitung Susut Bahan
              </div>
              <div className={cn('text-[11px] font-semibold', activeTab === 'yield' ? 'text-indigo-100' : 'text-slate-600')}>
                Butchering &amp; Yield Test
              </div>
            </div>
          </button>
        </div>
      </div>


      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          role="status"
          className={cn(
            'rounded-xl border p-3.5 text-xs font-semibold flex items-center justify-between gap-3 shadow-xs',
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-red-50 border-red-300 text-red-900',
          )}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'success' ? (
               <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="size-4 text-red-600 shrink-0" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-[11px] underline opacity-75 hover:opacity-100"
          >
            Tutup
          </button>
        </div>
      )}

      {/* 4 KPI Stat Cards (Powered by SmoothNumber with Ease-Out Expo curve) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card data-spot="stat" className="p-4 sm:p-5 flex items-center justify-between border-line shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div>
            <span className="text-xs font-medium text-ink-500 block">Total Menu Terdaftar</span>
            <span className="text-2xl font-extrabold text-ink-900 tabular mt-1 block">
              <SmoothNumber value={totalMenuCount} format="number" suffix=" Menu" />
            </span>
            <span className="text-[10px] text-indigo-700 font-semibold mt-0.5 block">
              {draftCount > 0
                ? `${totalMenuCount - draftCount} Tayang Kasir • ${draftCount} Konsep`
                : activeOutletId === 'ALL'
                  ? 'Gabungan Steak & Garden'
                  : activeOutlet?.code}
            </span>
          </div>
          <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <ChefHat className="size-6" />
          </span>
        </Card>

        <Card data-spot="stat" className="p-4 sm:p-5 flex items-center justify-between border-line shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div>
            <span className="text-xs font-medium text-ink-500 block">Rata-rata Persentase Modal</span>
            <span className="text-2xl font-extrabold text-amber-600 tabular mt-1 block">
              <SmoothNumber value={avgFoodCostPct} format="percent" decimals={1} />
            </span>
            <span className="text-[10px] text-emerald-700 font-semibold mt-0.5 block">
              Patokan Sehat: &le; 40.0%
            </span>
          </div>
          <span className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Percent className="size-6" />
          </span>
        </Card>

        <Card data-spot="stat" className="p-4 sm:p-5 flex items-center justify-between border-line shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div>
            <span className="text-xs font-medium text-ink-500 block">Rata-rata Untung Kotor</span>
            <span className="text-2xl font-extrabold text-emerald-700 tabular mt-1 block">
              <SmoothNumber value={avgGrossMargin} format="idr" />
            </span>
            <span className="text-[10px] text-ink-400 mt-0.5 block">Per porsi terjual</span>
          </div>
          <span className="flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <TrendingUp className="size-6" />
          </span>
        </Card>

        <Card data-spot="stat" className="p-4 sm:p-5 flex items-center justify-between border-line shadow-xs hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
          <div>
            <span className="text-xs font-medium text-ink-500 block">Bahan &amp; Saus Racikan</span>
            <span className="text-2xl font-extrabold text-ink-900 tabular mt-1 block">
              <SmoothNumber value={safeIngredients.length} format="number" suffix=" Bahan" />
            </span>
            <span className="text-[10px] text-amber-700 font-semibold mt-0.5 block">
              {safeSubRecipes.length} Saus Racikan • {safeYieldTests.length} Catatan Susut
            </span>
          </div>
          <span className="flex size-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Package className="size-6" />
          </span>
        </Card>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: DAFTAR MENU & RESEP                                            */}
      {/* ===================================================================== */}
      {activeTab === 'menu' && (
        <div className="space-y-4">
          {/* Search & Multi-Facet Filter Bar */}
          <Card data-spot="toolbar" className="p-4 border-line space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="size-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  placeholder="Cari nama menu makan besar, camilan, minuman, atau kode menu..."
                  className="w-full rounded-xl border border-line bg-surface pl-9 pr-3 py-2 text-xs font-medium text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  aria-label="Filter kategori menu"
                  className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-800 focus:border-brand-500 focus:outline-none"
                >
                  <option value="ALL">Semua Kategori ({safeMenuItems.length})</option>
                  {availableCategoryFilters.map((cat) => (
                    <option key={cat.code} value={cat.code}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line/60">
              {/* Tipe Sajian Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'Semua Sajian' },
                    { id: 'FOOD', label: '🍖 Makan Besar' },
                    { id: 'SNACK', label: '🍟 Snack & Camilan' },
                    { id: 'BEVERAGE', label: '🍹 Minuman & Bar' },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setSelectedMenuType(pill.id)}
                    className={cn(
                      'px-3 py-1 rounded-lg text-xs font-semibold transition-colors',
                      selectedMenuType === pill.id
                        ? 'bg-ink-900 text-white'
                        : 'bg-surface-muted/70 text-ink-600 hover:bg-ink-100',
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>

              {/* Status Konsep vs Kasir Pills */}
              <div className="flex items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'Semua Status' },
                    { id: 'PUBLISHED', label: '🟢 Tayang di Kasir' },
                    { id: 'DRAFT', label: `🧪 Konsep / Uji Coba (${draftCount})` },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSelectedStatusFilter(st.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors border',
                      selectedStatusFilter === st.id
                        ? st.id === 'DRAFT'
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-surface text-ink-600 border-line hover:bg-surface-muted',
                    )}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* Menu Cards Grid */}
          {filteredMenuItems.length === 0 ? (
            <Card className="p-10 text-center space-y-3 border-dashed border-line">
              <UtensilsCrossed className="size-8 text-ink-400 mx-auto" />
              <div>
                <h3 className="text-sm font-bold text-ink-900">Belum Ada Menu pada Filter Ini</h3>
                <p className="text-xs text-ink-500 mt-1">
                  Klik tombol <strong>&ldquo;+ Buat Menu Baru&rdquo;</strong> untuk menambahkan makanan, camilan, atau minuman baru secara mandiri.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredMenuItems.map((item) => {
                const isSteak =
                  item.outlet_code === 'TSH-01' || item.category_code === 'CAT-STEAK'
                const isDraft = item.status === 'DRAFT'
                const hasBOM = Boolean(item.has_recipe || item.hpa > 0)
                const isGoodMargin =
                  item.selling_price > 0 &&
                  item.food_cost_pct > 0 &&
                  item.food_cost_pct <= (item.target_food_cost_pct || 40)
                const typeBadge = getMenuTypeBadge(item.menu_type)
                const isConfirmingDelete = confirmDeleteKey === `menu-${item.id}`

                return (
                  <Card
                    key={item.id}
                    data-spot="card"
                    className={cn(
                      'p-5 border-line/80 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between',
                      isDraft
                        ? 'border-indigo-300 bg-indigo-50/15 hover:border-indigo-400'
                        : 'hover:border-brand-300',
                    )}
                  >
                    <div className="space-y-2.5">
                      {/* Top Badges Row */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isDraft ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-100 text-indigo-900 border border-indigo-300">
                              <FlaskConical className="size-3" />
                              KONSEP / UJI COBA
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                              <Rocket className="size-3" />
                              TAYANG DI KASIR
                            </span>
                          )}

                          {!item.is_available && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-300">
                              <Ban className="size-3" />
                              HABIS
                            </span>
                          )}

                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border',
                              typeBadge.cls,
                            )}
                          >
                            {typeBadge.icon}
                            {typeBadge.label}
                          </span>

                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-surface-muted text-ink-600 border border-line">
                            {item.category_name}
                          </span>
                        </div>

                        {/* Modal Bahan % Badge */}
                        <span
                          className={cn(
                            'px-2.5 py-0.5 rounded-lg text-xs font-black tabular shrink-0 border',
                            !hasBOM
                              ? 'bg-slate-100 text-slate-700 border-slate-300'
                              : item.selling_price <= 0
                                ? 'bg-indigo-100 text-indigo-900 border-indigo-300'
                                : isGoodMargin
                                  ? 'bg-emerald-100 text-emerald-950 border-emerald-300'
                                  : 'bg-amber-100 text-amber-950 border-amber-300',
                          )}
                          title={`Batas Modal Ideal: ${item.target_food_cost_pct}%`}
                        >
                          {!hasBOM
                            ? 'Belum Ada Resep'
                            : item.selling_price <= 0
                              ? 'Menunggu Harga'
                              : `Modal: ${item.food_cost_pct.toFixed(1)}%`}
                        </span>
                      </div>

                      {/* Title & Outlet / Layar Dapur Info */}
                      <div className="flex items-start gap-2.5 pt-0.5">
                        <span
                          className={cn(
                            'flex size-8 shrink-0 items-center justify-center rounded-lg mt-0.5',
                            isSteak
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800',
                          )}
                        >
                          {isSteak ? <Flame className="size-4" /> : <Trees className="size-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-ink-400 block">
                            {item.code} • {item.outlet_name ?? 'Semua Cabang'}
                          </span>
                          <h3 className="text-base font-bold text-ink-900 leading-snug">
                            {item.name}
                          </h3>
                          {item.kitchen_station && (
                            <span className="text-[10px] text-ink-500 font-medium block mt-0.5">
                              Layar Dapur: {getKitchenStationLabel(item.kitchen_station)}
                            </span>
                          )}
                        </div>
                      </div>

                      {item.description && (
                        <p className="text-xs text-ink-500 line-clamp-2">{item.description}</p>
                      )}
                    </div>

                    {/* Financial Breakdown & Self-Service Controls */}
                    <div className="mt-4 pt-3 border-t border-line/70 space-y-2.5">
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-surface-muted p-2">
                          <span className="text-[10px] text-ink-400 block">Harga Jual</span>
                          <span className="font-bold text-ink-900 tabular text-sm">
                            {item.selling_price > 0
                              ? formatRupiah(item.selling_price)
                              : 'Rp 0 (Konsep)'}
                          </span>
                        </div>

                        <div className="rounded-lg bg-amber-50/50 p-2 border border-amber-100">
                          <span className="text-[10px] text-amber-800 block">Modal Bahan (HPA)</span>
                          <span className="font-bold text-amber-900 tabular text-sm">
                            {hasBOM ? formatRupiah(item.hpa) : '-'}
                          </span>
                        </div>

                        <div className="rounded-lg bg-emerald-50/50 p-2 border border-emerald-100">
                          <span className="text-[10px] text-emerald-800 block">
                            {item.selling_price > 0 ? 'Untung Kotor' : 'Saran Harga'}
                          </span>
                          <span className="font-bold text-emerald-900 tabular text-sm">
                            {item.selling_price > 0
                              ? formatRupiah(item.gross_margin)
                              : item.recommended_price && item.recommended_price > 0
                                ? formatRupiah(item.recommended_price)
                                : '-'}
                          </span>
                        </div>
                      </div>

                      {hasBOM &&
                        item.recommended_price !== undefined &&
                        item.recommended_price > 0 &&
                        item.selling_price > 0 &&
                        item.food_cost_pct > item.target_food_cost_pct && (
                          <div className="rounded-lg bg-amber-50/80 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-950 flex items-center justify-between">
                            <span>
                              Saran Harga Jual (Batas Modal {item.target_food_cost_pct}%):
                            </span>
                            <strong className="tabular font-extrabold">
                              {formatRupiah(item.recommended_price)}
                            </strong>
                          </div>
                        )}

                      {/* Primary Recipe Action Button */}
                      <Button
                        variant={hasBOM ? 'outline' : 'primary'}
                        size="sm"
                        onClick={() => handleOpenDetail(item.id)}
                        disabled={isLoadingDetail}
                        className={cn(
                          'w-full justify-center text-xs py-1.5',
                          hasBOM
                            ? 'hover:bg-brand-50 hover:text-brand-900 hover:border-brand-300'
                            : 'bg-brand-700 text-white font-semibold shadow-xs',
                        )}
                      >
                        {hasBOM ? (
                          <>
                            <Layers className="size-3.5 mr-1.5 text-brand-700" />
                            Lihat &amp; Atur Takaran Resep
                          </>
                        ) : (
                          <>
                            <Plus className="size-3.5 mr-1.5" />
                            + Racik Takaran Resep Sekarang
                          </>
                        )}
                      </Button>

                      {/* Secondary Quick Management Row */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMenuItem(item)
                              setIsMenuFormOpen(true)
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-line bg-surface hover:bg-surface-muted text-[11px] font-semibold text-ink-700 transition-colors"
                          >
                            <Edit3 className="size-3" />
                            Ubah Menu &amp; Harga
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTogglePublish(item)}
                            className={cn(
                              'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-colors',
                              isDraft
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                : 'border-indigo-200 bg-indigo-50/70 text-indigo-900 hover:bg-indigo-100',
                            )}
                          >
                            {isDraft ? (
                              <>
                                <Rocket className="size-3" />
                                Tayangkan ke Kasir
                              </>
                            ) : (
                              <>
                                <FlaskConical className="size-3" />
                                Jadikan Konsep
                              </>
                            )}
                          </button>

                          {!isDraft && (
                            <button
                              type="button"
                              onClick={() => handleToggleAvailability(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-line bg-surface hover:bg-surface-muted text-[11px] font-semibold text-ink-600"
                            >
                              {item.is_available ? 'Tandai Habis' : 'Set Tersedia'}
                            </button>
                          )}
                        </div>

                        {isConfirmingDelete ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeleteMenu(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold transition-colors"
                            >
                              <Trash2 className="size-3" />
                              Ya, Arsipkan
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(null)}
                              className="px-2 py-1 rounded-lg border border-line bg-surface hover:bg-surface-muted text-ink-700 text-[11px] font-semibold transition-colors"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeleteMenu(item)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="size-3" />
                            Arsipkan
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: SAUS & BUMBU RACIKAN DAPUR                                     */}
      {/* ===================================================================== */}
      {activeTab === 'subrecipes' && (
        <div className="space-y-4">
          <Card data-spot="toolbar" className="p-4 border-line flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="size-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={subRecipeSearch}
                onChange={(e) => setSubRecipeSearch(e.target.value)}
                placeholder="Cari saus jamur, bumbu oles bakar, biang sirup gula aren, sambal..."
                className="w-full rounded-xl border border-line bg-surface pl-9 pr-3 py-2 text-xs font-medium text-ink-900 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingSubRecipe(null)
                  setIsSubRecipeFormOpen(true)
                }}
                className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
              >
                <Plus className="size-3.5 mr-1" />
                + Buat Saus / Bumbu Racikan
              </Button>
            </div>
          </Card>

          {filteredSubRecipes.length === 0 ? (
            <Card className="p-10 text-center space-y-3 border-dashed border-line">
              <Sparkles className="size-8 text-amber-500 mx-auto" />
              <div>
                <h3 className="text-sm font-bold text-ink-900">Belum Ada Saus / Bumbu Racikan</h3>
                <p className="text-xs text-ink-500 mt-1 max-w-md mx-auto">
                  Buat olahan setengah jadi seperti Saus Jamur, Sambal Korek, atau Biang Sirup Kopi agar bisa dipakai berulang di berbagai menu dengan hitungan modal per ml atau gram otomatis.
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSubRecipes.map((sr) => {
                const isConfirming = confirmDeleteKey === `sub-${sr.id}`
                const isUsed = (sr.used_in_count ?? 0) > 0
                return (
                  <Card
                    key={sr.id}
                    data-spot="card"
                    className="p-5 border-amber-200/80 bg-gradient-to-br from-surface to-amber-50/20 shadow-xs flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-700 block">
                            {sr.code} • RACIKAN DAPUR
                          </span>
                          <h3 className="text-base font-bold text-ink-900">{sr.name}</h3>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-950 border border-amber-300 shrink-0">
                          Dipakai di {sr.used_in_count ?? 0} Resep
                        </span>
                      </div>

                      {sr.instructions && (
                        <p className="text-xs text-ink-500 line-clamp-2">{sr.instructions}</p>
                      )}
                    </div>

                    <div className="space-y-3 pt-3 border-t border-amber-200/60">
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-surface p-2 border border-line">
                          <span className="text-[10px] text-ink-400 block">Hasil 1x Masak</span>
                          <span className="font-bold text-ink-900 tabular">
                            {sr.yield_portions} {sr.yield_unit}
                          </span>
                        </div>
                        <div className="rounded-lg bg-surface p-2 border border-line">
                          <span className="text-[10px] text-ink-400 block">Modal 1x Masak</span>
                          <span className="font-bold text-ink-900 tabular">
                            {formatRupiah(sr.total_cost_hpa)}
                          </span>
                        </div>
                        <div className="rounded-lg bg-amber-100/70 p-2 border border-amber-300">
                          <span className="text-[10px] text-amber-900 font-semibold block">
                            Modal / {sr.yield_unit}
                          </span>
                          <span className="font-black text-amber-950 tabular">
                            {formatRupiah(sr.cost_per_portion, 2)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenEditSubRecipe(sr.id)}
                          className="flex-1 justify-center text-xs border-amber-300 text-amber-950 hover:bg-amber-100/60"
                        >
                          <Edit3 className="size-3.5 mr-1.5" />
                          Ubah Takaran Racikan
                        </Button>

                        {isConfirming ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleDeleteSubRecipe(sr)}
                              className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
                            >
                              Ya, Hapus
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteKey(null)}
                              className="px-2.5 py-1.5 rounded-lg border border-line bg-surface hover:bg-surface-muted text-ink-700 text-xs font-semibold transition-colors"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDeleteSubRecipe(sr)}
                            className={cn(
                              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1',
                              isUsed
                                ? 'text-ink-400 hover:bg-surface-muted'
                                : 'text-red-600 hover:bg-red-50',
                            )}
                            title={
                              isUsed
                                ? `Sedang dipakai di ${sr.used_in_count} resep aktif`
                                : 'Hapus racikan ini'
                            }
                          >
                            {isUsed && <Lock className="size-3" />}
                            Hapus
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: BAHAN BAKU MENTAH                                              */}
      {/* ===================================================================== */}
      {activeTab === 'ingredients' && (
        <div className="space-y-4">
          <Card data-spot="toolbar" className="p-4 border-line flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="size-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={ingredientSearch}
                onChange={(e) => setIngredientSearch(e.target.value)}
                placeholder="Cari bahan baku mentah, daging, sirup, susu, bumbu, kemasan..."
                className="w-full rounded-xl border border-line bg-surface pl-9 pr-3 py-2 text-xs font-medium text-ink-900 focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedIngCategory}
                onChange={(e) => setSelectedIngCategory(e.target.value)}
                className="rounded-xl border border-line bg-surface px-3 py-2 text-xs font-semibold text-ink-800"
              >
                <option value="ALL">Semua Kategori Bahan ({safeIngredients.length})</option>
                {safeIngCategories.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.name} ({c.item_count})
                  </option>
                ))}
              </select>

              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingIngredient(null)
                  setIsIngredientFormOpen(true)
                }}
                className="text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                <Plus className="size-3.5 mr-1" />
                + Buat Bahan Baku Baru Langsung
              </Button>
            </div>
          </Card>

          <Card data-spot="table" className="overflow-hidden border-line shadow-xs">
            {filteredIngredients.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <Package className="size-8 text-ink-400 mx-auto" />
                <h4 className="text-sm font-bold text-ink-900">Bahan Baku Tidak Ditemukan</h4>
                <p className="text-xs text-ink-500">
                  Klik <strong>&ldquo;+ Tambah Bahan Baku Baru&rdquo;</strong> untuk mendaftarkan bahan baku baru ke daftar resep &amp; semua gudang cabang.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface-muted/70 border-b border-line font-bold text-ink-600 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3.5">Bahan Baku &amp; Kode</th>
                      <th className="p-3.5">Kategori &amp; Tempat Simpan</th>
                      <th className="p-3.5">Kemasan Beli</th>
                      <th className="p-3.5 text-right">Harga Beli Eceran</th>
                      <th className="p-3.5 text-right">Modal Bersih Siap Masak</th>
                      <th className="p-3.5 text-center">Dipakai</th>
                      <th className="p-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filteredIngredients.map((ing) => {
                      const isConfirming = confirmDeleteKey === `ing-${ing.id}`
                      const isUsed = ing.used_in_recipes_count > 0
                      return (
                        <tr key={ing.id} className="hover:bg-surface-muted/30 transition-colors">
                          <td className="p-3.5">
                            <span className="font-bold text-ink-900 block">{ing.name}</span>
                            <span className="text-[10px] font-mono text-ink-400">{ing.code}</span>
                          </td>
                          <td className="p-3.5">
                            <span className="font-semibold text-ink-800 block">
                              {ing.category_name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-muted text-ink-600 border border-line">
                              {formatStorageLabel(ing.storage_type)}
                            </span>
                          </td>
                          <td className="p-3.5 text-ink-600">
                            {ing.purchase_pack_qty && ing.purchase_pack_qty > 0 ? (
                              <span>
                                1 {ing.purchase_unit ?? 'Kemasan'} ({ing.purchase_pack_qty}{' '}
                                {ing.unit})
                                {ing.purchase_pack_price !== undefined && (
                                  <span className="block text-[10px] text-ink-400 tabular">
                                    @ {formatRupiah(ing.purchase_pack_price)}
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span className="text-[11px] text-ink-400">Satuan langsung</span>
                            )}
                          </td>
                          <td className="p-3.5 text-right tabular font-bold text-ink-900">
                            {formatRupiah(ing.cost_price, 2)} / {ing.unit}
                          </td>
                          <td className="p-3.5 text-right tabular">
                            <span className="font-extrabold text-emerald-800 block">
                              {formatRupiah(ing.effective_cost_per_unit, 2)} /{' '}
                              {ing.yield_output_unit ?? ing.unit}
                            </span>
                            <span className="text-[10px] text-ink-400">
                              Bersih {ing.standard_yield_percent}%
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-50 text-brand-800 border border-brand-200">
                              {ing.used_in_recipes_count} Resep
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingIngredient(ing)
                                  setIsIngredientFormOpen(true)
                                }}
                                className="px-2.5 py-1 rounded-lg border border-line bg-surface hover:bg-surface-muted text-[11px] font-semibold text-ink-800"
                              >
                                Ubah
                              </button>

                              {isConfirming ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteIngredient(ing)}
                                    className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold transition-colors"
                                  >
                                    Ya, Hapus
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKey(null)}
                                    className="px-2 py-1 rounded-lg border border-line bg-surface hover:bg-surface-muted text-ink-700 text-[11px] font-semibold transition-colors"
                                  >
                                    Batal
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteIngredient(ing)}
                                  className={cn(
                                    'px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors inline-flex items-center gap-1',
                                    isUsed
                                      ? 'text-ink-400 hover:bg-surface-muted'
                                      : 'text-red-600 hover:bg-red-50',
                                  )}
                                  title={
                                    isUsed
                                      ? `Sedang dipakai di ${ing.used_in_recipes_count} resep aktif`
                                      : 'Hapus bahan baku ini'
                                  }
                                >
                                  {isUsed && <Lock className="size-3" />}
                                  Hapus
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: HITUNG SUSUT BAHAN & RIWAYAT                                   */}
      {/* ===================================================================== */}
      {activeTab === 'yield' && (
        <div className="space-y-6">
          <YieldCalculatorCard
            onSuccess={() => {
              refreshAllCulinaryData()
            }}
          />

          <Card data-spot="table" className="overflow-hidden border border-line shadow-xs">
            <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-ink-900 flex items-center gap-2">
                  <Scale className="size-4 text-amber-600" />
                  Riwayat Catatan Susut Bahan Baku
                </h3>
                <p className="text-xs text-ink-500">
                  Catatan hasil timbangan bersih seluruh bahan dapur yang pernah diuji susut oleh tim resto.
                </p>
              </div>
            </div>

            {safeYieldTests.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="size-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto mb-2">
                  <Scale className="size-5" />
                </div>
                <h4 className="text-xs font-bold text-ink-900">
                  Belum Ada Catatan Hitung Susut untuk Cabang Ini
                </h4>
                <p className="text-[11px] text-ink-500 max-w-md mx-auto leading-relaxed">
                  Gunakan kalkulator di atas untuk mencatat timbangan bersih bahan baku pertama cabang ini.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-surface-muted/60 border-b border-line font-semibold text-ink-700 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-3">Kode / Tanggal</th>
                      <th className="p-3">Jenis &amp; Bahan Baku</th>
                      <th className="p-3 tabular text-right">Berat Awal</th>
                      <th className="p-3 tabular text-right">Hasil Bersih</th>
                      <th className="p-3 tabular text-right">% Bersih</th>
                      <th className="p-3 tabular text-right">Harga Beli</th>
                      <th className="p-3 tabular text-right font-bold text-amber-900">
                        Modal Bersih Siap Masak
                      </th>
                      <th className="p-3 tabular text-right font-bold text-brand-900">
                        Modal / Porsi Saji
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {safeYieldTests.map((test) => {
                      const badge = getTestTypeBadge(test.test_type)

                      return (
                        <tr key={test.id} className="hover:bg-surface-muted/30 transition-colors">
                          <td className="p-3">
                            <span className="font-mono font-semibold text-ink-900 block">
                              {test.batch_number}
                            </span>
                            <span className="text-[10px] text-ink-400">
                              {new Date(test.test_date).toLocaleDateString('id-ID', {
                                dateStyle: 'medium',
                              })}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span
                                className={cn(
                                  'text-[9px] font-bold px-1.5 py-0.2 rounded border',
                                  badge.bg,
                                )}
                              >
                                {badge.icon}
                                {badge.label}
                              </span>
                            </div>
                            <span className="font-semibold text-ink-900 block">
                              {test.item_name}
                            </span>
                            <span className="text-[10px] text-ink-500 font-mono">
                              {test.outlet_name}
                            </span>
                          </td>
                          <td className="p-3 tabular text-right font-medium">
                            {test.initial_weight_kg.toFixed(2)} kg
                          </td>
                          <td className="p-3 tabular text-right font-semibold text-emerald-700">
                            {test.output_quantity.toFixed(outputUnitFormat(test.output_unit))}{' '}
                            {test.output_unit}
                          </td>
                          <td className="p-3 tabular text-right font-bold text-emerald-800">
                            {test.yield_percent.toFixed(1)}%
                          </td>
                          <td className="p-3 tabular text-right text-ink-600">
                            {formatRupiah(test.initial_cost_per_kg)}
                          </td>
                          <td className="p-3 tabular text-right font-bold text-amber-900 bg-amber-50/40">
                            {formatRupiah(test.effective_cost_per_kg)}/{test.output_unit}
                          </td>
                          <td className="p-3 tabular text-right font-extrabold text-brand-900 bg-brand-50/40">
                            {formatRupiah(test.cost_per_portion)} ({test.portion_cut_grams}
                            {test.output_unit === 'ml' ? 'ml' : 'g'})
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODALS                                                                */}
      {/* ===================================================================== */}

      {/* 1. Menu Create / Edit Modal */}
      <MenuFormModal
        isOpen={isMenuFormOpen}
        editingItem={editingMenuItem}
        categories={safeMenuCategories}
        onClose={() => {
          setIsMenuFormOpen(false)
          setEditingMenuItem(null)
        }}
        onSaved={(savedDetail, openBomBuilderNext) => {
          setIsMenuFormOpen(false)
          setEditingMenuItem(null)
          refreshAllCulinaryData()
          showFeedback('success', `Menu "${savedDetail.menu_item.name}" berhasil disimpan!`)
          if (openBomBuilderNext) {
            setBomInitialMode('edit')
            setSelectedMenuDetail(savedDetail)
          }
        }}
      />

      {/* 2. Recipe Multi-Unit Builder Modal */}
      <RecipeDetailModal
        detail={selectedMenuDetail}
        {...(bomInitialMode ? { initialMode: bomInitialMode } : {})}
        onClose={() => {
          setSelectedMenuDetail(null)
          setBomInitialMode(undefined)
        }}
        onSaved={(updatedDetail) => {
          setSelectedMenuDetail(updatedDetail)
          refreshAllCulinaryData()
        }}
        onEditMenuInfo={(menuToEdit) => {
          setSelectedMenuDetail(null)
          setBomInitialMode(undefined)
          setEditingMenuItem(menuToEdit)
          setIsMenuFormOpen(true)
        }}
      />

      {/* 3. Saus & Bumbu Racikan Form Modal */}
      <SubRecipeFormModal
        isOpen={isSubRecipeFormOpen}
        editingSubRecipe={editingSubRecipe}
        onClose={() => {
          setIsSubRecipeFormOpen(false)
          setEditingSubRecipe(null)
        }}
        onSaved={(savedSub) => {
          setIsSubRecipeFormOpen(false)
          setEditingSubRecipe(null)
          refreshAllCulinaryData()
          showFeedback(
            'success',
            `Racikan "${savedSub.name}" tersimpan (${formatRupiah(savedSub.cost_per_portion, 2)}/${savedSub.yield_unit}) & modal menu terkait otomatis diperbarui!`,
          )
        }}
      />

      {/* 4. Bahan Baku Mentah Form Modal */}
      <IngredientFormModal
        isOpen={isIngredientFormOpen}
        editingIngredient={editingIngredient}
        categories={safeIngCategories}
        onClose={() => {
          setIsIngredientFormOpen(false)
          setEditingIngredient(null)
        }}
        onSaved={(savedIng) => {
          setIsIngredientFormOpen(false)
          setEditingIngredient(null)
          refreshAllCulinaryData()
          showFeedback(
            'success',
            `Bahan baku "${savedIng.name}" tersimpan (${formatRupiah(savedIng.cost_price, 2)}/${savedIng.unit}) & modal seluruh resep terkait otomatis diperbarui!`,
          )
        }}
      />
    </div>
  )
}

function outputUnitFormat(unit: string) {
  if (unit === 'ml' || unit === 'g') return 0
  return 2
}
