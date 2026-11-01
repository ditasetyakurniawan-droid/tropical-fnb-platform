import type {
  CancelTransferPayload,
  CreateGRInput,
  CreateOpnameInput,
  CreatePOInput,
  CreateSupplierInput,
  CreateTransferPayload,
  CreateWarehousePayload,
  CreateWasteInput,
  DispatchTransferPayload,
  GoodsReceipt,
  InventoryItem,
  MenuHpaItem,
  PurchaseOrder,
  ReceiveTransferPayload,
  SaveOpnameCountInput,
  StockBalance,
  StockOpname,
  StockTransfer,
  Supplier,
  UpdateMenuHpaInput,
  UpdateWarehousePayload,
  Warehouse,
  WasteRecord,
} from './types'
import { api } from '@/shared/api/client'

// 1. Warehouses & Balances
export async function listWarehouses(outletId?: string, signal?: AbortSignal): Promise<Warehouse[]> {
  const query = outletId && outletId !== 'ALL' ? `?outlet_id=${encodeURIComponent(outletId)}` : ''
  const res = await api.requestList<Warehouse>(`/api/v1/inventory/warehouses${query}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function getWarehouse(id: string, signal?: AbortSignal): Promise<Warehouse> {
  return api.request<Warehouse>(`/api/v1/inventory/warehouses/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  })
}

export async function createWarehouse(input: CreateWarehousePayload): Promise<Warehouse> {
  return api.request<Warehouse>('/api/v1/inventory/warehouses', {
    method: 'POST',
    body: input,
  })
}

