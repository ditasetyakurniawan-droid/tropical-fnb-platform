import { api } from '@/shared/api/client';
import type { KitchenTicket } from './types';

export async function fetchKitchenTickets(
  outletId?: string,
  station?: string,
  includeServed = false
): Promise<KitchenTicket[]> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  if (station && station !== 'ALL') params.append('station', station);
  if (includeServed) params.append('include_served', 'true');
  const q = params.toString() ? `?${params.toString()}` : '';
  return api.request<KitchenTicket[]>(`/api/v1/pos/kds/tickets${q}`);
}

export async function updateOrderItemStatus(
  orderId: string,
  itemId: string,
  status: string
): Promise<void> {
  await api.request(`/api/v1/pos/kds/orders/${orderId}/items/${itemId}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export async function updateOrderStatus(orderId: string, status: string): Promise<void> {
  await api.request(`/api/v1/pos/kds/orders/${orderId}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

export async function bumpTicket(orderId: string, targetStatus: string): Promise<KitchenTicket> {
  return api.request<KitchenTicket>(`/api/v1/pos/kds/orders/${orderId}/bump`, {
    method: 'POST',
    body: { target_status: targetStatus },
  });
}
