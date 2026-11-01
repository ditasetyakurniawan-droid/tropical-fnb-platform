import { api } from '@/shared/api/client';
import type {
  CreateOrderPayload,
  CreateReservationPayload,
  CreateReservationPreorderPayload,
  DiningTable,
  Order,
  PaySplitBillPayload,
  ProcessPaymentPayload,
  Reservation,
  ReservationPreorder,
  BanquetPackage,
  SplitBill,
  SplitByItemsPayload,
  SplitEvenlyPayload,
  CashierShift,
  CashierShiftCashMovement,
  OpenShiftPayload,
  CloseShiftPayload,
  CashMovementPayload,
  ShiftReport,
  CurrentShiftResponse,
} from './types';

// Tables & Gazebos
export async function fetchTables(outletId?: string, section?: string): Promise<DiningTable[]> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  if (section && section !== 'ALL') params.append('section', section);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<DiningTable>(`/api/v1/pos/tables${q}`);
  return res ?? [];
}

export async function updateTableStatus(tableId: string, status: string): Promise<void> {
  await api.request(`/api/v1/pos/tables/${tableId}/status`, {
    method: 'PATCH',
    body: { status },
  });
}

// Orders & POS
export async function fetchOrders(outletId?: string, status?: string): Promise<Order[]> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  if (status && status !== 'ALL') params.append('status', status);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<Order>(`/api/v1/pos/orders${q}`);
  return res ?? [];
}

export async function fetchOrderDetail(orderId: string): Promise<Order> {
  const res = await api.request<Order>(`/api/v1/pos/orders/${orderId}`);
  return {
    ...res,
    items: res?.items ?? [],
    payments: res?.payments ?? [],
  };
}

export async function createOrder(payload: CreateOrderPayload): Promise<Order> {
  const res = await api.request<Order>('/api/v1/pos/orders', {
    method: 'POST',
    body: payload,
  });
  return {
    ...res,
    items: res?.items ?? [],
    payments: res?.payments ?? [],
  };
}

export async function addOrderItems(
  orderId: string,
  items: Array<{ menu_item_id: string; quantity: number; notes?: string }>
): Promise<Order> {
  const res = await api.request<Order>(`/api/v1/pos/orders/${orderId}/items`, {
    method: 'POST',
    body: items,
  });
  return {
    ...res,
    items: res?.items ?? [],
    payments: res?.payments ?? [],
  };
}

export async function processOrderPayment(orderId: string, payload: ProcessPaymentPayload): Promise<Order> {
  const res = await api.request<Order>(`/api/v1/pos/orders/${orderId}/pay`, {
    method: 'POST',
    body: payload,
  });
  return {
    ...res,
    items: res?.items ?? [],
    payments: res?.payments ?? [],
  };
}

// Split Bill Engine
export async function splitBillEvenly(orderId: string, payload: SplitEvenlyPayload): Promise<SplitBill[]> {
  const res = await api.requestList<SplitBill>(`/api/v1/pos/orders/${orderId}/split/evenly`, {
    method: 'POST',
    body: payload,
  });
  return res ?? [];
}

export async function splitBillByItems(orderId: string, payload: SplitByItemsPayload): Promise<SplitBill[]> {
  const res = await api.requestList<SplitBill>(`/api/v1/pos/orders/${orderId}/split/by-items`, {
    method: 'POST',
    body: payload,
  });
  return res ?? [];
}

export async function paySplitBill(
  orderId: string,
  splitId: string,
  payload: PaySplitBillPayload
): Promise<{ split_bill: SplitBill; order: Order }> {
  const res = await api.request<{ split_bill: SplitBill; order: Order }>(
    `/api/v1/pos/orders/${orderId}/split/${splitId}/pay`,
    {
      method: 'POST',
      body: payload,
    }
  );
  if (res?.order) {
    res.order.items = res.order.items ?? [];
    res.order.payments = res.order.payments ?? [];
  }
  return res;
}

// Reservations
export async function fetchReservations(outletId?: string, date?: string): Promise<Reservation[]> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  if (date) params.append('date', date);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<Reservation>(`/api/v1/pos/reservations${q}`);
  return res ?? [];
}

export async function createReservation(payload: CreateReservationPayload): Promise<Reservation> {
  return api.request<Reservation>('/api/v1/pos/reservations', {
    method: 'POST',
    body: payload,
  });
}

