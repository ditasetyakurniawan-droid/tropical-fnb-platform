import type { MenuItemWithHPA } from '@/features/menu/types';

export type TableStatus = 'AVAILABLE' | 'RESERVED' | 'OCCUPIED' | 'BILL_PRINTED' | 'DIRTY';

export interface CartItem {
  id: string;
  menuItem: MenuItemWithHPA;
  quantity: number;
  notes?: string | undefined;
}

export interface DiningTable {
  id: string;
  tenant_id: string;
  outlet_id: string;
  outlet_code: string;
  table_number: string;
  section: string; // INDOOR_MAIN, INDOOR_VIP, OUTDOOR_GAZEBO, OUTDOOR_JOGLO
  capacity: number;
  shape: 'RECTANGLE' | 'ROUND' | 'GAZEBO_OCTAGON';
  status: TableStatus;
  active_order_id?: string | undefined;
  active_order_number?: string | undefined;
  active_customer_name?: string | undefined;
  active_order_total?: number | undefined;
  pos_x: number;
  pos_y: number;
  created_at: string;
  updated_at: string;
}

export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'EVENT_RESERVATION';
export type PaymentFlow = 'PAY_FIRST' | 'PAY_AFTER';
export type OrderStatus = 'OPEN' | 'IN_KITCHEN' | 'SERVED' | 'COMPLETED' | 'CANCELLED' | 'VOID';
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
export type PaymentMethod = 'CASH' | 'QRIS' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'TRANSFER' | 'SPLIT';

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  notes?: string | undefined;
  status: 'ORDERED' | 'COOKING' | 'READY' | 'SERVED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
}

export interface OrderPayment {
  id: string;
  order_id: string;
  payment_method: PaymentMethod;
  amount: number;
  change_given: number;
  reference_number?: string | undefined;
  paid_by?: string | undefined;
  paid_at: string;
}

export interface SplitBillItem {
  id: string;
  split_bill_id: string;
  order_item_id: string;
  item_name: string;
  quantity: number;
  amount: number;
}

export interface SplitBill {
  id: string;
  order_id: string;
  split_number: number;
  payer_name: string;
  subtotal: number;
  tax_pb1_amount: number;
  final_amount: number;
  paid_amount: number;
  payment_method?: string | undefined;
  is_paid: boolean;
  paid_at?: string | undefined;
  created_at: string;
  items?: SplitBillItem[] | undefined;
}

export interface Order {
  id: string;
  tenant_id: string;
  outlet_id: string;
  outlet_code: string;
  order_number: string;
  order_type: OrderType;
  payment_flow: PaymentFlow;
  table_id?: string | undefined;
  table_number?: string | undefined;
  customer_name: string;
  customer_phone?: string | undefined;
  pax_count: number;
  status: OrderStatus;
  payment_status: PaymentStatus;
  subtotal: number;
  discount_amount: number;
  discount_note?: string | undefined;
  tax_pb1_percent: number;
  tax_pb1_amount: number;
  service_charge_percent: number;
  service_charge_amount: number;
  final_total: number;
  paid_amount: number;
  change_amount: number;
  notes?: string | undefined;
  created_by?: string | undefined;
  created_by_name?: string | undefined;
  created_at: string;
  updated_at: string;
  closed_at?: string | undefined;
  customer_id?: string | undefined;
  voucher_code?: string | undefined;
  points_redeemed?: number | undefined;
  points_discount_amount?: number | undefined;
  dp_claimed_amount?: number | undefined;
  reservation_id?: string | undefined;
  items?: OrderItem[] | undefined;
  payments?: OrderPayment[] | undefined;
  split_bills?: SplitBill[] | undefined;
}

export type EventType =
  | 'REGULAR_DINING'
  | 'FAMILY_GATHERING'
  | 'CORPORATE_EVENT'
  | 'BIRTHDAY_PARTY'
  | 'WEDDING_RECEPTION'
  | 'COMMUNITY_MEETING';

export type ReservationStatus =
  | 'PENDING_DEPOSIT'
  | 'CONFIRMED'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface Reservation {
  id: string;
  tenant_id: string;
  outlet_id: string;
  outlet_code: string;
  reservation_number: string;
  customer_id?: string | undefined;
  customer_name: string;
  customer_phone: string;
  event_type: EventType;
  pax_count: number;
  reservation_date: string;
  start_time: string;
  end_time?: string | undefined;
  assigned_table_id?: string | undefined;
  assigned_table_number?: string | undefined;
  min_spend: number;
  deposit_amount: number;
  deposit_paid: boolean;
  deposit_payment_method?: string | undefined;
  dp_receipt_ref?: string | undefined;
  dp_claim_order_id?: string | undefined;
  status: ReservationStatus;
  special_requests?: string | undefined;
  banquet_package_id?: string | undefined;
  banquet_package_name?: string | undefined;
  kitchen_prep_status?: 'QUEUED' | 'IN_PREP' | 'READY_FOR_EVENT' | 'SERVED' | undefined;
  layout_setup_notes?: string | undefined;
  whatsapp_reminder_sent_at?: string | undefined;
  preorders?: ReservationPreorder[] | undefined;
  created_at: string;
  updated_at: string;
}

export interface BanquetPackageItem {
  id: string;
  package_id: string;
  menu_item_id: string;
  menu_item_name?: string | undefined;
  dish_course: 'APPETIZER' | 'MAIN_COURSE' | 'DESSERT' | 'BEVERAGE';
  portion_multiplier: number;
  notes?: string | undefined;
  created_at: string;
}

