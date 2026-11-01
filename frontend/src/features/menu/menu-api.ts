import { api } from '@/shared/api/client'
import type {
  BOMOptionsResponse,
  ButcheringYieldTest,
  CreateInventoryCategoryRequest,
  CreateMenuCategoryRequest,
  CreateYieldTestPayload,
  InventoryCategory,
  MasterIngredient,
  MenuCategory,
  MenuItemDetail,
  MenuItemWithHPA,
  SaveMasterIngredientRequest,
  SaveMenuItemRequest,
  SaveRecipeRequest,
  SubRecipeBOMOption,
  SubRecipeDetail,
  UpdateMenuItemStatusRequest,
} from './types'

// -----------------------------------------------------------------------------
// 1. Menu Categories & Menu Items (Tier 3 + R&D Lifecycle)
// -----------------------------------------------------------------------------

export async function fetchMenuCategories(): Promise<MenuCategory[]> {
  const res = await api.requestList<MenuCategory>('/api/v1/menu/categories')
  return res ?? []
}

export async function createMenuCategory(payload: CreateMenuCategoryRequest): Promise<MenuCategory> {
  return api.request<MenuCategory>('/api/v1/menu/categories', {
    method: 'POST',
    body: payload,
  })
}

export async function fetchMenuItems(
  outletId?: string,
  options?: { posOnly?: boolean },
): Promise<MenuItemWithHPA[]> {
  const params = new URLSearchParams()
  if (outletId && outletId !== 'ALL') {
    params.set('outlet_id', outletId)
  }
  if (options?.posOnly) {
    params.set('pos_only', 'true')
  }
  const qs = params.toString()
  const res = await api.requestList<MenuItemWithHPA>(`/api/v1/menu/items${qs ? `?${qs}` : ''}`)
  return res ?? []
}

export async function fetchMenuItemDetail(id: string): Promise<MenuItemDetail> {
  return api.request<MenuItemDetail>(`/api/v1/menu/items/${id}`)
}

export async function createMenuItem(payload: SaveMenuItemRequest): Promise<MenuItemDetail> {
  return api.request<MenuItemDetail>('/api/v1/menu/items', {
    method: 'POST',
    body: payload,
  })
}

export async function updateMenuItem(id: string, payload: SaveMenuItemRequest): Promise<MenuItemDetail> {
  return api.request<MenuItemDetail>(`/api/v1/menu/items/${id}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function updateMenuItemStatus(
  id: string,
  payload: UpdateMenuItemStatusRequest,
): Promise<MenuItemDetail> {
  return api.request<MenuItemDetail>(`/api/v1/menu/items/${id}/status`, {
    method: 'PATCH',
    body: payload,
  })
}

export async function deleteMenuItem(id: string): Promise<void> {
  await api.request<{ status: string; id: string }>(`/api/v1/menu/items/${id}`, {
    method: 'DELETE',
  })
}

export async function saveMenuRecipe(menuId: string, payload: SaveRecipeRequest): Promise<MenuItemDetail> {
  return api.request<MenuItemDetail>(`/api/v1/menu/items/${menuId}/recipe`, {
    method: 'PUT',
    body: payload,
  })
}

// -----------------------------------------------------------------------------
// 2. Sub-Recipes & BOM Options (Tier 2 Kitchen Prep)
// -----------------------------------------------------------------------------

export async function fetchBOMOptions(): Promise<BOMOptionsResponse> {
  const res = await api.request<BOMOptionsResponse>('/api/v1/menu/bom-options')
  return {
    inventory_items: res?.inventory_items ?? [],
    sub_recipes: res?.sub_recipes ?? [],
  }
}

export async function fetchSubRecipes(): Promise<SubRecipeBOMOption[]> {
  const res = await api.requestList<SubRecipeBOMOption>('/api/v1/recipes?type=SUB_RECIPE')
  return res ?? []
}

export async function fetchSubRecipeDetail(id: string): Promise<SubRecipeDetail> {
  return api.request<SubRecipeDetail>(`/api/v1/recipes/${id}`)
}

export async function createSubRecipe(payload: SaveRecipeRequest): Promise<SubRecipeDetail> {
  return api.request<SubRecipeDetail>('/api/v1/recipes', {
    method: 'POST',
    body: payload,
  })
}

export async function updateSubRecipe(id: string, payload: SaveRecipeRequest): Promise<SubRecipeDetail> {
  return api.request<SubRecipeDetail>(`/api/v1/recipes/${id}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deleteSubRecipe(id: string): Promise<void> {
  await api.request<{ status: string; id: string }>(`/api/v1/recipes/${id}`, {
    method: 'DELETE',
  })
}

// -----------------------------------------------------------------------------
// 3. Master Ingredients & Categories (Tier 1 Raw Materials)
// -----------------------------------------------------------------------------

export async function fetchIngredientCategories(): Promise<InventoryCategory[]> {
  const res = await api.requestList<InventoryCategory>('/api/v1/menu/ingredient-categories')
  return res ?? []
}

export async function createIngredientCategory(
  payload: CreateInventoryCategoryRequest,
): Promise<InventoryCategory> {
  return api.request<InventoryCategory>('/api/v1/menu/ingredient-categories', {
    method: 'POST',
    body: payload,
  })
}

export async function fetchMasterIngredients(): Promise<MasterIngredient[]> {
  const res = await api.requestList<MasterIngredient>('/api/v1/menu/ingredients')
  return res ?? []
}

export async function createMasterIngredient(
  payload: SaveMasterIngredientRequest,
): Promise<MasterIngredient> {
  return api.request<MasterIngredient>('/api/v1/menu/ingredients', {
    method: 'POST',
    body: payload,
  })
}

export async function updateMasterIngredient(
  id: string,
  payload: SaveMasterIngredientRequest,
): Promise<MasterIngredient> {
  return api.request<MasterIngredient>(`/api/v1/menu/ingredients/${id}`, {
    method: 'PUT',
    body: payload,
  })
}

export async function deleteMasterIngredient(id: string): Promise<void> {
  await api.request<{ status: string; id: string }>(`/api/v1/menu/ingredients/${id}`, {
    method: 'DELETE',
  })
}

// -----------------------------------------------------------------------------
// 4. Universal Yield Tests
// -----------------------------------------------------------------------------

export async function fetchYieldTests(outletId?: string): Promise<ButcheringYieldTest[]> {
  const query = outletId && outletId !== 'ALL' ? `?outlet_id=${outletId}` : ''
  const res = await api.requestList<ButcheringYieldTest>(`/api/v1/inventory/yield-tests${query}`)
  return res ?? []
}

export async function recordYieldTest(payload: CreateYieldTestPayload): Promise<ButcheringYieldTest> {
  return api.request<ButcheringYieldTest>('/api/v1/inventory/yield-tests', {
    method: 'POST',
    body: payload,
  })
}
