import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as inventoryApi from './inventory-api'
import { InventoryProcurementPage } from './InventoryProcurementPage'
import type {
  GoodsReceipt,
  InventoryItem,
  MenuHpaItem,
  PurchaseOrder,
  StockBalance,
  StockOpname,
  StockTransfer,
  Supplier,
  Warehouse,
  WasteRecord,
} from './types'

vi.mock('./inventory-api', () => ({
  listWarehouses: vi.fn(),
  getWarehouse: vi.fn(),
  createWarehouse: vi.fn(),
  updateWarehouse: vi.fn(),
  deleteWarehouse: vi.fn(),
  listStockBalances: vi.fn(),
  listInventoryItems: vi.fn(),
  listSuppliers: vi.fn(),
  createSupplier: vi.fn(),
  listPurchaseOrders: vi.fn(),
  getPurchaseOrder: vi.fn(),
  createPurchaseOrder: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
  listGoodsReceipts: vi.fn(),
  createGoodsReceipt: vi.fn(),
  listStockTransfers: vi.fn(),
  getStockTransfer: vi.fn(),
  createStockTransfer: vi.fn(),
  dispatchStockTransfer: vi.fn(),
  receiveStockTransfer: vi.fn(),
  cancelStockTransfer: vi.fn(),
  listStockOpnames: vi.fn(),
  getStockOpname: vi.fn(),
  createStockOpname: vi.fn(),
  saveOpnameCount: vi.fn(),
  approveStockOpname: vi.fn(),
  listWasteRecords: vi.fn(),
  createWasteRecord: vi.fn(),
  listMenuHpa: vi.fn(),
  updateMenuHpaMode: vi.fn(),
}))

const MOCK_WAREHOUSES: Warehouse[] = [
  {
    id: 'wh-ck-01',
    tenant_id: 'tenant-1',
    code: 'WH-CK-01',
    name: 'Gudang Central Kitchen Manding',
    warehouse_type: 'CENTRAL_KITCHEN',
    address: 'Jl. Boulevard Manding',
    pic_name: 'Chef Hendra',
    is_active: true,
    item_count: 5,
    total_stock_value: 5000000,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'wh-tsh-01',
    tenant_id: 'tenant-1',
    outlet_id: '01a16ca4-770a-7f46-9216-79dd3612a375',
    outlet_code: 'TSH-01',
    outlet_name: 'Tropical Steak House',
    code: 'WH-TSH-01',
    name: 'Chiller Tropical Steak House',
    warehouse_type: 'CHILLER',
    is_active: true,
    item_count: 4,
    total_stock_value: 3000000,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
]

const MOCK_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-1',
    tenant_id: 'tenant-1',
    code: 'SUP-MEAT-01',
    name: 'PT Agro Boga Utama',
    category: 'MEAT',
    term_of_payment_days: 14,
    is_active: true,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
]

const MOCK_ITEMS: InventoryItem[] = [
  {
    id: 'item-beef',
    tenant_id: 'tenant-1',
    category_id: 'cat-1',
    category_name: 'Daging Sapi',
    code: 'ING-BEEF-TEND',
    name: 'Australian Beef Tenderloin',
    unit: 'kg',
    storage_type: 'CHILLER',
    cost_price: 135000,
    current_stock: 25,
    min_stock_alert: 10,
    is_active: true,
  },
]

const MOCK_POS: PurchaseOrder[] = [
  {
    id: 'po-1',
    tenant_id: 'tenant-1',
    outlet_id: '01a16ca4-770a-7f46-9216-79dd3612a375',
    warehouse_id: 'wh-ck-01',
    warehouse_name: 'Gudang Central Kitchen Manding',
    supplier_id: 'sup-1',
    supplier_code: 'SUP-MEAT-01',
    supplier_name: 'PT Agro Boga Utama',
    po_number: 'PO-20261025-001',
    order_date: '2026-10-25',
    expected_delivery_date: '2026-10-26',
    status: 'SUBMITTED',
    subtotal_amount: 2700000,
    tax_amount: 0,
    total_amount: 2700000,
    created_at: '2026-10-25T00:00:00Z',
    updated_at: '2026-10-25T00:00:00Z',
    items: [
      {
        id: 'poi-1',
        purchase_order_id: 'po-1',
        item_id: 'item-beef',
        item_code: 'ING-BEEF-TEND',
        item_name: 'Australian Beef Tenderloin',
        unit: 'kg',
        ordered_qty: 20,
        unit_price: 135000,
        subtotal: 2700000,
        received_qty: 0,
      },
    ],
  },
]