export interface BanquetPackage {
  id: string;
  tenant_id: string;
  outlet_id?: string | undefined;
  code: string;
  name: string;
  description?: string | undefined;
  min_pax: number;
  price_per_pax: number;
  category: 'BUFFET_PRASMANAN' | 'VIP_SET_MENU' | 'COFFEE_BREAK' | 'CUSTOM_BANQUET';
  is_active: boolean;
  created_at: string;
  updated_at: string;
  items?: BanquetPackageItem[] | undefined;
}

export interface ReservationPreorder {
  id: string;
  reservation_id: string;
  menu_item_id?: string | undefined;
  banquet_package_id?: string | undefined;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  serving_stage: 'WELCOME_DRINK' | 'STARTER' | 'BUFFET_MAIN' | 'CLOSING_DESSERT';
  kitchen_prep_station: 'GRILL' | 'KITCHEN' | 'BAR';
  prep_status: 'QUEUED' | 'IN_PREP' | 'READY_FOR_EVENT';
  special_notes?: string | undefined;
  created_at: string;
}

export interface CreateOrderItemPayload {
  menu_item_id: string;
  quantity: number;
  notes?: string | undefined;
}

export interface CreateOrderPayload {
  outlet_id: string;
  table_id?: string | undefined;
  customer_name: string;
  customer_phone?: string | undefined;
  pax_count: number;
  order_type: OrderType;
  payment_flow: PaymentFlow;
  notes?: string | undefined;
  items: CreateOrderItemPayload[];
}

export interface ProcessPaymentPayload {
  payment_method: PaymentMethod;
  amount: number;
  reference_number?: string | undefined;
  paid_by?: string | undefined;
}

export interface SplitEvenlyPayload {
  num_persons: number;
}

export interface SplitItemAssignment {
  order_item_id: string;
  quantity: number;
}

export interface SplitByItemsPayer {
  payer_name: string;
  assignments: SplitItemAssignment[];
}

export interface SplitByItemsPayload {
  payers: SplitByItemsPayer[];
}

export interface PaySplitBillPayload {
  payment_method: PaymentMethod;
  amount: number;
  reference_number?: string | undefined;
}

export interface CreateReservationPreorderPayload {
  menu_item_id?: string | undefined;
  banquet_package_id?: string | undefined;
  item_name: string;
  quantity: number;
  unit_price: number;
  serving_stage: 'WELCOME_DRINK' | 'STARTER' | 'BUFFET_MAIN' | 'CLOSING_DESSERT';
  kitchen_prep_station: 'GRILL' | 'KITCHEN' | 'BAR';
  special_notes?: string | undefined;
}

export interface CreateReservationPayload {
  outlet_id: string;
  customer_id?: string | undefined;
  customer_name: string;
  customer_phone: string;
  event_type: EventType;
  pax_count: number;
  reservation_date: string;
  start_time: string;
  end_time?: string | undefined;
  assigned_table_id?: string | undefined;
  min_spend: number;
  deposit_amount: number;
  deposit_paid: boolean;
  deposit_payment_method?: string | undefined;
  dp_receipt_ref?: string | undefined;
  special_requests?: string | undefined;
  banquet_package_id?: string | undefined;
  layout_setup_notes?: string | undefined;
  preorders?: CreateReservationPreorderPayload[] | undefined;
}

// ----------------------------------------------------------------------------
// Cashier Shift & Cash Drawer Reconciliation Types
// ----------------------------------------------------------------------------

export type ShiftName = 'SHIFT_PAGI' | 'SHIFT_SORE' | 'SHIFT_FULL';
export type ShiftStatus = 'OPEN' | 'CLOSED';
export type CashMovementType = 'PAID_IN' | 'PAID_OUT';

export interface CashierShift {
  id: string;
  tenant_id: string;
  outlet_id: string;
  outlet_code?: string | undefined;
  outlet_name?: string | undefined;
  shift_number: string;
  cashier_user_id: string;
  cashier_name?: string | undefined;
  supervisor_user_id?: string | undefined;
  supervisor_name?: string | undefined;
  shift_name: ShiftName;
  status: ShiftStatus;
  opened_at: string;
  closed_at?: string | undefined;
  opening_cash: number;
  expected_cash: number;
  actual_cash?: number | undefined;
  cash_difference: number;
  total_transactions: number;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  tax_pb1: number;
  service_charge: number;
  payment_cash: number;
  payment_qris: number;
  payment_card: number;
  payment_transfer: number;
  total_paid_in: number;
  total_paid_out: number;
  notes?: string | undefined;
  created_at: string;
  updated_at: string;
}

export interface CashierShiftCashMovement {
  id: string;
  tenant_id: string;
  shift_id: string;
  movement_type: CashMovementType;
  amount: number;
  reason: string;
  authorized_by?: string | undefined;
  authorizer_name?: string | undefined;
  created_at: string;
}

export interface OpenShiftPayload {
  outlet_id: string;
  shift_name: ShiftName;
  opening_cash: number;
  notes?: string | undefined;
}

export interface CloseShiftPayload {
  actual_cash: number;
  supervisor_pin?: string | undefined;
  notes?: string | undefined;
}

export interface CashMovementPayload {
  movement_type: CashMovementType;
  amount: number;
  reason: string;
  supervisor_pin?: string | undefined;
}

export interface ShiftReport {
  shift: CashierShift;
  movements: CashierShiftCashMovement[];
  report_type: 'X_REPORT' | 'Z_REPORT';
  generated_at: string;
  generated_by: string;
}

export interface CurrentShiftResponse {
  shift: CashierShift | null;
  is_open: boolean;
}

