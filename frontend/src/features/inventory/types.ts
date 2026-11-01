export type WarehouseType =
  | 'CENTRAL_KITCHEN'
  | 'CHILLER'
  | 'FREEZER'
  | 'DRY_STORE'
  | 'OUTLET_STORAGE'

export interface Warehouse {
  id: string
  tenant_id: string
  outlet_id?: string | undefined
  outlet_code?: string | undefined
  outlet_name?: string | undefined
  code: string
  name: string
  warehouse_type: WarehouseType
  address?: string | undefined
  pic_name?: string | undefined
  is_active: boolean
  item_count: number
  total_stock_value: number
  created_at: string
  updated_at: string
}

export interface InventoryItem {
  id: string
  tenant_id: string
  category_id: string
  category_name: string
  code: string
  name: string
  unit: string
  storage_type: string
  cost_price: number
  current_stock: number
  min_stock_alert: number
  is_active: boolean
}

export interface StockBalance {
  id: string
  tenant_id: string
  warehouse_id: string
  warehouse_code: string
  warehouse_name: string
  item_id: string
  item_code: string
  item_name: string
  category_name: string
  unit: string
  storage_type: string
  cost_price: number
  quantity: number
  reserved_quantity: number
  available_quantity: number
  min_stock_alert: number
  max_stock_capacity: number
  stock_status: 'OK' | 'LOW_STOCK' | 'OUT_OF_STOCK'
  total_value: number
  last_counted_at?: string | undefined
  updated_at: string
}

export interface Supplier {
  id: string
  tenant_id: string
  code: string
  name: string
  category: string
  contact_person?: string | undefined
  phone?: string | undefined
  email?: string | undefined
  address?: string | undefined
  term_of_payment_days: number
  bank_name?: string | undefined
  bank_account_number?: string | undefined
  bank_account_holder?: string | undefined
  is_active: boolean
  created_at: string
  updated_at: string
}

export type POStatus = 'DRAFT' | 'SUBMITTED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  item_id: string
  item_code: string
  item_name: string
  unit: string
  ordered_qty: number
  unit_price: number
  subtotal: number
  received_qty: number
}

export interface PurchaseOrder {
  id: string
  tenant_id: string
  outlet_id: string
  outlet_name?: string | undefined
  warehouse_id: string
  warehouse_code?: string | undefined
  warehouse_name?: string | undefined
  supplier_id: string
  supplier_code?: string | undefined
  supplier_name?: string | undefined
  po_number: string
  order_date: string
  expected_delivery_date: string
  status: POStatus
  subtotal_amount: number
  tax_amount: number
  total_amount: number
  notes?: string | undefined
  created_at: string
  updated_at: string
  items?: PurchaseOrderItem[] | undefined
}

export interface GoodsReceiptItem {
  id: string
  receipt_id: string
  po_item_id?: string | undefined
  item_id: string
  item_code: string
  item_name: string
  billed_qty: number
  actual_weight_qty: number
  variance_weight_qty: number
  unit: string
  unit_cost: number
  subtotal_cost: number
  reject_qty: number
  reject_reason?: string | undefined
  expiry_date?: string | undefined
  batch_number?: string | undefined
}

export interface GoodsReceipt {
  id: string
  tenant_id: string
  receipt_number: string
  purchase_order_id?: string | undefined
  po_number?: string | undefined
  supplier_id: string
  supplier_name?: string | undefined
  warehouse_id: string
  warehouse_code?: string | undefined
  warehouse_name?: string | undefined
  received_date: string
  invoice_number?: string | undefined
  total_billed_amount: number
  total_actual_amount: number
  photo_url?: string | undefined
  notes?: string | undefined
  received_by_name?: string | undefined
  created_at: string
  items?: GoodsReceiptItem[] | undefined
}

export type TransferStatus = 'PENDING' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED' | 'DRAFT'

export type TransferType = 'INTER_BRANCH' | 'INTRA_BRANCH'

