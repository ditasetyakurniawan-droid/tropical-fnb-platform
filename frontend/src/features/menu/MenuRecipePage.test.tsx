import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MenuRecipePage } from './MenuRecipePage'
import * as menuApi from './menu-api'
import type {
  MasterIngredient,
  MenuCategory,
  MenuItemDetail,
  MenuItemWithHPA,
  SubRecipeBOMOption,
} from './types'
import {
  calculateRecommendedSellingPrice,
  convertClientUoMFactor,
  suggestKitchenStation,
} from './uom-helpers'

vi.mock('./menu-api', () => ({
  fetchMenuCategories: vi.fn(),
  createMenuCategory: vi.fn(),
  fetchMenuItems: vi.fn(),
  fetchMenuItemDetail: vi.fn(),
  createMenuItem: vi.fn(),
  updateMenuItem: vi.fn(),
  updateMenuItemStatus: vi.fn(),
  deleteMenuItem: vi.fn(),
  saveMenuRecipe: vi.fn(),
  fetchBOMOptions: vi.fn(),
  fetchSubRecipes: vi.fn(),
  fetchSubRecipeDetail: vi.fn(),
  createSubRecipe: vi.fn(),
  updateSubRecipe: vi.fn(),
  deleteSubRecipe: vi.fn(),
  fetchIngredientCategories: vi.fn(),
  createIngredientCategory: vi.fn(),
  fetchMasterIngredients: vi.fn(),
  createMasterIngredient: vi.fn(),
  updateMasterIngredient: vi.fn(),
  deleteMasterIngredient: vi.fn(),
  fetchYieldTests: vi.fn(),
  recordYieldTest: vi.fn(),
}))

const MOCK_CATEGORIES: MenuCategory[] = [
  {
    id: 'cat-1',
    code: 'CAT-STEAK',
    name: 'Steak House Specialties',
    display_order: 1,
    menu_count: 1,
  },
]

const MOCK_ITEMS: MenuItemWithHPA[] = [
  {
    id: 'm-1',
    tenant_id: 't-1',
    outlet_id: 'out-1',
    outlet_code: 'TSH-01',
    outlet_name: 'Tropical Steak House',
    category_id: 'cat-1',
    category_code: 'CAT-STEAK',
    category_name: 'Steak House Specialties',
    code: 'MENU-TSH-TEND-200',
    name: 'Australian Tenderloin Steak 200g',
    description: 'Daging empuk dengan saus jamur',
    menu_type: 'FOOD',
    status: 'PUBLISHED',
    kitchen_station: 'GRILL_STEAK',
    selling_price: 88000,
    hpa: 41427,
    gross_margin: 46573,
    food_cost_pct: 47.1,
    target_food_cost_pct: 48,
    has_recipe: true,
    is_available: true,
  },
]

const MOCK_SUB_RECIPES: SubRecipeBOMOption[] = [
  {
    id: 'sub-1',
    code: 'SUB-MUSHROOM',
    name: 'Homemade Creamy Mushroom Sauce',
    recipe_type: 'SUB_RECIPE',
    yield_portions: 2000,
    yield_unit: 'ml',
    total_cost_hpa: 84000,
    cost_per_portion: 42,
    used_in_count: 3,
  },
]

const MOCK_INGREDIENTS: MasterIngredient[] = [
  {
    id: 'ing-raw-1',
    category_id: 'icat-1',
    category_code: 'SYRUP',
    category_name: 'Sirup & Bar',
    code: 'ING-LYCHEE',
    name: 'Sirup Lychee Monin',
    unit: 'ml',
    storage_type: 'DRY',
    cost_price: 153.33,
    purchase_unit: 'Botol',
    purchase_pack_qty: 750,
    purchase_pack_price: 115000,
    standard_yield_percent: 100,
    effective_cost_per_unit: 153.33,
    current_stock: 1500,
    min_stock_alert: 500,
    is_active: true,
    used_in_recipes_count: 2,
  },
  {
    id: 'ing-raw-2',
    category_id: 'icat-1',
    category_code: 'SYRUP',
    category_name: 'Sirup & Bar',
    code: 'ING-PANDAN',
    name: 'Sirup Pandan Uji Coba',
    unit: 'ml',
    storage_type: 'DRY',
    cost_price: 100,
    standard_yield_percent: 100,
    effective_cost_per_unit: 100,
    current_stock: 0,
    min_stock_alert: 0,
    is_active: true,
    used_in_recipes_count: 0,
  },
]

