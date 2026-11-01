export type MenuType = 'FOOD' | 'SNACK' | 'BEVERAGE'
export type MenuStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
export type KitchenStationCode =
  | 'GRILL_STEAK'
  | 'SIDES_PANTRY'
  | 'BEVERAGE_BAR'
  | 'BAKARAN_GORENG'
  | 'DAPUR_NUSANTARA'
  | 'BAR_TRADISIONAL'
  | 'EXPEDITER'
  | 'NONE'

export interface MenuCategory {
  id: string
  code: string
  name: string
  display_order: number
  menu_count: number
}

export interface CreateMenuCategoryRequest {
  code?: string
  name: string
  display_order?: number
}

export interface MenuItemWithHPA {
  id: string
  tenant_id: string
  outlet_id?: string
  outlet_code?: string
  outlet_name?: string
  category_id?: string
  category_code: string
  category_name: string
  code: string
  name: string
  description?: string
  menu_type?: MenuType
  status?: MenuStatus
  kitchen_station?: string
  selling_price: number
  hpa: number
  gross_margin: number
  food_cost_pct: number
  target_food_cost_pct: number
  recommended_price?: number
  hpa_calculation_mode?: string
  manual_hpa?: number
  has_recipe?: boolean
  is_available: boolean
  image_url?: string
}

export interface SaveMenuItemRequest {
  outlet_id?: string
  category_id?: string
  custom_category_name?: string
  code?: string
  name: string
  description?: string
  menu_type: MenuType
  kitchen_station?: string
  status: MenuStatus
  selling_price: number
  target_food_cost_pct: number
  is_available?: boolean
  hpa_calculation_mode?: string
  manual_hpa?: number
  image_url?: string
  recipe?: SaveRecipeRequest
}

export interface UpdateMenuItemStatusRequest {
  status?: MenuStatus
  is_available?: boolean
}

export interface RecipeIngredientDetail {
  id: string
  inventory_id?: string
  sub_recipe_id?: string
  item_code?: string
  item_name: string
  is_sub_recipe: boolean
  cost_basis: 'EP_YIELDED' | 'AP_RAW'
  quantity: number
  unit: string
  gross_quantity: number
  net_quantity: number
  yield_percent_applied: number
  unit_cost: number
  subtotal_cost: number
}

export interface MenuItemDetail {
  menu_item: MenuItemWithHPA
  recipe_id?: string
  recipe_code: string
  recipe_name: string
  yield_portions: number
  yield_unit: string
  instructions?: string
  ingredients: RecipeIngredientDetail[]
}

export interface SaveRecipeIngredientInput {
  inventory_item_id?: string
  sub_recipe_id?: string
  cost_basis: 'EP_YIELDED' | 'AP_RAW'
  quantity: number
  unit: string
  yield_percent_applied?: number
}

export interface SaveRecipeRequest {
  recipe_code?: string
  recipe_name: string
  yield_portions: number
  yield_unit: string
  instructions?: string
  ingredients: SaveRecipeIngredientInput[]
}

export interface SubRecipeDetail {
  id: string
  code: string
  name: string
  recipe_type: string
  yield_portions: number
  yield_unit: string
  total_cost_hpa: number
  cost_per_portion: number
  instructions?: string
  used_in_count: number
  ingredients: RecipeIngredientDetail[]
}

export interface InventoryCategory {
  id: string
  code: string
  name: string
  description?: string
  item_count: number
}

export interface CreateInventoryCategoryRequest {
  code?: string
  name: string
  description?: string
}

export interface MasterIngredient {
  id: string
  category_id: string
  category_code: string
  category_name: string
  code: string
  name: string
  unit: string
  storage_type: 'DRY' | 'CHILLER' | 'FREEZER' | string
  cost_price: number
  purchase_unit?: string
  purchase_pack_qty?: number
  purchase_pack_price?: number
  standard_yield_percent: number
  effective_cost_per_unit: number
  yield_output_unit?: string
  yield_conversion_ratio?: number
  current_stock: number
  min_stock_alert: number
  is_active: boolean
  used_in_recipes_count: number
}

export interface SaveMasterIngredientRequest {
  category_id?: string
  custom_category_name?: string
  code?: string
  name: string
  unit: string
  storage_type: string
  cost_price: number
  purchase_unit?: string
  purchase_pack_qty?: number
  purchase_pack_price?: number
  standard_yield_percent?: number
  yield_output_unit?: string
  yield_conversion_ratio?: number
  min_stock_alert?: number
  is_active?: boolean
}

export interface InventoryItemBOMOption {
  id: string
  code: string
  name: string
  unit: string
  storage_type: string
  cost_price: number
  standard_yield_percent: number
  effective_cost_per_unit: number
  yield_output_unit?: string
  yield_conversion_ratio?: number
  category_code: string
  category_name: string
}

export interface SubRecipeBOMOption {
  id: string
  code: string
  name: string
  recipe_type: string
  yield_portions: number
  yield_unit: string
  total_cost_hpa: number
  cost_per_portion: number
  instructions?: string
  used_in_count?: number
}

export interface BOMOptionsResponse {
  inventory_items: InventoryItemBOMOption[]
  sub_recipes: SubRecipeBOMOption[]
}

export interface ButcheringYieldTest {
  id: string
  tenant_id: string
  outlet_id: string
  outlet_code: string
  outlet_name: string
  item_id: string
  item_code: string
  item_name: string
  test_type: 'MEAT_BUTCHERING' | 'POULTRY_FISH' | 'PRODUCE_JUICE' | 'GENERAL_YIELD'
  batch_number: string
  test_date: string
  initial_weight_kg: number
  initial_cost_per_kg: number
  total_cost: number
  usable_meat_kg: number
  output_quantity: number
  output_unit: string
  waste_fat_kg: number
  usable_trim_kg: number
  yield_percent: number
  effective_cost_per_kg: number
  portion_cut_grams: number
  cost_per_portion: number
  notes?: string
}

export interface CreateYieldTestPayload {
  outlet_id: string
  item_id: string
  test_type?: 'MEAT_BUTCHERING' | 'POULTRY_FISH' | 'PRODUCE_JUICE' | 'GENERAL_YIELD'
  batch_number: string
  test_date?: string
  initial_weight_kg: number
  initial_cost_per_kg: number
  usable_meat_kg: number
  output_quantity?: number
  output_unit?: string
  waste_fat_kg: number
  usable_trim_kg: number
  portion_cut_grams: number
  notes?: string
  apply_to_master?: boolean
}
