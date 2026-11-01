import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { KitchenDisplayPage } from './KitchenDisplayPage';
import { useAuthStore } from '@/features/auth/auth-store';
import type { AuthTokenResponse } from '@/features/auth/types';
import * as kdsApi from './kds-api';
import * as thermalPrinter from '@/features/pos/thermal-printer';
import type { KitchenTicket } from './types';

vi.mock('./kds-api');
vi.mock('@/features/pos/thermal-printer', () => ({
  printKitchenTicket: vi.fn(),
}));

const MOCK_AUTH: AuthTokenResponse = {
  access_token: 'fake-token',
  expires_at: '2026-10-25T12:00:00Z',
  user: {
    id: 'u-1',
    tenant_id: 't-1',
    username: 'owner',
    full_name: 'Budi Santoso',
    is_active: true,
  },
  roles: [{ role_code: 'OWNER', role_name: 'Owner' }],
  accessible_outlets: [
    {
      id: 'outlet-tsh',
      code: 'TSH-01',
      slug: 'tropical-steak-house',
      name: 'Tropical Steak House',
      outlet_type: 'RESTAURANT',
      tax_pb1_percent: 10,
      service_charge_percent: 0,
    },
    {
      id: 'outlet-tgr',
      code: 'TGR-01',
      slug: 'tropical-garden-resto',
      name: 'Tropical Garden Resto',
      outlet_type: 'RESTAURANT',
      tax_pb1_percent: 10,
      service_charge_percent: 0,
    },
  ],
  is_global_all_outlets: true,
};

const MOCK_TICKETS: KitchenTicket[] = [
  {
    id: 'ord-steak-001',
    tenant_id: 't-1',
    outlet_id: 'outlet-tsh',
    outlet_code: 'TSH-01',
    outlet_name: 'Tropical Steak House',
    order_number: 'ORD-TSH-20261024-0001',
    order_type: 'DINE_IN',
    table_id: 'tbl-01',
    table_number: 'T-01',
    customer_name: 'Bpk. Agus Santoso',
    pax_count: 2,
    status: 'IN_KITCHEN',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    items: [
      {
        id: 'item-1',
        menu_item_id: 'menu-1',
        item_name: 'Wagyu Ribeye Meltique 200g',
        category_code: 'STEAK_MAINS',
        category_name: 'Steak Mains',
        quantity: 1,
        station: 'GRILL_STEAK',
        status: 'COOKING',
        notes: 'Medium Rare, Mushroom Sauce',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'item-2',
        menu_item_id: 'menu-2',
        item_name: 'Mashed Potato Truffle Butter',
        category_code: 'SIDE_DISH',
        category_name: 'Side Dish',
        quantity: 1,
        station: 'SIDES_PANTRY',
        status: 'ORDERED',
        notes: undefined,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  },
];

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('KitchenDisplayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setAuth(MOCK_AUTH);
    vi.mocked(kdsApi.fetchKitchenTickets).mockResolvedValue(MOCK_TICKETS);
  });

  it('renders KDS header and outlet selector buttons', async () => {
    renderWithProviders(<KitchenDisplayPage />);

    expect(screen.getByText(/Layar Dapur & Station Masak/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Tropical Steak House/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Tropical Garden Resto/i)).toBeInTheDocument();
  });

  it('displays kitchen tickets with order number, table, and items', async () => {
    renderWithProviders(<KitchenDisplayPage />);

    await waitFor(() => {
      expect(screen.getByText('ORD-TSH-20261024-0001')).toBeInTheDocument();
      expect(screen.getByText('Wagyu Ribeye Meltique 200g')).toBeInTheDocument();
      expect(screen.getByText(/Medium Rare, Mushroom Sauce/i)).toBeInTheDocument();
    });
  });

  it('displays station filter tabs for Steak House', async () => {
    renderWithProviders(<KitchenDisplayPage />);

    await waitFor(() => {
      expect(screen.getByText(/Semua Stasiun Steak/i)).toBeInTheDocument();
      expect(screen.getByText(/Grill & Steak/i)).toBeInTheDocument();
      expect(screen.getByText(/Sides & Saus/i)).toBeInTheDocument();
    });
  });

  it('does NOT auto-print existing tickets on initial mount even if auto-print is ON in localStorage', async () => {
    localStorage.setItem('kds_auto_print_kitchen', 'true');
    renderWithProviders(<KitchenDisplayPage />);

    await waitFor(() => {
      expect(screen.getByText('ORD-TSH-20261024-0001')).toBeInTheDocument();
    });

    // Must NOT call printKitchenTicket for existing tickets loaded on mount
    expect(thermalPrinter.printKitchenTicket).not.toHaveBeenCalled();
    localStorage.removeItem('kds_auto_print_kitchen');
  });
});