const MOCK_DETAIL: MenuItemDetail = {
  menu_item: MOCK_ITEMS[0]!,
  recipe_code: 'REC-TEND',
  recipe_name: 'Resep Tenderloin 200g Lengkap',
  yield_portions: 1,
  yield_unit: 'porsi',
  instructions: 'Panggang medium',
  ingredients: [
    {
      id: 'ing-1',
      item_name: 'Homemade Creamy Mushroom Sauce',
      is_sub_recipe: true,
      cost_basis: 'EP_YIELDED',
      quantity: 100,
      unit: 'ml',
      gross_quantity: 100,
      net_quantity: 100,
      yield_percent_applied: 100,
      unit_cost: 42,
      subtotal_cost: 4200,
    },
    {
      id: 'ing-2',
      item_name: 'Australian Beef Tenderloin Whole',
      is_sub_recipe: false,
      cost_basis: 'EP_YIELDED',
      quantity: 0.2,
      unit: 'kg',
      gross_quantity: 0.2439,
      net_quantity: 0.2,
      yield_percent_applied: 82,
      unit_cost: 164634.15,
      subtotal_cost: 32927,
    },
  ],
}

describe('MenuRecipePage & Culinary Self-Service Hub', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    vi.clearAllMocks()
    vi.mocked(menuApi.fetchMenuCategories).mockResolvedValue(MOCK_CATEGORIES)
    vi.mocked(menuApi.fetchMenuItems).mockResolvedValue(MOCK_ITEMS)
    vi.mocked(menuApi.fetchSubRecipes).mockResolvedValue(MOCK_SUB_RECIPES)
    vi.mocked(menuApi.fetchMasterIngredients).mockResolvedValue(MOCK_INGREDIENTS)
    vi.mocked(menuApi.fetchIngredientCategories).mockResolvedValue([
      { id: 'icat-1', code: 'SYRUP', name: 'Sirup & Bar', item_count: 2 },
    ])
    vi.mocked(menuApi.fetchYieldTests).mockResolvedValue([])
    vi.mocked(menuApi.fetchMenuItemDetail).mockResolvedValue(MOCK_DETAIL)
    vi.mocked(menuApi.fetchBOMOptions).mockResolvedValue({ inventory_items: [], sub_recipes: [] })
  })

  it('renders KPI metrics and menu item card with HPA in plain Indonesian', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MenuRecipePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Australian Tenderloin Steak 200g')).toBeInTheDocument()
    })

    expect(screen.getByText(/Total Menu Terdaftar/i)).toBeInTheDocument()
    expect(screen.getByText('47.1%')).toBeInTheDocument()
    expect(screen.getByText(/Lihat & Atur Takaran Resep/i)).toBeInTheDocument()
  })

  it('navigates across Saus & Bumbu Racikan, Bahan Baku Mentah, and Hitung Susut tabs', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MenuRecipePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    // Switch to Saus & Bumbu Racikan tab
    fireEvent.click(screen.getByRole('button', { name: /Saus & Bumbu Racikan/i }))
    await waitFor(() => {
      expect(screen.getByText('Homemade Creamy Mushroom Sauce')).toBeInTheDocument()
      expect(screen.getByText(/2000 ml/i)).toBeInTheDocument()
    })

    // Switch to Bahan Baku Mentah tab
    fireEvent.click(screen.getByRole('button', { name: /Bahan Baku Mentah/i }))
    await waitFor(() => {
      expect(screen.getByText('Sirup Lychee Monin')).toBeInTheDocument()
      expect(screen.getByText(/1 Botol \(750 ml\)/i)).toBeInTheDocument()
    })

    // Switch to Hitung Susut Bahan tab
    fireEvent.click(screen.getByRole('button', { name: /Hitung Susut Bahan/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/Kalkulator Hitung Susut Bahan/i),
      ).toBeInTheDocument()
      expect(screen.getByText(/Hasil Hitungan Modal Bersih/i)).toBeInTheDocument()
    })
  })

  it('protects in-use ingredients and provides Batal cancel button for unused ingredient deletion', async () => {
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MenuRecipePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await user.click(screen.getByRole('button', { name: /Bahan Baku Mentah/i }))
    await waitFor(() => {
      expect(screen.getByText('Sirup Lychee Monin')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: /^Hapus$/i })
    // First row (Sirup Lychee Monin) is used in 2 recipes -> protected
    await user.click(deleteButtons[0]!)
    expect(screen.getByText(/aman terlindungi karena sedang dipakai di 2 resep aktif/i)).toBeInTheDocument()
    expect(menuApi.deleteMasterIngredient).not.toHaveBeenCalled()

    // Second row (Sirup Pandan Uji Coba) has 0 recipes -> shows Ya, Hapus + Batal
    await user.click(deleteButtons[1]!)
    expect(screen.getByRole('button', { name: /Ya, Hapus/i })).toBeInTheDocument()
    const cancelBtn = screen.getByRole('button', { name: /^Batal$/i })
    expect(cancelBtn).toBeInTheDocument()

    // Clicking Batal cancels deletion safely
    await user.click(cancelBtn)
    expect(screen.queryByRole('button', { name: /Ya, Hapus/i })).not.toBeInTheDocument()
    expect(menuApi.deleteMasterIngredient).not.toHaveBeenCalled()
  })

  it('opens recipe detail modal when clicking Lihat & Atur Takaran Resep', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MenuRecipePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Lihat & Atur Takaran Resep/i }),
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Lihat & Atur Takaran Resep/i }))

    await waitFor(() => {
      expect(screen.getByText(/Rincian Takaran Bahan & Saus Racikan/i)).toBeInTheDocument()
      expect(screen.getByText('Saus, Bumbu & Biang Racikan Dapur')).toBeInTheDocument()
      expect(
        screen.getByText('Bahan Baku Mentah & Pelengkap Langsung'),
      ).toBeInTheDocument()
    })
  })

  it('opens Menu Form Modal, strips leading zero on price input, and submits custom menu', async () => {
    const user = userEvent.setup()
    const newDraftDetail: MenuItemDetail = {
      menu_item: {
        id: 'm-rnd-1',
        tenant_id: 't-1',
        category_code: 'CAT-MOCKTAIL',
        category_name: 'Signature Mocktails',
        code: 'MENU-LYCHEE',
        name: 'Tropical Lychee Breeze',
        menu_type: 'BEVERAGE',
        status: 'DRAFT',
        kitchen_station: 'BEVERAGE_BAR',
        selling_price: 28000,
        hpa: 0,
        gross_margin: 28000,
        food_cost_pct: 0,
        target_food_cost_pct: 25,
        is_available: true,
      },
      recipe_code: '',
      recipe_name: '',
      yield_portions: 1,
      yield_unit: 'porsi',
      ingredients: [],
    }
    vi.mocked(menuApi.createMenuItem).mockResolvedValue(newDraftDetail)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MenuRecipePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Australian Tenderloin Steak 200g')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /\+ Buat Menu Baru/i }))
    expect(screen.getByText('Buat Menu Baru')).toBeInTheDocument()

    // Choose Minuman & Bar card inside modal
    await user.click(screen.getByRole('button', { name: /Mocktail, Kopi, Jus/i }))
    await user.type(screen.getByLabelText(/Nama Menu/i), 'Tropical Lychee Breeze')

    // Click Harga Jual Menu (initially '0') and type 28000 -> must become '28000' without leading '0'
    const priceInput = screen.getByLabelText(/Harga Jual Menu/i) as HTMLInputElement
    await user.click(priceInput)
    await user.keyboard('28000')
    expect(priceInput.value).toBe('28000')

    // Switch to custom category
    await user.click(screen.getByRole('button', { name: /\+ Ketik Kategori Baru/i }))
    await user.type(screen.getByPlaceholderText(/Ketik kategori baru/i), 'Signature Mocktails')

    await user.click(screen.getByRole('button', { name: /Simpan Info Menu Saja/i }))

    await waitFor(() => {
      expect(menuApi.createMenuItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Tropical Lychee Breeze',
          custom_category_name: 'Signature Mocktails',
          menu_type: 'BEVERAGE',
          status: 'DRAFT',
          selling_price: 28000,
        }),
      )
    })
  })

  it('allows owner to click + Buat Bahan Baku Baru Langsung from top banner and enter custom unit', async () => {
    const user = userEvent.setup()
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const newCreatedIng: MasterIngredient = {
      id: 'ing-custom-1',
      category_id: 'icat-1',
      category_code: 'RAW-MEAT',
      category_name: 'Daging Segar',
      code: 'RAW-PAPAN-PETE',
      name: 'Petai Segar Papan',
      cost_price: 5000,
      unit: 'papan',
      storage_type: 'DRY',
      standard_yield_percent: 100,
      effective_cost_per_unit: 5000,
      current_stock: 0,
      min_stock_alert: 5,
      is_active: true,
      used_in_recipes_count: 0,
    }
    vi.mocked(menuApi.createMasterIngredient).mockResolvedValue(newCreatedIng)

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <MenuRecipePage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('Australian Tenderloin Steak 200g')).toBeInTheDocument()
    })

    // Find and click hero banner shortcut
    const createIngBtns = screen.getAllByRole('button', { name: /\+ Buat Bahan Baku Baru Langsung/i })
    expect(createIngBtns.length).toBeGreaterThan(0)
    await user.click(createIngBtns[0]!)

    expect(screen.getByText('Tambah Bahan Baku Baru')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Nama Bahan Baku/i), 'Petai Segar Papan')

    // Switch to custom unit
    await user.click(screen.getByRole('button', { name: /\+ Ketik Satuan Sendiri/i }))
    const unitInput = screen.getByPlaceholderText(/ekor, siung, loyang, papan/i)
    await user.clear(unitInput)
    await user.type(unitInput, 'papan')

    // Switch to direct cost input mode
    await user.click(screen.getByRole('button', { name: /Isi Langsung/i }))
    const costInput = screen.getByLabelText(/Harga Modal Beli per/i) as HTMLInputElement
    await user.click(costInput)
    await user.keyboard('5000')

    await user.click(screen.getByRole('button', { name: /Simpan Bahan Baku/i }))

    await waitFor(() => {
      expect(menuApi.createMasterIngredient).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Petai Segar Papan',
          unit: 'papan',
          cost_price: 5000,
        }),
      )
    })
  })

  it('accurately converts multi-unit culinary UoMs and computes recommended selling prices', () => {
    expect(convertClientUoMFactor('ons', 'kg')).toBeCloseTo(0.1, 5)
    expect(convertClientUoMFactor('sdm', 'ml')).toBeCloseTo(15, 5)
    expect(convertClientUoMFactor('sdt', 'liter')).toBeCloseTo(0.005, 5)
    expect(convertClientUoMFactor('ml', 'kg')).toBeNull()
    expect(convertClientUoMFactor('ml', 'kg', 'ml', 440)).toBeCloseTo(1 / 440, 6)

    const rec = calculateRecommendedSellingPrice(12500, 30)
    expect(rec.roundedThousand).toBe(42000)

    expect(suggestKitchenStation('TSH-01', 'BEVERAGE')).toBe('BEVERAGE_BAR')
    expect(suggestKitchenStation('TGR-01', 'SNACK')).toBe('DAPUR_NUSANTARA')
  })
})
