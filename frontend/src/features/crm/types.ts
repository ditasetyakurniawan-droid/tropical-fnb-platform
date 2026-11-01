export type MembershipTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'TROPICAL_VIP';

export interface Customer {
  id: string;
  tenant_id: string;
  phone: string;
  name: string;
  email?: string | undefined;
  membership_tier: MembershipTier;
  points_balance: number;
  lifetime_spend: number;
  visit_count: number;
  birthday?: string | undefined; // YYYY-MM-DD
  dietary_notes?: string | undefined;
  preferences?: string | undefined;
  created_at: string;
  updated_at: string;
}

export type PointsTxType = 'EARN' | 'REDEEM' | 'ADJUSTMENT' | 'EXPIRED';

export interface PointsLedgerEntry {
  id: string;
  tenant_id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  order_id?: string | undefined;
  tx_type: PointsTxType;
  points: number;
  balance_after: number;
  description: string;
  created_at: string;
}

export interface CustomerDetail extends Customer {
  recent_points: PointsLedgerEntry[];
}

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface Voucher {
  id: string;
  tenant_id: string;
  code: string;
  title: string;
  description?: string | undefined;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_amount?: number | undefined;
  min_purchase_amount: number;
  min_membership_tier?: MembershipTier | undefined;
  usage_limit_total: number;
  usage_count: number;
  valid_from: string; // YYYY-MM-DD
  valid_until: string; // YYYY-MM-DD
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCustomerPayload {
  name: string;
  phone: string;
  email?: string | undefined;
  birthday?: string | undefined;
  dietary_notes?: string | undefined;
  preferences?: string | undefined;
}

export interface UpdateCustomerPayload {
  name?: string | undefined;
  email?: string | undefined;
  birthday?: string | undefined;
  dietary_notes?: string | undefined;
  preferences?: string | undefined;
  membership_tier?: MembershipTier | undefined;
}

export interface AdjustPointsPayload {
  tx_type: PointsTxType;
  points: number;
  description: string;
  order_id?: string | undefined;
}

export interface CreateVoucherPayload {
  code: string;
  title: string;
  description?: string | undefined;
  discount_type: DiscountType;
  discount_value: number;
  max_discount_amount?: number | undefined;
  min_purchase_amount: number;
  min_membership_tier?: MembershipTier | undefined;
  usage_limit_total: number;
  valid_from: string;
  valid_until: string;
}

export interface ValidateVoucherPayload {
  code: string;
  subtotal: number;
  customer_id?: string | undefined;
}

export interface ValidateVoucherResponse {
  valid: boolean;
  discount_amount: number;
  message: string;
  voucher?: Voucher | undefined;
}