export interface StockTransferItem {
  id: string
  transfer_id: string
  item_id: string
  item_code: string
  item_name: string
  requested_qty: number
  dispatched_qty: number
  received_qty: number
  variance_qty?: number | undefined
  variance_reason?: string | undefined
  unit: string
  unit_cost?: number | undefined
  notes?: string | undefined
}

export interface StockTransfer {
  id: string
  tenant_id: string
  transfer_number: string
  waybill_number?: string | undefined
  origin_outlet_id: string
  origin_outlet_code?: string | undefined
  origin_outlet_name?: string | undefined
  origin_warehouse_id: string
  origin_warehouse_name?: string | undefined
  origin_warehouse_code?: string | undefined
  destination_outlet_id: string
  destination_outlet_code?: string | undefined
  destination_outlet_name?: string | undefined
  destination_warehouse_id: string
  destination_warehouse_name?: string | undefined
  destination_warehouse_code?: string | undefined
  transfer_date: string
  transfer_type: TransferType
  status: TransferStatus
  dispatched_by_name?: string | undefined
  dispatched_at?: string | undefined
  received_by_name?: string | undefined
  received_at?: string | undefined
  cancelled_at?: string | undefined
  cancellation_reason?: string | undefined
  notes?: string | undefined
  total_items?: number | undefined
  total_variance_qty?: number | undefined
  created_at: string
  updated_at: string
  items?: StockTransferItem[] | undefined
}

export interface CreateTransferItemPayload {
  item_id: string
  requested_qty: number
  unit: string
  unit_cost?: number | undefined
  notes?: string | undefined
}

export interface CreateTransferPayload {
  origin_warehouse_id: string
  destination_warehouse_id: string
  transfer_date: string
  dispatched_by_name?: string | undefined
  notes?: string | undefined
  items: CreateTransferItemPayload[]
}

export interface DispatchTransferItemPayload {
  item_id: string
  dispatched_qty: number
}

export interface DispatchTransferPayload {
  dispatched_by_name?: string | undefined
  waybill_number?: string | undefined
  items?: DispatchTransferItemPayload[] | undefined
}

export interface ReceiveTransferItemPayload {
  item_id: string
  received_qty: number
  variance_reason?: string | undefined
  notes?: string | undefined
}

export interface ReceiveTransferPayload {
  received_by_name?: string | undefined
  notes?: string | undefined
  items: ReceiveTransferItemPayload[]
}

export interface CancelTransferPayload {
  cancellation_reason: string
}

export interface CreateWarehousePayload {
  outlet_id: string
  code: string
  name: string
  warehouse_type: WarehouseType
  address?: string | undefined
  pic_name?: string | undefined
}

export interface UpdateWarehousePayload {
  name: string
  warehouse_type: WarehouseType
  address?: string | undefined
  pic_name?: string | undefined
  is_active: boolean
}

export type OpnameStatus = 'DRAFT' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'

export interface StockOpnameItem {
  id: string
  stock_opname_id: string
  item_id: string
  item_code: string
  item_name: string
  unit: string
  system_theoretical_qty?: number | undefined
  physical_counted_qty: number
  variance_qty?: number | undefined
  unit_cost?: number | undefined
  variance_cost?: number | undefined
  variance_category?: string | undefined
  notes?: string | undefined
}

export interface StockOpname {
  id: string
  tenant_id: string
  opname_number: string
  warehouse_id: string
  warehouse_code?: string | undefined
  warehouse_name?: string | undefined
  opname_date: string
  status: OpnameStatus
  is_blind?: boolean | undefined
  conducted_by_name?: string | undefined
  approved_by_name?: string | undefined
  total_theoretical_cost?: number | undefined
  total_physical_cost?: number | undefined
  total_variance_cost?: number | undefined
  notes?: string | undefined
  created_at: string
  updated_at: string
  items?: StockOpnameItem[] | undefined
}

export interface WasteRecordItem {
  id: string
  waste_record_id: string
  item_id: string
  item_code: string
  item_name: string
  quantity: number
  unit: string
  unit_cost: number
  subtotal_cost: number
  notes?: string | undefined
}

