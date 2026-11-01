import { api } from '@/shared/api/client';
import type {
  Customer,
  CustomerDetail,
  CreateCustomerPayload,
  UpdateCustomerPayload,
  AdjustPointsPayload,
  PointsLedgerEntry,
  Voucher,
  CreateVoucherPayload,
  ValidateVoucherPayload,
  ValidateVoucherResponse,
} from './types';

// 1. Customer Profiles & Membership
export async function fetchCustomers(search?: string, tier?: string): Promise<Customer[]> {
  const params = new URLSearchParams();
  if (search && search.trim()) params.append('q', search.trim());
  if (tier && tier !== 'ALL') params.append('tier', tier);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<Customer>(`/api/v1/crm/customers${q}`);
  return res ?? [];
}

export async function fetchCustomerDetail(customerId: string): Promise<CustomerDetail> {
  const res = await api.request<CustomerDetail>(`/api/v1/crm/customers/${customerId}`);
  return {
    ...res,
    recent_points: res?.recent_points ?? [],
  };
}

export async function createCustomer(payload: CreateCustomerPayload): Promise<Customer> {
  return api.request<Customer>('/api/v1/crm/customers', {
    method: 'POST',
    body: payload,
  });
}

export async function updateCustomer(customerId: string, payload: UpdateCustomerPayload): Promise<Customer> {
  return api.request<Customer>(`/api/v1/crm/customers/${customerId}`, {
    method: 'PUT',
    body: payload,
  });
}

// 2. Loyalty Points & Ledger
export async function adjustCustomerPoints(customerId: string, payload: AdjustPointsPayload): Promise<PointsLedgerEntry> {
  return api.request<PointsLedgerEntry>(`/api/v1/crm/customers/${customerId}/points`, {
    method: 'POST',
    body: payload,
  });
}

export async function fetchPointsLedger(customerId?: string, limit = 50): Promise<PointsLedgerEntry[]> {
  const params = new URLSearchParams();
  if (customerId) params.append('customer_id', customerId);
  if (limit) params.append('limit', limit.toString());
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<PointsLedgerEntry>(`/api/v1/crm/points-ledger${q}`);
  return res ?? [];
}

// 3. Promotional Vouchers & Discounts
export async function fetchVouchers(): Promise<Voucher[]> {
  const res = await api.requestList<Voucher>('/api/v1/crm/vouchers');
  return res ?? [];
}

export async function createVoucher(payload: CreateVoucherPayload): Promise<Voucher> {
  return api.request<Voucher>('/api/v1/crm/vouchers', {
    method: 'POST',
    body: payload,
  });
}

export async function validateVoucher(payload: ValidateVoucherPayload): Promise<ValidateVoucherResponse> {
  return api.request<ValidateVoucherResponse>('/api/v1/crm/vouchers/validate', {
    method: 'POST',
    body: payload,
  });
}