export async function checkInReservation(reservationId: string, tableId: string): Promise<Order> {
  const res = await api.request<Order>(`/api/v1/pos/reservations/${reservationId}/check-in`, {
    method: 'POST',
    body: { table_id: tableId },
  });
  return {
    ...res,
    items: res?.items ?? [],
    payments: res?.payments ?? [],
  };
}

// Banquet Packages
export async function fetchBanquetPackages(outletId?: string): Promise<BanquetPackage[]> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<BanquetPackage>(`/api/v1/pos/banquet-packages${q}`);
  return res ?? [];
}

export async function createBanquetPackage(payload: Partial<BanquetPackage>): Promise<BanquetPackage> {
  return api.request<BanquetPackage>('/api/v1/pos/banquet-packages', {
    method: 'POST',
    body: payload,
  });
}

// Pre-Orders & Kitchen Prep Alert
export async function fetchReservationPreorders(reservationId: string): Promise<ReservationPreorder[]> {
  const res = await api.requestList<ReservationPreorder>(`/api/v1/pos/reservations/${reservationId}/preorders`);
  return res ?? [];
}

export async function addReservationPreorder(
  reservationId: string,
  payload: CreateReservationPreorderPayload
): Promise<ReservationPreorder> {
  return api.request<ReservationPreorder>(`/api/v1/pos/reservations/${reservationId}/preorders`, {
    method: 'POST',
    body: payload,
  });
}

export async function updateReservationPrepStatus(
  reservationId: string,
  prepStatus: string
): Promise<{ message: string; prep_status: string }> {
  return api.request<{ message: string; prep_status: string }>(`/api/v1/pos/reservations/${reservationId}/prep-status`, {
    method: 'PUT',
    body: { prep_status: prepStatus },
  });
}

export async function sendReservationWAReminder(reservationId: string): Promise<Reservation> {
  return api.request<Reservation>(`/api/v1/pos/reservations/${reservationId}/wa-reminder`, {
    method: 'POST',
  });
}

// ----------------------------------------------------------------------------
// Shift Management & Cash Drawer API
// ----------------------------------------------------------------------------

export async function fetchCurrentShift(outletId?: string): Promise<CurrentShiftResponse> {
  const q = outletId && outletId !== 'ALL' ? `?outlet_id=${outletId}` : '';
  return api.request<CurrentShiftResponse>(`/api/v1/pos/shifts/current${q}`);
}

export async function openShift(payload: OpenShiftPayload): Promise<CashierShift> {
  return api.request<CashierShift>('/api/v1/pos/shifts/open', {
    method: 'POST',
    body: payload,
  });
}

export async function closeShift(shiftId: string, payload: CloseShiftPayload): Promise<CashierShift> {
  return api.request<CashierShift>(`/api/v1/pos/shifts/${shiftId}/close`, {
    method: 'POST',
    body: payload,
  });
}

export async function fetchShiftXReport(shiftId: string = 'current', outletId?: string): Promise<ShiftReport> {
  const q = outletId && outletId !== 'ALL' ? `?outlet_id=${outletId}` : '';
  return api.request<ShiftReport>(`/api/v1/pos/shifts/${shiftId}/x-report${q}`);
}

export async function fetchShiftZReport(shiftId: string): Promise<ShiftReport> {
  return api.request<ShiftReport>(`/api/v1/pos/shifts/${shiftId}/z-report`);
}

export async function createCashMovement(
  shiftId: string,
  payload: CashMovementPayload
): Promise<CashierShiftCashMovement> {
  return api.request<CashierShiftCashMovement>(`/api/v1/pos/shifts/${shiftId}/cash-movements`, {
    method: 'POST',
    body: payload,
  });
}

export async function fetchCashMovements(shiftId: string): Promise<CashierShiftCashMovement[]> {
  const res = await api.requestList<CashierShiftCashMovement>(`/api/v1/pos/shifts/${shiftId}/cash-movements`);
  return res ?? [];
}

export async function fetchShifts(outletId?: string, status?: string): Promise<CashierShift[]> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  if (status && status !== 'ALL') params.append('status', status);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<CashierShift>(`/api/v1/pos/shifts${q}`);
  return res ?? [];
}