export interface WasteRecord {
  id: string
  tenant_id: string
  outlet_id: string
  warehouse_id: string
  warehouse_code?: string | undefined
  warehouse_name?: string | undefined
  waste_number: string
  waste_date: string
  category: 'SPOILAGE_EXPIRED' | 'DROPPED_DAMAGED' | 'COOKING_MISTAKE' | 'STAFF_MEAL' | 'CUSTOM_REASON' | string
  recipient_division?: string | undefined
  total_cost: number
  photo_url?: string | undefined
  recorded_by_name?: string | undefined
  notes?: string | undefined
  created_at: string
  items?: WasteRecordItem[] | undefined
}

export interface MenuHpaItem {
  id: string
  outlet_id: string
  outlet_name: string
  category_name: string
  code: string
  name: string
  selling_price: number
  hpa_calculation_mode: 'DYNAMIC_BOM' | 'MANUAL_OVERRIDE'
  dynamic_bom_hpa: number
  manual_hpa: number
  effective_hpa: number
  gross_margin: number
  food_cost_pct: number
  variance_amount: number
  variance_pct: number
  is_variance_alert: boolean
  target_food_cost_pct: number
}

// Input payloads
export interface CreateSupplierInput {
  code: string
  name: string
  category: string
  contact_person?: string | undefined
  phone?: string | undefined
  email?: string | undefined
  address?: string | undefined
  term_of_payment_days: number
  bank_name?: string | undefined
  bank_account_number?: string | undefined
  bank_account_holder?: string | undefined
}

export interface CreatePOItemInput {
  item_id: string
  ordered_qty: number
  unit: string
  unit_price: number
}

export interface CreatePOInput {
  outlet_id: string
  warehouse_id: string
  supplier_id: string
  order_date: string
  expected_delivery_date: string
  notes?: string | undefined
  items: CreatePOItemInput[]
}

export interface CreateGRItemInput {
  po_item_id?: string | undefined
  item_id: string
  billed_qty: number
  actual_weight_qty: number
  unit: string
  unit_cost: number
  reject_qty: number
  reject_reason?: string | undefined
  expiry_date?: string | undefined
  batch_number?: string | undefined
}

export interface CreateGRInput {
  purchase_order_id?: string | undefined
  supplier_id: string
  warehouse_id: string
  received_date: string
  invoice_number?: string | undefined
  photo_url?: string | undefined
  notes?: string | undefined
  received_by_name?: string | undefined
  items: CreateGRItemInput[]
}

export interface CreateTransferItemInput {
  item_id: string
  requested_qty: number
  dispatched_qty: number
  unit: string
}

export interface CreateTransferInput {
  origin_warehouse_id: string
  destination_warehouse_id: string
  transfer_date: string
  dispatched_by_name?: string | undefined
  notes?: string | undefined
  items: CreateTransferItemInput[]
}

export interface CreateOpnameInput {
  warehouse_id: string
  opname_date: string
  conducted_by_name?: string | undefined
  notes?: string | undefined
}

export interface SaveOpnameCountItemInput {
  item_id: string
  physical_counted_qty: number
  variance_category: string
  notes?: string | undefined
}

export interface SaveOpnameCountInput {
  items: SaveOpnameCountItemInput[]
}

export interface CreateWasteItemInput {
  item_id: string
  quantity: number
  unit: string
  unit_cost: number
  notes?: string | undefined
}

export interface CreateWasteInput {
  outlet_id: string
  warehouse_id: string
  waste_date: string
  category: string
  recipient_division?: string | undefined
  photo_url?: string | undefined
  recorded_by_name?: string | undefined
  notes?: string | undefined
  items: CreateWasteItemInput[]
}

export interface UpdateMenuHpaInput {
  hpa_calculation_mode: 'DYNAMIC_BOM' | 'MANUAL_OVERRIDE'
  manual_hpa: number
}