const MOCK_GRS: GoodsReceipt[] = [
  {
    id: 'gr-1',
    tenant_id: 'tenant-1',
    receipt_number: 'GR-20261025-001',
    supplier_id: 'sup-1',
    supplier_name: 'PT Agro Boga Utama',
    warehouse_id: 'wh-ck-01',
    warehouse_name: 'Gudang Central Kitchen Manding',
    received_date: '2026-10-25',
    invoice_number: 'INV-888',
    total_billed_amount: 2700000,
    total_actual_amount: 2673000,
    received_by_name: 'Rian Pratama',
    created_at: '2026-10-25T00:00:00Z',
  },
]

const MOCK_BALANCES: StockBalance[] = [
  {
    id: 'sb-1',
    tenant_id: 'tenant-1',
    warehouse_id: 'wh-ck-01',
    warehouse_code: 'WH-CK-01',
    warehouse_name: 'Gudang Central Kitchen Manding',
    item_id: 'item-beef',
    item_code: 'ING-BEEF-TEND',
    item_name: 'Australian Beef Tenderloin',
    category_name: 'Daging Sapi',
    unit: 'kg',
    storage_type: 'CHILLER',
    cost_price: 135000,
    quantity: 25,
    reserved_quantity: 0,
    available_quantity: 25,
    min_stock_alert: 10,
    max_stock_capacity: 100,
    stock_status: 'OK',
    total_value: 3375000,
    updated_at: '2026-10-25T00:00:00Z',
  },
]

const MOCK_TRANSFERS: StockTransfer[] = [
  {
    id: 'trf-1',
    tenant_id: 'tenant-1',
    transfer_number: 'TRF-BR-202610-001',
    origin_warehouse_id: 'wh-tsh-01',
    origin_warehouse_name: 'Chiller Tropical Steak House',
    destination_warehouse_id: 'wh-tgr-01',
    destination_warehouse_name: 'Chiller Tropical Garden',
    origin_outlet_id: '01a16ca4-770a-7f46-9216-79dd3612a375',
    destination_outlet_id: '01a16ca4-770c-7143-80f4-2c8ece46d467',
    origin_outlet_name: 'Tropical Steak House',
    destination_outlet_name: 'Tropical Garden Resto',
    transfer_type: 'INTER_BRANCH',
    waybill_number: 'SJ-TRF-BR-001',
    transfer_date: '2026-10-25',
    status: 'IN_TRANSIT',
    dispatched_by_name: 'Pak Joko (Pickup Manding)',
    total_items: 1,
    total_variance_qty: 0,
    created_at: '2026-10-25T00:00:00Z',
    updated_at: '2026-10-25T00:00:00Z',
    items: [
      {
        id: 'ti-1',
        transfer_id: 'trf-1',
        item_id: 'item-beef',
        item_code: 'ING-BEEF-TEND',
        item_name: 'Australian Beef Tenderloin',
        unit: 'kg',
        requested_qty: 10,
        dispatched_qty: 10,
        received_qty: 0,
        variance_qty: 0,
      },
    ],
  },
]

const MOCK_OPNAMES: StockOpname[] = [
  {
    id: 'sop-1',
    tenant_id: 'tenant-1',
    opname_number: 'SOP-20261025-001',
    warehouse_id: 'wh-ck-01',
    warehouse_name: 'Gudang Central Kitchen Manding',
    opname_date: '2026-10-25',
    status: 'DRAFT',
    conducted_by_name: 'Tim Gudang',
    created_at: '2026-10-25T00:00:00Z',
    updated_at: '2026-10-25T00:00:00Z',
  },
]

const MOCK_WASTES: WasteRecord[] = [
  {
    id: 'wst-1',
    tenant_id: 'tenant-1',
    outlet_id: '01a16ca4-770a-7f46-9216-79dd3612a375',
    warehouse_id: 'wh-ck-01',
    warehouse_name: 'Gudang Central Kitchen Manding',
    waste_number: 'WST-20261025-001',
    waste_date: '2026-10-25',
    category: 'SPOILAGE_EXPIRED',
    total_cost: 135000,
    recorded_by_name: 'Chef Agus',
    created_at: '2026-10-25T00:00:00Z',
  },
]

