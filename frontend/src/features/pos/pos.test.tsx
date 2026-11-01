import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TableFloorPlanPage } from './TableFloorPlanPage';
import * as posApi from './pos-api';
import type { DiningTable } from './types';

vi.mock('./pos-api');

const MOCK_TABLES: DiningTable[] = [
  {
    id: 'tbl-1',
    tenant_id: 'tenant-1',
    outlet_id: 'outlet-steak',
    outlet_code: 'TSH-01',
    table_number: 'T-01',
    section: 'INDOOR_MAIN',
    capacity: 4,
    shape: 'RECTANGLE',
    status: 'OCCUPIED',
    active_order_id: 'ord-1',
    active_order_number: 'ORD-TSH-20261024-0001',
    active_customer_name: 'Bpk. Agus Santoso',
    active_order_total: 190300,
    pos_x: 1,
    pos_y: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'tbl-2',
    tenant_id: 'tenant-1',
    outlet_id: 'outlet-garden',
    outlet_code: 'TGR-01',
    table_number: 'GAZEBO-01',
    section: 'OUTDOOR_GAZEBO',
    capacity: 6,
    shape: 'GAZEBO_OCTAGON',
    status: 'AVAILABLE',
    pos_x: 1,
    pos_y: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

describe('TableFloorPlanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(posApi.fetchTables).mockResolvedValue(MOCK_TABLES);
  });

  it('renders floor plan banner and displays indoor steak tables and outdoor gazebos', async () => {
    renderWithProviders(<TableFloorPlanPage />);

    expect(screen.getByText('Denah Meja Indoor & Gazebo Outdoor')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('T-01')).toBeInTheDocument();
      expect(screen.getByText('GAZEBO-01')).toBeInTheDocument();
      expect(screen.getByText('Bpk. Agus Santoso')).toBeInTheDocument();
      expect(screen.getByText('Rp 190.300')).toBeInTheDocument();
    });
  });
});