export async function updateWarehouse(id: string, input: UpdateWarehousePayload): Promise<Warehouse> {
  return api.request<Warehouse>(`/api/v1/inventory/warehouses/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: input,
  })
}

export async function deleteWarehouse(id: string): Promise<{ message: string }> {
  return api.request<{ message: string }>(`/api/v1/inventory/warehouses/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function listStockBalances(warehouseId: string, signal?: AbortSignal): Promise<StockBalance[]> {
  const res = await api.requestList<StockBalance>(
    `/api/v1/inventory/stock-balances?warehouse_id=${encodeURIComponent(warehouseId)}`,
    {
      ...(signal ? { signal } : {}),
    },
  )
  return res ?? []
}

export async function listInventoryItems(signal?: AbortSignal): Promise<InventoryItem[]> {
  const res = await api.requestList<InventoryItem>('/api/v1/inventory/items', {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

// 2. Suppliers
export async function listSuppliers(signal?: AbortSignal): Promise<Supplier[]> {
  const res = await api.requestList<Supplier>('/api/v1/procurement/suppliers', {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  return api.request<Supplier>('/api/v1/procurement/suppliers', {
    method: 'POST',
    body: input,
  })
}

// 3. Purchase Orders
export async function listPurchaseOrders(
  warehouseId?: string,
  status?: string,
  signal?: AbortSignal,
): Promise<PurchaseOrder[]> {
  const params = new URLSearchParams()
  if (warehouseId && warehouseId !== 'ALL') params.append('warehouse_id', warehouseId)
  if (status && status !== 'ALL') params.append('status', status)
  const qs = params.toString() ? `?${params.toString()}` : ''
  const res = await api.requestList<PurchaseOrder>(`/api/v1/procurement/purchase-orders${qs}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function getPurchaseOrder(id: string, signal?: AbortSignal): Promise<PurchaseOrder> {
  const res = await api.request<PurchaseOrder>(`/api/v1/procurement/purchase-orders/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  })
  if (res && !Array.isArray(res.items)) {
    res.items = []
  }
  return res
}

export async function createPurchaseOrder(input: CreatePOInput): Promise<PurchaseOrder> {
  return api.request<PurchaseOrder>('/api/v1/procurement/purchase-orders', {
    method: 'POST',
    body: input,
  })
}

export async function cancelPurchaseOrder(id: string): Promise<{ message: string }> {
  return api.request<{ message: string }>(`/api/v1/procurement/purchase-orders/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  })
}

// 4. Goods Receipts
export async function listGoodsReceipts(warehouseId?: string, signal?: AbortSignal): Promise<GoodsReceipt[]> {
  const query = warehouseId && warehouseId !== 'ALL' ? `?warehouse_id=${encodeURIComponent(warehouseId)}` : ''
  const res = await api.requestList<GoodsReceipt>(`/api/v1/procurement/goods-receipts${query}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function createGoodsReceipt(input: CreateGRInput): Promise<GoodsReceipt> {
  return api.request<GoodsReceipt>('/api/v1/procurement/goods-receipts', {
    method: 'POST',
    body: input,
  })
}

// 5. Stock Transfers (Decentralized Peer-to-Peer Inter-Branch & Intra-Branch)
export interface ListStockTransfersParams {
  outlet_id?: string | undefined
  warehouse_id?: string | undefined
  status?: string | undefined
  transfer_type?: string | undefined
}

export async function listStockTransfers(
  params?: ListStockTransfersParams | string,
  signal?: AbortSignal
): Promise<StockTransfer[]> {
  const queryParts: string[] = []
  if (typeof params === 'string') {
    if (params && params !== 'ALL') {
      queryParts.push(`warehouse_id=${encodeURIComponent(params)}`)
    }
  } else if (params) {
    if (params.outlet_id && params.outlet_id !== 'ALL') {
      queryParts.push(`outlet_id=${encodeURIComponent(params.outlet_id)}`)
    }
    if (params.warehouse_id && params.warehouse_id !== 'ALL') {
      queryParts.push(`warehouse_id=${encodeURIComponent(params.warehouse_id)}`)
    }
    if (params.status && params.status !== 'ALL') {
      queryParts.push(`status=${encodeURIComponent(params.status)}`)
    }
    if (params.transfer_type && params.transfer_type !== 'ALL') {
      queryParts.push(`transfer_type=${encodeURIComponent(params.transfer_type)}`)
    }
  }
  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : ''
  const res = await api.requestList<StockTransfer>(`/api/v1/inventory/transfers${query}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function getStockTransfer(id: string, signal?: AbortSignal): Promise<StockTransfer> {
  const res = await api.request<StockTransfer>(`/api/v1/inventory/transfers/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  })
  if (res && !Array.isArray(res.items)) {
    res.items = []
  }
  return res
}

export async function createStockTransfer(input: CreateTransferPayload): Promise<StockTransfer> {
  return api.request<StockTransfer>('/api/v1/inventory/transfers', {
    method: 'POST',
    body: input,
  })
}

export async function dispatchStockTransfer(id: string, input: DispatchTransferPayload): Promise<StockTransfer> {
  return api.request<StockTransfer>(`/api/v1/inventory/transfers/${encodeURIComponent(id)}/dispatch`, {
    method: 'POST',
    body: input,
  })
}

export async function receiveStockTransfer(id: string, input: ReceiveTransferPayload): Promise<StockTransfer> {
  return api.request<StockTransfer>(`/api/v1/inventory/transfers/${encodeURIComponent(id)}/receive`, {
    method: 'POST',
    body: input,
  })
}

export async function cancelStockTransfer(id: string, input: CancelTransferPayload): Promise<StockTransfer> {
  return api.request<StockTransfer>(`/api/v1/inventory/transfers/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: input,
  })
}

// 6. Stock Opnames
export async function listStockOpnames(warehouseId?: string, signal?: AbortSignal): Promise<StockOpname[]> {
  const query = warehouseId && warehouseId !== 'ALL' ? `?warehouse_id=${encodeURIComponent(warehouseId)}` : ''
  const res = await api.requestList<StockOpname>(`/api/v1/inventory/opnames${query}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function getStockOpname(id: string, signal?: AbortSignal): Promise<StockOpname> {
  const res = await api.request<StockOpname>(`/api/v1/inventory/opnames/${encodeURIComponent(id)}`, {
    ...(signal ? { signal } : {}),
  })
  if (res && !Array.isArray(res.items)) {
    res.items = []
  }
  return res
}

export async function createStockOpname(input: CreateOpnameInput): Promise<StockOpname> {
  return api.request<StockOpname>('/api/v1/inventory/opnames', {
    method: 'POST',
    body: input,
  })
}

export async function saveOpnameCount(id: string, input: SaveOpnameCountInput): Promise<{ message: string }> {
  return api.request<{ message: string }>(`/api/v1/inventory/opnames/${encodeURIComponent(id)}/count`, {
    method: 'POST',
    body: input,
  })
}

export async function approveStockOpname(id: string): Promise<{ message: string }> {
  return api.request<{ message: string }>(`/api/v1/inventory/opnames/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
  })
}

// 7. Waste Records
export async function listWasteRecords(warehouseId?: string, signal?: AbortSignal): Promise<WasteRecord[]> {
  const query = warehouseId && warehouseId !== 'ALL' ? `?warehouse_id=${encodeURIComponent(warehouseId)}` : ''
  const res = await api.requestList<WasteRecord>(`/api/v1/inventory/waste${query}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function createWasteRecord(input: CreateWasteInput): Promise<WasteRecord> {
  return api.request<WasteRecord>('/api/v1/inventory/waste', {
    method: 'POST',
    body: input,
  })
}

// 8. Menu HPA Configuration
export async function listMenuHpa(outletId?: string, signal?: AbortSignal): Promise<MenuHpaItem[]> {
  const query = outletId && outletId !== 'ALL' ? `?outlet_id=${encodeURIComponent(outletId)}` : ''
  const res = await api.requestList<MenuHpaItem>(`/api/v1/inventory/menu-hpa${query}`, {
    ...(signal ? { signal } : {}),
  })
  return res ?? []
}

export async function updateMenuHpaMode(menuItemId: string, input: UpdateMenuHpaInput): Promise<{ message: string }> {
  return api.request<{ message: string }>(`/api/v1/inventory/menu-hpa/${encodeURIComponent(menuItemId)}`, {
    method: 'PUT',
    body: input,
  })
}
