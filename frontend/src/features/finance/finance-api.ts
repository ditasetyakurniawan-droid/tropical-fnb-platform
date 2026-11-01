import { api } from '@/shared/api/client';
import type { MonthlyTrendPoint, CategoryBreakdownItem } from './components/RealtimeFinancialCharts';

export interface OutletPnL {
  outlet_id: string;
  outlet_name: string;
  net_sales: number;
  total_cogs: number;
  gross_profit: number;
  labor_cost: number;
  total_opex: number;
  net_profit: number;
  net_margin_pct: number;
}

export interface PnLSummary {
  period_label: string;
  period_start: string;
  period_end: string;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  food_cost: number;
  waste_and_shrinkage: number;
  total_cogs: number;
  cogs_pct: number;
  gross_profit: number;
  gross_margin_pct: number;
  labor_cost: number;
  labor_pct: number;
  prime_cost: number;
  prime_cost_pct: number;
  utilities_and_fuel: number;
  maintenance_ambiance: number;
  consumables_packaging: number;
  marketing_promo: number;
  rent_and_property: number;
  admin_and_tech: number;
  total_opex: number;
  opex_pct: number;
  ebitda: number;
  ebitda_pct: number;
  tax_pb1: number;
  net_profit: number;
  net_margin_pct: number;
  outlets: OutletPnL[];
  monthly_trends?: MonthlyTrendPoint[];
  category_breakdown?: CategoryBreakdownItem[];
}

export interface BEPSummary {
  monthly_fixed_cost: number;
  contribution_margin_ratio: number;
  monthly_bep_amount: number;
  daily_bep_amount: number;
  today_revenue: number;
  today_progress_pct: number;
  is_bep_reached: boolean;
  bep_reached_time?: string;
  zone_status: string;
}

export interface OperatingExpense {
  id: string;
  outlet_id?: string;
  outlet_name?: string;
  category_id: string;
  category_code: string;
  category_name: string;
  expense_date: string;
  title: string;
  amount: number;
  payment_method: string;
  receipt_ref?: string;
  recorded_by_name: string;
  approved_by_name?: string;
  status: string;
  notes?: string;
}

export interface ExpenseCategory {
  id: string;
  code: string;
  name: string;
  description?: string;
}

export interface CreateExpensePayload {
  title: string;
  category_id: string;
  amount: number;
  payment_method: string;
  receipt_ref?: string | undefined;
  notes?: string | undefined;
  expense_date?: string | undefined;
  outlet_id?: string | null | undefined;
}

export async function fetchPnL(outletId?: string, startDate?: string, endDate?: string): Promise<PnLSummary> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.request<PnLSummary>(`/api/v1/finance/pnl${q}`);
  return {
    ...res,
    outlets: res?.outlets ?? [],
    monthly_trends: res?.monthly_trends ?? [],
    category_breakdown: res?.category_breakdown ?? [],
  };
}

export async function fetchBEP(outletId?: string): Promise<BEPSummary> {
  const q = outletId && outletId !== 'ALL' ? `?outlet_id=${outletId}` : '';
  return api.request<BEPSummary>(`/api/v1/finance/bep${q}`);
}

export async function fetchExpenses(outletId?: string, startDate?: string, endDate?: string): Promise<OperatingExpense[]> {
  const params = new URLSearchParams();
  if (outletId && outletId !== 'ALL') params.append('outlet_id', outletId);
  if (startDate) params.append('start_date', startDate);
  if (endDate) params.append('end_date', endDate);
  const q = params.toString() ? `?${params.toString()}` : '';
  const res = await api.requestList<OperatingExpense>(`/api/v1/finance/expenses${q}`);
  return res ?? [];
}

export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  const res = await api.requestList<ExpenseCategory>('/api/v1/finance/categories');
  return res ?? [];
}

export async function createExpense(payload: CreateExpensePayload): Promise<OperatingExpense> {
  return api.request<OperatingExpense>('/api/v1/finance/expenses', {
    method: 'POST',
    body: payload,
  });
}