const MOCK_HPA_ITEMS: MenuHpaItem[] = [
  {
    id: 'menu-tend',
    outlet_id: '01a16ca4-770a-7f46-9216-79dd3612a375',
    outlet_name: 'Tropical Steak House',
    category_name: 'Steak House Specialties',
    code: 'MENU-TSH-TEND-200',
    name: 'Australian Tenderloin Steak 200g',
    selling_price: 88000,
    hpa_calculation_mode: 'DYNAMIC_BOM',
    dynamic_bom_hpa: 41427,
    manual_hpa: 52000,
    effective_hpa: 41427,
    gross_margin: 46573,
    food_cost_pct: 47.08,
    variance_amount: -10573,
    variance_pct: -20.33,
    is_variance_alert: false,
    target_food_cost_pct: 48,
  },
]

describe('InventoryProcurementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(inventoryApi.listWarehouses).mockResolvedValue(MOCK_WAREHOUSES)
    vi.mocked(inventoryApi.listSuppliers).mockResolvedValue(MOCK_SUPPLIERS)
    vi.mocked(inventoryApi.listInventoryItems).mockResolvedValue(MOCK_ITEMS)
    vi.mocked(inventoryApi.listPurchaseOrders).mockResolvedValue(MOCK_POS)
    vi.mocked(inventoryApi.listGoodsReceipts).mockResolvedValue(MOCK_GRS)
    vi.mocked(inventoryApi.listStockBalances).mockResolvedValue(MOCK_BALANCES)
    vi.mocked(inventoryApi.listStockTransfers).mockResolvedValue(MOCK_TRANSFERS)
    vi.mocked(inventoryApi.getStockTransfer).mockResolvedValue(MOCK_TRANSFERS[0]!)
    vi.mocked(inventoryApi.listStockOpnames).mockResolvedValue(MOCK_OPNAMES)
    vi.mocked(inventoryApi.listWasteRecords).mockResolvedValue(MOCK_WASTES)
    vi.mocked(inventoryApi.listMenuHpa).mockResolvedValue(MOCK_HPA_ITEMS)
    vi.mocked(inventoryApi.getPurchaseOrder).mockResolvedValue(MOCK_POS[0]!)
  })

  it('renders the header and Tab 1 PO list correctly', async () => {
    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    expect(screen.getByText(/Pengadaan, Gudang Multi-Lokasi & HPA Realtime/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('PO-20261025-001')).toBeInTheDocument()
      expect(screen.getByText('PT Agro Boga Utama')).toBeInTheDocument()
    })
  })

  it('navigates to Tab 2 Penerimaan Barang and displays goods receipts', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('PO-20261025-001')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /2\. Penerimaan & Timbangan Aktual/i }))
    await waitFor(() => {
      expect(screen.getByText('GR-20261025-001')).toBeInTheDocument()
      expect(screen.getByText('INV-888')).toBeInTheDocument()
    })
  })

  it('navigates to Tab 3 Gudang Multi-Lokasi and displays warehouse topology and balances', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('PO-20261025-001')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /3\. Gudang Multi-Lokasi & Mutasi/i }))
    await waitFor(() => {
      expect(screen.getByText('WH-CK-01')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Chiller Tropical Steak House' })).toBeInTheDocument()
      expect(screen.getByText('Australian Beef Tenderloin')).toBeInTheDocument()
    })
  })

  it('navigates to Tab 4 Blind Stock Opname and shows protocol', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('PO-20261025-001')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /4\. Blind Stock Opname/i }))
    await waitFor(() => {
      expect(screen.getByText(/Protokol Blind Stock Opname/i)).toBeInTheDocument()
      expect(screen.getByText('SOP-20261025-001')).toBeInTheDocument()
    })
  })

  it('navigates to Tab 5 Waste & HPA and allows toggling Dual-Mode HPA', async () => {
    const user = userEvent.setup()
    vi.mocked(inventoryApi.updateMenuHpaMode).mockResolvedValue({ message: 'Success' })

    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('PO-20261025-001')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /5\. Waste & Monitoring HPA Realtime/i }))
    await waitFor(() => {
      expect(screen.getByText('Australian Tenderloin Steak 200g')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /⚙️ Dynamic BOM/i })).toBeInTheDocument()
    })

    const toggleBtn = screen.getByRole('button', { name: /⚙️ Dynamic BOM/i })
    await user.click(toggleBtn)

    expect(inventoryApi.updateMenuHpaMode).toHaveBeenCalledWith('menu-tend', {
      hpa_calculation_mode: 'MANUAL_OVERRIDE',
      manual_hpa: 52000,
    })
  })

  it('opens Receiving Modal prefilled with items when clicking "Terima di Timbangan" on a PO', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('PO-20261025-001')).toBeInTheDocument()
    })

    const receiveBtn = screen.getByRole('button', { name: /Terima di Timbangan/i })
    expect(receiveBtn).toBeInTheDocument()
    await user.click(receiveBtn)

    await waitFor(() => {
      expect(screen.getByText(/Penerimaan Barang & Timbangan Digital/i)).toBeInTheDocument()
      expect(screen.getByDisplayValue(/INV-20261025-001/i)).toBeInTheDocument()
    })
  })

  it('opens PO Detail Modal when clicking "Rincian PO"', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('PO-20261025-001')).toBeInTheDocument()
    })

    const detailBtn = screen.getByRole('button', { name: /Rincian PO/i })
    expect(detailBtn).toBeInTheDocument()
    await user.click(detailBtn)

    await waitFor(() => {
      expect(screen.getByText(/Dokumen pemesanan bahan ke supplier rekanan/i)).toBeInTheDocument()
      expect(screen.getByText(/Daftar Bahan yang Dipesan/i)).toBeInTheDocument()
    })
  })

  it('opens Goods Receipt Detail Modal when clicking "Rincian Timbangan" in Tab 2', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /2\. Penerimaan & Timbangan Aktual/i }))
    await waitFor(() => {
      expect(screen.getByText('GR-20261025-001')).toBeInTheDocument()
    })

    const grDetailBtn = screen.getByRole('button', { name: /Rincian Timbangan/i })
    expect(grDetailBtn).toBeInTheDocument()
    await user.click(grDetailBtn)

    await waitFor(() => {
      expect(screen.getByText(/Hasil timbangan riil dan perbandingan faktur/i)).toBeInTheDocument()
      expect(screen.getByText(/Nilai Riil Timbangan \(MAC\):/i)).toBeInTheDocument()
    })
  })

  it('navigates to Tab 6 Mutasi Antar-Resto & Cabang and displays transfers with waybills', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('PO-20261025-001')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /6\. Mutasi Antar-Resto & Cabang/i }))
    await waitFor(() => {
      expect(screen.getByText('TRF-BR-202610-001')).toBeInTheDocument()
    })
    expect(screen.getByText(/SJ: SJ-TRF-BR-001/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Antar-Cabang/i).length).toBeGreaterThan(0)
  })

  it('opens Transfer Detail Modal (Surat Jalan) when clicking "Surat Jalan" in Tab 6', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('PO-20261025-001')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /6\. Mutasi Antar-Resto & Cabang/i }))
    await waitFor(() => {
      expect(screen.getByText('TRF-BR-202610-001')).toBeInTheDocument()
    })

    const sjBtn = screen.getByRole('button', { name: /Surat Jalan/i })
    expect(sjBtn).toBeInTheDocument()
    await user.click(sjBtn)

    await waitFor(() => {
      expect(screen.getByText(/SURAT JALAN & BUKTI SERAH TERIMA MUTASI/i)).toBeInTheDocument()
      expect(screen.getByText(/Gudang & Resto Asal:/i)).toBeInTheDocument()
      expect(screen.getByText(/Rincian Muatan Barang/i)).toBeInTheDocument()
    })
  })

  it('opens Receive Modal for IN_TRANSIT transfer when clicking "Terima & Timbang"', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <InventoryProcurementPage />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('PO-20261025-001')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /6\. Mutasi Antar-Resto & Cabang/i }))
    await waitFor(() => {
      expect(screen.getByText('TRF-BR-202610-001')).toBeInTheDocument()
    })

    const receiveBtn = screen.getByRole('button', { name: /Terima & Timbang/i })
    expect(receiveBtn).toBeInTheDocument()
    await user.click(receiveBtn)

    await waitFor(() => {
      expect(screen.getByText(/Penerimaan & Audit Timbangan Mutasi/i)).toBeInTheDocument()
      expect(screen.getByText(/Hasil Timbangan Aktual di Gudang Tujuan/i)).toBeInTheDocument()
    })
  })
})
