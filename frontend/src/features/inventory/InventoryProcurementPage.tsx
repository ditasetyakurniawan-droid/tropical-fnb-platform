import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './inventory-glass.css'
import { useInventoryGlass } from './useInventoryGlass'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  CheckCircle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Flame,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  Sliders,
  Sparkles,
  Truck,
  X,
  XCircle,
} from 'lucide-react'
import { SmoothNumber } from '@/shared/ui/SmoothNumber'
import type {
  CreateGRInput,
  CreateOpnameInput,
  CreatePOInput,
  CreateTransferPayload,
  CreateWasteInput,
  GoodsReceipt,
  InventoryItem,
  MenuHpaItem,
  PurchaseOrder,
  StockBalance,
  StockOpname,
  StockTransfer,
  Supplier,
  Warehouse,
  WarehouseType,
  WasteRecord,
} from './types'
import {
  approveStockOpname,
  cancelPurchaseOrder,
  cancelStockTransfer,
  createGoodsReceipt,
  createPurchaseOrder,
  createStockOpname,
  createStockTransfer,
  createWarehouse,
  createWasteRecord,
  dispatchStockTransfer,
  getPurchaseOrder,
  getStockOpname,
  getStockTransfer,
  listGoodsReceipts,
  listInventoryItems,
  listMenuHpa,
  listPurchaseOrders,
  listStockBalances,
  listStockOpnames,
  listStockTransfers,
  listSuppliers,
  listWarehouses,
  listWasteRecords,
  receiveStockTransfer,
  saveOpnameCount,
  updateMenuHpaMode,
} from './inventory-api'
import { useAuthStore } from '@/features/auth/auth-store'
import { NumberInput } from '@/shared/ui/NumberInput'

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatNumber(num: number, decimals = 2): string {
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num)
}

type ActiveTab = 'po' | 'receiving' | 'warehouse' | 'opname' | 'hpa' | 'transfer'

interface POFormItem {
  item_id: string
  ordered_qty: number
  unit: string
  unit_price: number
}

interface GRFormItem {
  item_id: string
  billed_qty: number
  actual_weight_qty: number
  tare_weight: number
  unit: string
  unit_cost: number
  batch_number: string
  expiry_date: string
}

interface TransferFormItem {
  item_id: string
  requested_qty: number
  dispatched_qty: number
  unit: string
  notes?: string | undefined
}

interface ReceiveRowItem {
  item_id: string
  item_name: string
  unit: string
  dispatched_qty: number
  received_qty: number
  variance_reason: string
  notes: string
}

interface WasteFormItem {
  item_id: string
  quantity: number
  unit: string
  unit_cost: number
  notes: string
}

interface OpnameCountEntry {
  physical_qty: number
  variance_category: string
  notes: string
}

export const InventoryProcurementPage: React.FC = () => {
  const isGlobalAllOutlets = useAuthStore((s) => s.isGlobalAllOutlets)
  const activeOutletId = useAuthStore((s) => s.activeOutletId)
  const activeOutlet = useAuthStore((s) => s.getActiveOutlet())
  const accessibleOutlets = useAuthStore((s) => s.accessibleOutlets)

  const [activeTab, setActiveTab] = useState<ActiveTab>('po')
  const [selectedOutletFilter, setSelectedOutletFilter] = useState<string>('ALL')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Non-global staff is strictly locked to their active outlet
  const selectedOutlet = isGlobalAllOutlets
    ? selectedOutletFilter
    : (activeOutletId || accessibleOutlets[0]?.id || '01a16ca4-770a-7f46-9216-79dd3612a375')

  const setSelectedOutlet = useCallback((val: string) => {
    if (isGlobalAllOutlets) {
      setSelectedOutletFilter(val)
    }
  }, [isGlobalAllOutlets])

  // Master Data
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])

  // Tab 1: PO State
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [selectedPOStatus, setSelectedPOStatus] = useState<string>('ALL')
  const [showCreatePOModal, setShowCreatePOModal] = useState(false)
  const [selectedPODetail, setSelectedPODetail] = useState<PurchaseOrder | null>(null)
  const [confirmCancelPoId, setConfirmCancelPoId] = useState<string | null>(null)
  const [confirmApproveOpnameId, setConfirmApproveOpnameId] = useState<string | null>(null)
  const [poFormWarehouseId, setPoFormWarehouseId] = useState('')
  const [poFormSupplierId, setPoFormSupplierId] = useState('')
  const [poFormExpectedDate, setPoFormExpectedDate] = useState('')
  const [poFormNotes, setPoFormNotes] = useState('')
  const [poFormItems, setPoFormItems] = useState<POFormItem[]>([])

  // Tab 2: Receiving State
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([])
  const [showCreateGRModal, setShowCreateGRModal] = useState(false)
  const [selectedGRDetail, setSelectedGRDetail] = useState<GoodsReceipt | null>(null)
  const [grFormSupplierId, setGrFormSupplierId] = useState('')
  const [grFormWarehouseId, setGrFormWarehouseId] = useState('')
  const [grFormPoId, setGrFormPoId] = useState<string>('')
  const [grFormInvoiceNumber, setGrFormInvoiceNumber] = useState('')
  const [grFormReceiverName, setGrFormReceiverName] = useState('')
  const [grFormNotes, setGrFormNotes] = useState('')
  const [grFormItems, setGrFormItems] = useState<GRFormItem[]>([])

  // Tab 3: Decentralized Multi-Warehouse State
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('')
  const [stockBalances, setStockBalances] = useState<StockBalance[]>([])
  const [stockSearchQuery, setStockSearchQuery] = useState('')
  const [showCreateWarehouseModal, setShowCreateWarehouseModal] = useState(false)
  const [newWhOutletId, setNewWhOutletId] = useState('01a16ca4-770a-7f46-9216-79dd3612a375')
  const [newWhCode, setNewWhCode] = useState('')
  const [newWhName, setNewWhName] = useState('')
  const [newWhType, setNewWhType] = useState<WarehouseType>('DRY_STORE')
  const [newWhPic, setNewWhPic] = useState('')
  const [newWhAddress, setNewWhAddress] = useState('')

  // Tab 6: Peer-to-Peer Inter-Branch Stock Transfers State
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>([])
  const [trfStatusFilter, setTrfStatusFilter] = useState<string>('ALL')
  const [trfTypeFilter, setTrfTypeFilter] = useState<string>('ALL')
  const [trfSearchQuery, setTrfSearchQuery] = useState('')
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [trfOriginWhId, setTrfOriginWhId] = useState('')
  const [trfDestWhId, setTrfDestWhId] = useState('')
  const [trfDate, setTrfDate] = useState('')
  const [trfDriverName, setTrfDriverName] = useState('')
  const [trfNotes, setTrfNotes] = useState('')
  const [trfItems, setTrfItems] = useState<TransferFormItem[]>([])

  // Transfer Modals State
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [dispatchTarget, setDispatchTarget] = useState<StockTransfer | null>(null)
  const [dispatchDriver, setDispatchDriver] = useState('')
  const [dispatchWaybill, setDispatchWaybill] = useState('')
  const [dispatchItemQtys, setDispatchItemQtys] = useState<Record<string, number>>({})

  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [receiveTarget, setReceiveTarget] = useState<StockTransfer | null>(null)
  const [receiveReceiverName, setReceiveReceiverName] = useState('')
  const [receiveNotes, setReceiveNotes] = useState('')
  const [receiveRowItems, setReceiveRowItems] = useState<ReceiveRowItem[]>([])

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<StockTransfer | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const [showDetailModal, setShowDetailModal] = useState(false)
  const [detailTarget, setDetailTarget] = useState<StockTransfer | null>(null)

  // Tab 4: Stock Opname State
  const [stockOpnames, setStockOpnames] = useState<StockOpname[]>([])
  const [activeOpnameDetail, setActiveOpnameDetail] = useState<StockOpname | null>(null)
  const [showNewOpnameModal, setShowNewOpnameModal] = useState(false)
  const [opnameFormWhId, setOpnameFormWhId] = useState('')
  const [opnameFormStaffName, setOpnameFormStaffName] = useState('')
  const [opnameFormNotes, setOpnameFormNotes] = useState('')
  const [opnameCounts, setOpnameCounts] = useState<Record<string, OpnameCountEntry>>({})
  const [isBlindView, setIsBlindView] = useState(true)

  // Tab 5: Waste & HPA State
  const [wasteRecords, setWasteRecords] = useState<WasteRecord[]>([])
  const [menuHpaItems, setMenuHpaItems] = useState<MenuHpaItem[]>([])
  const [showWasteModal, setShowWasteModal] = useState(false)
  const [wasteWhId, setWasteWhId] = useState('')
  const [wasteCategory, setWasteCategory] = useState<
    'SPOILAGE_EXPIRED' | 'DROPPED_DAMAGED' | 'COOKING_MISTAKE' | 'STAFF_MEAL' | 'CUSTOM_REASON' | string
  >('SPOILAGE_EXPIRED')
  const [wasteCustomReason, setWasteCustomReason] = useState('')
  const [wasteRecipientDivision, setWasteRecipientDivision] = useState('')
  const [wasteStaffName, setWasteStaffName] = useState('')
  const [wasteNotes, setWasteNotes] = useState('')
  const [wasteItems, setWasteItems] = useState<WasteFormItem[]>([])
  const [editingHpaItem, setEditingHpaItem] = useState<MenuHpaItem | null>(null)
  const [editManualHpaVal, setEditManualHpaVal] = useState<number>(0)

  // Helper update functions to prevent unchecked index access errors
  const updatePOItem = (idx: number, patch: Partial<POFormItem>) => {
    setPoFormItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  const updateGRItem = (idx: number, patch: Partial<GRFormItem>) => {
    setGrFormItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  const updateTransferItem = (idx: number, patch: Partial<TransferFormItem>) => {
    setTrfItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  const updateWasteItem = (idx: number, patch: Partial<WasteFormItem>) => {
    setWasteItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  const updateOpnameCount = (itemId: string, patch: Partial<OpnameCountEntry>) => {
    setOpnameCounts((prev) => {
      const existing = prev[itemId] ?? {
        physical_qty: 0,
        variance_category: 'PORTIONING_VARIANCE',
        notes: '',
      }
      return {
        ...prev,
        [itemId]: {
          ...existing,
          ...patch,
        },
      }
    })
  }

  // Notification helper
  const notify = (msg: string, isError = false) => {
    if (isError) {
      setErrorMsg(msg)
      setSuccessMsg(null)
    } else {
      setSuccessMsg(msg)
      setErrorMsg(null)
    }
    setTimeout(() => {
      setErrorMsg(null)
      setSuccessMsg(null)
    }, 4500)
  }

  // Fetch Tab Specific Data
  const loadTabData = useCallback(async () => {
    try {
      const whFilter = selectedOutlet === 'ALL' ? undefined : (selectedWarehouseId || undefined)
      if (activeTab === 'po') {
        const pos = await listPurchaseOrders(
          whFilter,
          selectedPOStatus !== 'ALL' ? selectedPOStatus : undefined,
        )
        setPurchaseOrders(pos ?? [])
      } else if (activeTab === 'receiving') {
        const grs = await listGoodsReceipts(whFilter)
        setGoodsReceipts(grs ?? [])
      } else if (activeTab === 'warehouse') {
        const whId = selectedWarehouseId || warehouses[0]?.id
        if (whId) {
          const [balances, trfs] = await Promise.all([
            listStockBalances(whId),
            listStockTransfers(),
          ])
          setStockBalances(balances ?? [])
          setStockTransfers(trfs ?? [])
        }
      } else if (activeTab === 'transfer') {
        const trfs = await listStockTransfers({
          outlet_id: selectedOutlet === 'ALL' ? undefined : selectedOutlet,
          status: trfStatusFilter !== 'ALL' ? trfStatusFilter : undefined,
          transfer_type: trfTypeFilter !== 'ALL' ? trfTypeFilter : undefined,
        })
        setStockTransfers(trfs ?? [])
      } else if (activeTab === 'opname') {
        const ops = await listStockOpnames(whFilter)
        setStockOpnames(ops ?? [])
      } else if (activeTab === 'hpa') {
        const [wastes, hpas] = await Promise.all([
          listWasteRecords(whFilter),
          listMenuHpa(selectedOutlet),
        ])
        setWasteRecords(wastes ?? [])
        setMenuHpaItems(hpas ?? [])
      }
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memuat data tab', true)
    }
  }, [activeTab, selectedWarehouseId, selectedPOStatus, selectedOutlet, warehouses, trfStatusFilter, trfTypeFilter])

  // Initial Fetch Effect
  useEffect(() => {
    let isCancelled = false
    const fetchData = async () => {
      try {
        const [whs, allWhs, sups, items] = await Promise.all([
          listWarehouses(selectedOutlet),
          listWarehouses('ALL'),
          listSuppliers(),
          listInventoryItems(),
        ])
        if (isCancelled) return
        setWarehouses(whs ?? [])
        setAllWarehouses(allWhs ?? [])
        setSuppliers(sups ?? [])
        setInventoryItems(items ?? [])

        if (whs && whs.length > 0) {
          const first = whs[0]
          if (first) {
            setSelectedWarehouseId((prev) => (prev ? prev : first.id))
          }
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          notify(err instanceof Error ? err.message : 'Gagal memuat master data gudang', true)
        }
      }
    }
    void fetchData()
    return () => {
      isCancelled = true
    }
  }, [selectedOutlet])

  // Tab Data Fetch Effect
  useEffect(() => {
    let isCancelled = false
    const whFilter = selectedOutlet === 'ALL' ? undefined : (selectedWarehouseId || warehouses[0]?.id)
    const whId = selectedWarehouseId || warehouses[0]?.id

    const fetchTab = async () => {
      try {
        if (activeTab === 'po') {
          const pos = await listPurchaseOrders(
            whFilter,
            selectedPOStatus !== 'ALL' ? selectedPOStatus : undefined,
          )
          if (!isCancelled) setPurchaseOrders(pos ?? [])
        } else if (activeTab === 'receiving') {
          const grs = await listGoodsReceipts(whFilter)
          if (!isCancelled) setGoodsReceipts(grs ?? [])
        } else if (activeTab === 'warehouse') {
          if (whId) {
            const [balances, trfs] = await Promise.all([
              listStockBalances(whId),
              listStockTransfers(),
            ])
            if (!isCancelled) {
              setStockBalances(balances ?? [])
              setStockTransfers(trfs ?? [])
            }
          }
        } else if (activeTab === 'transfer') {
          const trfs = await listStockTransfers({
            outlet_id: selectedOutlet === 'ALL' ? undefined : selectedOutlet,
            status: trfStatusFilter !== 'ALL' ? trfStatusFilter : undefined,
            transfer_type: trfTypeFilter !== 'ALL' ? trfTypeFilter : undefined,
          })
          if (!isCancelled) setStockTransfers(trfs ?? [])
        } else if (activeTab === 'opname') {
          const ops = await listStockOpnames(whFilter)
          if (!isCancelled) setStockOpnames(ops ?? [])
        } else if (activeTab === 'hpa') {
          const [wastes, hpas] = await Promise.all([
            listWasteRecords(whFilter),
            listMenuHpa(selectedOutlet),
          ])
          if (!isCancelled) {
            setWasteRecords(wastes ?? [])
            setMenuHpaItems(hpas ?? [])
          }
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          notify(err instanceof Error ? err.message : 'Gagal memuat data tab', true)
        }
      }
    }
    void fetchTab()
    return () => {
      isCancelled = true
    }
  }, [activeTab, selectedWarehouseId, selectedPOStatus, selectedOutlet, warehouses, trfStatusFilter, trfTypeFilter])

  const handleRefresh = async () => {
    setLoading(true)
    try {
      const [whs, sups, items] = await Promise.all([
        listWarehouses(selectedOutlet),
        listSuppliers(),
        listInventoryItems(),
      ])
      setWarehouses(whs ?? [])
      setSuppliers(sups ?? [])
      setInventoryItems(items ?? [])
      await loadTabData()
    } finally {
      setLoading(false)
    }
  }

  // Filtered Stock Balances for search
  const filteredStockBalances = useMemo(() => {
    if (!stockSearchQuery.trim()) return stockBalances
    const q = stockSearchQuery.toLowerCase()
    return stockBalances.filter(
      (b) =>
        b.item_name.toLowerCase().includes(q) ||
        b.item_code.toLowerCase().includes(q) ||
        b.category_name.toLowerCase().includes(q),
    )
  }, [stockBalances, stockSearchQuery])

  // Filtered Stock Transfers for search and filters
  const filteredStockTransfers = useMemo(() => {
    return stockTransfers.filter((trf) => {
      if (trfStatusFilter !== 'ALL' && trf.status !== trfStatusFilter) return false
      if (trfTypeFilter !== 'ALL' && trf.transfer_type !== trfTypeFilter) return false
      if (trfSearchQuery.trim()) {
        const q = trfSearchQuery.toLowerCase()
        const matchTrf = trf.transfer_number.toLowerCase().includes(q)
        const matchWb = trf.waybill_number ? trf.waybill_number.toLowerCase().includes(q) : false
        const matchOrigin = trf.origin_warehouse_name ? trf.origin_warehouse_name.toLowerCase().includes(q) : false
        const matchDest = trf.destination_warehouse_name ? trf.destination_warehouse_name.toLowerCase().includes(q) : false
        const matchDriver = trf.dispatched_by_name ? trf.dispatched_by_name.toLowerCase().includes(q) : false
        if (!matchTrf && !matchWb && !matchOrigin && !matchDest && !matchDriver) return false
      }
      return true
    })
  }, [stockTransfers, trfStatusFilter, trfTypeFilter, trfSearchQuery])

  // =========================================================================
  // ACTIONS TAB 1: PO
  // =========================================================================
  const handleAddPOItem = () => {
    if (inventoryItems.length === 0) return
    const firstItem = inventoryItems[0]
    if (!firstItem) return
    setPoFormItems((prev) => [
      ...prev,
      {
        item_id: firstItem.id,
        ordered_qty: 10,
        unit: firstItem.unit,
        unit_price: firstItem.cost_price,
      },
    ])
  }

  const handleCreatePOSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!poFormWarehouseId || !poFormSupplierId || poFormItems.length === 0) {
      notify('Lengkapi gudang, supplier, dan minimal 1 item pesanan', true)
      return
    }
    const wh = warehouses.find((w) => w.id === poFormWarehouseId)
    const payload: CreatePOInput = {
      outlet_id: wh?.outlet_id || '01a16ca4-770a-7f46-9216-79dd3612a375',
      warehouse_id: poFormWarehouseId,
      supplier_id: poFormSupplierId,
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: poFormExpectedDate || new Date().toISOString().slice(0, 10),
      notes: poFormNotes || undefined,
      items: poFormItems.map((it) => ({
        item_id: it.item_id,
        ordered_qty: Number(it.ordered_qty) || 1,
        unit: it.unit,
        unit_price: Number(it.unit_price) || 0,
      })),
    }

    try {
      const res = await createPurchaseOrder(payload)
      notify(`Purchase Order ${res.po_number} berhasil dibuat!`)
      setShowCreatePOModal(false)
      setPoFormItems([])
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal membuat PO', true)
    }
  }

  const handleCancelPO = async (id: string) => {
    try {
      await cancelPurchaseOrder(id)
      setConfirmCancelPoId(null)
      notify('Purchase Order berhasil dibatalkan')
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal membatalkan PO', true)
    }
  }

  const handleViewPODetail = async (poId: string) => {
    try {
      setLoading(true)
      const detail = await getPurchaseOrder(poId)
      setSelectedPODetail(detail)
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memuat rincian PO', true)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenGRForPO = async (po: PurchaseOrder) => {
    try {
      setLoading(true)
      const poDetail = await getPurchaseOrder(po.id)
      setGrFormPoId(poDetail.id)
      setGrFormSupplierId(poDetail.supplier_id)
      setGrFormWarehouseId(poDetail.warehouse_id)
      setGrFormInvoiceNumber(`INV-${poDetail.po_number.replace('PO-', '')}`)
      setGrFormReceiverName('')
      setGrFormNotes(`Penerimaan Timbangan aktual atas ${poDetail.po_number}`)
      if (poDetail.items && poDetail.items.length > 0) {
        setGrFormItems(
          poDetail.items.map((it) => ({
            item_id: it.item_id,
            billed_qty: it.ordered_qty,
            actual_weight_qty: it.ordered_qty,
            tare_weight: 0,
            unit: it.unit,
            unit_cost: it.unit_price,
            batch_number: `LOT-${Date.now().toString().slice(-4)}`,
            expiry_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
          })),
        )
      } else {
        setGrFormItems([])
        handleAddGRItem()
      }
      setSelectedPODetail(null)
      setShowCreateGRModal(true)
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memuat detail PO untuk penerimaan', true)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenOpnameSheet = async (so: StockOpname) => {
    try {
      setLoading(true)
      const detail = await getStockOpname(so.id)
      setActiveOpnameDetail(detail)
      const counts: Record<string, OpnameCountEntry> = {}
      detail.items?.forEach((it) => {
        counts[it.item_id] = {
          physical_qty: it.physical_counted_qty ?? 0,
          variance_category: it.variance_category || 'PORTIONING_VARIANCE',
          notes: it.notes || '',
        }
      })
      setOpnameCounts(counts)
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memuat detail sesi stock opname', true)
    } finally {
      setLoading(false)
    }
  }

  // =========================================================================
  // ACTIONS TAB 2: RECEIVING
  // =========================================================================
  const handleAddGRItem = () => {
    if (inventoryItems.length === 0) return
    const firstItem = inventoryItems[0]
    if (!firstItem) return
    setGrFormItems((prev) => [
      ...prev,
      {
        item_id: firstItem.id,
        billed_qty: 20,
        actual_weight_qty: 19.8,
        tare_weight: 0,
        unit: firstItem.unit,
        unit_cost: firstItem.cost_price,
        batch_number: `LOT-${Date.now().toString().slice(-4)}`,
        expiry_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
      },
    ])
  }

  const handleCreateGRSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!grFormWarehouseId || !grFormSupplierId || grFormItems.length === 0) {
      notify('Lengkapi data penerimaan dan timbangan barang', true)
      return
    }

    const payload: CreateGRInput = {
      purchase_order_id: grFormPoId || undefined,
      supplier_id: grFormSupplierId,
      warehouse_id: grFormWarehouseId,
      received_date: new Date().toISOString().slice(0, 10),
      invoice_number: grFormInvoiceNumber || undefined,
      received_by_name: grFormReceiverName || 'Staf Receiving',
      notes: grFormNotes || undefined,
      items: grFormItems.map((it) => {
        const netActual = Math.max(0, it.actual_weight_qty - (it.tare_weight || 0))
        return {
          item_id: it.item_id,
          billed_qty: Number(it.billed_qty) || 0,
          actual_weight_qty: netActual,
          unit: it.unit,
          unit_cost: Number(it.unit_cost) || 0,
          reject_qty: 0,
          batch_number: it.batch_number || undefined,
          expiry_date: it.expiry_date || undefined,
        }
      }),
    }

    try {
      const res = await createGoodsReceipt(payload)
      notify(`Penerimaan ${res.receipt_number} dicatat! Moving Average Cost berhasil diperbarui.`)
      setShowCreateGRModal(false)
      setGrFormItems([])
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal mencatat penerimaan', true)
    }
  }

  // =========================================================================
  // ACTIONS TAB 3: DECENTRALIZED WAREHOUSE
  // =========================================================================
  const handleCreateWarehouseSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWhCode.trim() || !newWhName.trim()) {
      notify('Kode dan nama gudang wajib diisi', true)
      return
    }
    try {
      await createWarehouse({
        outlet_id: newWhOutletId,
        code: newWhCode.trim().toUpperCase(),
        name: newWhName.trim(),
        warehouse_type: newWhType,
        pic_name: newWhPic.trim() || undefined,
        address: newWhAddress.trim() || undefined,
      })
      notify(`Gudang baru ${newWhName} berhasil ditambahkan!`)
      setShowCreateWarehouseModal(false)
      setNewWhCode('')
      setNewWhName('')
      setNewWhPic('')
      setNewWhAddress('')
      const [whs, allWhs] = await Promise.all([
        listWarehouses(selectedOutlet),
        listWarehouses('ALL'),
      ])
      setWarehouses(whs ?? [])
      setAllWarehouses(allWhs ?? [])
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal membuat gudang baru', true)
    }
  }

  // =========================================================================
  // ACTIONS TAB 6: INTER-BRANCH STOCK TRANSFERS
  // =========================================================================
  const handleAddTransferItem = () => {
    if (inventoryItems.length === 0) return
    const first = inventoryItems[0]
    if (!first) return
    setTrfItems((prev) => [
      ...prev,
      {
        item_id: first.id,
        requested_qty: 5,
        dispatched_qty: 5,
        unit: first.unit,
        notes: '',
      },
    ])
  }

  const handleCreateTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!trfOriginWhId || !trfDestWhId || trfOriginWhId === trfDestWhId || trfItems.length === 0) {
      notify('Pilih gudang asal dan tujuan yang berbeda serta isi minimal 1 item mutasi', true)
      return
    }

    const payload: CreateTransferPayload = {
      origin_warehouse_id: trfOriginWhId,
      destination_warehouse_id: trfDestWhId,
      transfer_date: trfDate || new Date().toISOString().slice(0, 10),
      dispatched_by_name: trfDriverName.trim() || undefined,
      notes: trfNotes.trim() || undefined,
      items: trfItems.map((it) => ({
        item_id: it.item_id,
        requested_qty: Number(it.requested_qty) || 0,
        unit: it.unit,
        notes: it.notes?.trim() || undefined,
      })),
    }

    try {
      const res = await createStockTransfer(payload)
      notify(`Permintaan mutasi ${res.transfer_number} (Surat Jalan ${res.waybill_number ?? '-'}) berhasil diajukan! Status: PENDING.`)
      setShowTransferModal(false)
      setTrfItems([])
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal membuat permintaan mutasi stok', true)
    }
  }

  const handleOpenDispatch = (trf: StockTransfer) => {
    setDispatchTarget(trf)
    setDispatchDriver(trf.dispatched_by_name || '')
    setDispatchWaybill(trf.waybill_number || `SJ-${trf.transfer_number}`)
    const initQtys: Record<string, number> = {}
    trf.items?.forEach((it) => {
      initQtys[it.item_id] = it.requested_qty
    })
    setDispatchItemQtys(initQtys)
    setShowDispatchModal(true)
  }

  const handleDispatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dispatchTarget) return

    try {
      await dispatchStockTransfer(dispatchTarget.id, {
        dispatched_by_name: dispatchDriver.trim() || undefined,
        waybill_number: dispatchWaybill.trim() || undefined,
        items: dispatchTarget.items?.map((it) => ({
          item_id: it.item_id,
          dispatched_qty: Number(dispatchItemQtys[it.item_id]) || it.requested_qty,
        })),
      })
      notify(`Barang untuk mutasi ${dispatchTarget.transfer_number} telah diberangkatkan! Stok asal berhasil dipotong.`)
      setShowDispatchModal(false)
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memberangkatkan pengiriman mutasi', true)
    }
  }

  const handleOpenReceive = async (trf: StockTransfer) => {
    try {
      const full = await getStockTransfer(trf.id)
      setReceiveTarget(full)
      setReceiveReceiverName('')
      setReceiveNotes('')
      const rows: ReceiveRowItem[] = (full.items ?? []).map((it) => ({
        item_id: it.item_id,
        item_name: it.item_name,
        unit: it.unit,
        dispatched_qty: it.dispatched_qty > 0 ? it.dispatched_qty : it.requested_qty,
        received_qty: it.dispatched_qty > 0 ? it.dispatched_qty : it.requested_qty,
        variance_reason: 'Susut timbangan kemasan es mencair saat transit',
        notes: '',
      }))
      setReceiveRowItems(rows)
      setShowReceiveModal(true)
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal memuat rincian transfer untuk penerimaan', true)
    }
  }

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!receiveTarget) return

    try {
      await receiveStockTransfer(receiveTarget.id, {
        received_by_name: receiveReceiverName.trim() || undefined,
        notes: receiveNotes.trim() || undefined,
        items: receiveRowItems.map((r) => ({
          item_id: r.item_id,
          received_qty: Number(r.received_qty) || 0,
          variance_reason: r.dispatched_qty > r.received_qty ? r.variance_reason : undefined,
          notes: r.notes.trim() || undefined,
        })),
      })
      notify(`Mutasi ${receiveTarget.transfer_number} berhasil diterima! Saldo gudang tujuan telah bertambah.`)
      setShowReceiveModal(false)
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal menerima mutasi barang', true)
    }
  }

  const handleConfirmReceiveTransfer = async (transferId: string) => {
    try {
      await receiveStockTransfer(transferId, {
        received_by_name: 'Kepala Dapur Outlet',
        items: [],
      })
      notify('Mutasi barang berhasil diterima! Saldo gudang tujuan telah bertambah.')
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal konfirmasi penerimaan transfer', true)
    }
  }

  const handleOpenCancel = (trf: StockTransfer) => {
    setCancelTarget(trf)
    setCancelReason('')
    setShowCancelModal(true)
  }

  const handleCancelTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cancelTarget) return
    if (!cancelReason.trim()) {
      notify('Alasan pembatalan wajib diisi', true)
      return
    }

    try {
      await cancelStockTransfer(cancelTarget.id, { cancellation_reason: cancelReason.trim() })
      notify(`Mutasi ${cancelTarget.transfer_number} berhasil dibatalkan. Stok telah dikembalikan ke gudang asal.`)
      setShowCancelModal(false)
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal membatalkan mutasi stok', true)
    }
  }

  const handleOpenDetail = async (trf: StockTransfer) => {
    try {
      const full = await getStockTransfer(trf.id)
      setDetailTarget(full)
      setShowDetailModal(true)
    } catch {
      setDetailTarget(trf)
      setShowDetailModal(true)
    }
  }

  // =========================================================================
  // ACTIONS TAB 4: STOCK OPNAME
  // =========================================================================
  const handleCreateOpnameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!opnameFormWhId) {
      notify('Pilih gudang untuk sesi stock opname', true)
      return
    }
    const payload: CreateOpnameInput = {
      warehouse_id: opnameFormWhId,
      opname_date: new Date().toISOString().slice(0, 10),
      conducted_by_name: opnameFormStaffName || 'Tim Stock Opname Lapangan',
      notes: opnameFormNotes || undefined,
    }
    try {
      const res = await createStockOpname(payload)
      notify(`Sesi Stock Opname ${res.opname_number} aktif! Siap untuk input fisik.`)
      setShowNewOpnameModal(false)
      setActiveOpnameDetail(res)
      // Initialize counts
      const counts: Record<string, OpnameCountEntry> = {}
      res.items?.forEach((it) => {
        counts[it.item_id] = {
          physical_qty: it.physical_counted_qty ?? 0,
          variance_category: 'PORTIONING_VARIANCE',
          notes: '',
        }
      })
      setOpnameCounts(counts)
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal membuat sesi stock opname', true)
    }
  }

  const handleSaveOpnameCounts = async () => {
    if (!activeOpnameDetail) return
    const items = Object.entries(opnameCounts).map(([itemId, val]) => ({
      item_id: itemId,
      physical_counted_qty: Number(val.physical_qty) || 0,
      variance_category: val.variance_category || 'PORTIONING_VARIANCE',
      notes: val.notes || undefined,
    }))
    try {
      await saveOpnameCount(activeOpnameDetail.id, { items })
      notify('Penghitungan fisik berhasil disimpan ke server!')
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal menyimpan hitungan fisik', true)
    }
  }

  const handleApproveOpname = async (opnameId: string) => {
    try {
      await approveStockOpname(opnameId)
      setConfirmApproveOpnameId(null)
      notify('Stock Opname berhasil disetujui! Saldo gudang telah disesuaikan dengan data fisik.')
      setActiveOpnameDetail(null)
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal menyetujui stock opname', true)
    }
  }

  // =========================================================================
  // ACTIONS TAB 5: WASTE & HPA
  // =========================================================================
  const handleAddWasteItem = () => {
    if (inventoryItems.length === 0) return
    const first = inventoryItems[0]
    if (!first) return
    setWasteItems((prev) => [
      ...prev,
      {
        item_id: first.id,
        quantity: 1,
        unit: first.unit,
        unit_cost: first.cost_price,
        notes: '',
      },
    ])
  }

  const handleCreateWasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!wasteWhId || wasteItems.length === 0) {
      notify('Pilih gudang dan isi item waste / spoilage', true)
      return
    }
    const wh = warehouses.find((w) => w.id === wasteWhId)
    const finalCategory =
      wasteCategory === 'CUSTOM_REASON' && wasteCustomReason.trim()
        ? wasteCustomReason.trim()
        : wasteCategory

    const payload: CreateWasteInput = {
      outlet_id: wh?.outlet_id || '01a16ca4-770a-7f46-9216-79dd3612a375',
      warehouse_id: wasteWhId,
      waste_date: new Date().toISOString().slice(0, 10),
      category: finalCategory,
      ...(wasteRecipientDivision.trim() ? { recipient_division: wasteRecipientDivision.trim() } : {}),
      recorded_by_name: wasteStaffName || 'Kitchen Supervisor',
      notes: wasteNotes || undefined,
      items: wasteItems.map((it) => ({
        item_id: it.item_id,
        quantity: Number(it.quantity) || 0,
        unit: it.unit,
        unit_cost: Number(it.unit_cost) || 0,
        notes: it.notes || undefined,
      })),
    }

    try {
      const res = await createWasteRecord(payload)
      notify(`Pencatatan Waste ${res.waste_number} berhasil disimpan (Biaya: ${formatRupiah(res.total_cost)})`)
      setShowWasteModal(false)
      setWasteItems([])
      setWasteCustomReason('')
      setWasteRecipientDivision('')
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal mencatat waste', true)
    }
  }

  const handleToggleHpaMode = async (item: MenuHpaItem) => {
    const newMode = item.hpa_calculation_mode === 'DYNAMIC_BOM' ? 'MANUAL_OVERRIDE' : 'DYNAMIC_BOM'
    try {
      await updateMenuHpaMode(item.id, {
        hpa_calculation_mode: newMode,
        manual_hpa: item.manual_hpa || item.dynamic_bom_hpa,
      })
      notify(`Mode HPA untuk "${item.name}" diubah menjadi ${newMode}`)
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal mengubah mode HPA', true)
    }
  }

  const handleSaveManualHpa = async () => {
    if (!editingHpaItem) return
    try {
      await updateMenuHpaMode(editingHpaItem.id, {
        hpa_calculation_mode: 'MANUAL_OVERRIDE',
        manual_hpa: editManualHpaVal,
      })
      notify(`Target HPA Manual untuk "${editingHpaItem.name}" berhasil disimpan!`)
      setEditingHpaItem(null)
      void loadTabData()
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal menyimpan target HPA', true)
    }
  }

  const glassRootRef = useRef<HTMLDivElement>(null)
  useInventoryGlass(glassRootRef)

  return (
    <div ref={glassRootRef} className="inv-glass space-y-6 max-w-7xl mx-auto pb-16 text-slate-800">
      {/* Toast Notifications */}
      {errorMsg && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-3 text-white shadow-xl">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-white shadow-xl">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="space-y-6">
        {/* Header Bar */}
        <div data-spot="panel" className="bg-white/95 rounded-3xl p-6 shadow-sm border border-slate-200/90 transition-all">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-500 text-white shadow-md shadow-amber-500/20">
                  <Package className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">
                    Pengadaan, Gudang Multi-Lokasi &amp; HPA Realtime
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5 font-semibold">
                    {isGlobalAllOutlets
                      ? 'Tropical Steak House (TSH-01) • Tropical Garden Resto (TGR-01) • Multi-Gudang Terdesentralisasi & Mutasi Antar-Resto Peer-to-Peer'
                      : `${activeOutlet?.name ?? 'Cabang Resto'} (${activeOutlet?.code ?? 'RESTO'}) • Gudang & Logistik Bahan Baku Cabang`}
                  </p>
                </div>
              </div>
            </div>

            {/* Filter Outlet & Refresh */}
            <div className="flex flex-wrap items-center gap-3">
              {isGlobalAllOutlets ? (
                <div data-spot="control" className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100 p-1 rounded-2xl border border-slate-300 shadow-2xs">
                  <Building2 className="h-4 w-4 text-amber-600 ml-2" />
                  <select
                    value={selectedOutlet}
                    onChange={(e) => setSelectedOutlet(e.target.value)}
                    className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none pr-2 py-1 cursor-pointer"
                  >
                    <option value="ALL">Semua Outlet (Konsolidasi Grup)</option>
                    <option value="01a16ca4-770a-7f46-9216-79dd3612a375">Tropical Steak House (TSH-01)</option>
                    <option value="01a16ca4-770c-7143-80f4-2c8ece46d467">Tropical Garden Resto (TGR-01)</option>
                  </select>
                </div>
              ) : (
                <div data-spot="control" className="flex items-center gap-2 bg-slate-50 px-3.5 py-2 rounded-2xl border border-slate-300 text-xs font-bold text-slate-800 shadow-2xs">
                  <Building2 className="h-4 w-4 text-amber-600" />
                  <span>{activeOutlet?.name ?? 'Cabang Resto'}</span>
                  <span className="text-[10px] text-slate-600 font-mono font-bold">[🔒 {activeOutlet?.code ?? 'RESTO'}]</span>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={loading}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-2xl shadow-2xs transition-colors cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-amber-600' : ''}`} />
                Segarkan
              </button>
            </div>
          </div>

          {/* Navigation Tabs (High-Contrast Operational Command Cards) */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {/* Tab 1: Pengadaan & PO Supplier */}
            <button
              type="button"
              onClick={() => setActiveTab('po')} data-spot="workflow" data-active={activeTab === 'po'} aria-pressed={activeTab === 'po'}
              className={`p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                activeTab === 'po'
                  ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md shadow-amber-500/25 ring-2 ring-amber-400/40 border-amber-500'
                  : 'bg-white hover:bg-amber-50/40 border-slate-200/90 hover:border-amber-300 text-slate-800 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={`p-1.5 rounded-lg ${
                    activeTab === 'po' ? 'bg-amber-500/50 text-white' : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  <Truck className="h-4 w-4" />
                </div>
                {purchaseOrders?.length > 0 && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      activeTab === 'po' ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-900 border border-amber-200'
                    }`}
                  >
                    {purchaseOrders.length} PO
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className={`text-xs font-bold ${activeTab === 'po' ? 'text-white' : 'text-slate-900'}`}>
                  1. Pengadaan &amp; PO Supplier
                </div>
                <div className={`text-[11px] font-semibold ${activeTab === 'po' ? 'text-amber-100' : 'text-slate-600'}`}>
                  Pemesanan &amp; Vendor
                </div>
              </div>
            </button>

            {/* Tab 2: Penerimaan & Timbangan Aktual */}
            <button
              type="button"
              onClick={() => setActiveTab('receiving')} data-spot="workflow" data-active={activeTab === 'receiving'} aria-pressed={activeTab === 'receiving'}
              className={`p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                activeTab === 'receiving'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/40 border-emerald-500'
                  : 'bg-white hover:bg-emerald-50/40 border-slate-200/90 hover:border-emerald-300 text-slate-800 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={`p-1.5 rounded-lg ${
                    activeTab === 'receiving' ? 'bg-emerald-500/50 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  <Scale className="h-4 w-4" />
                </div>
                {goodsReceipts?.length > 0 && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      activeTab === 'receiving' ? 'bg-white text-emerald-700' : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                    }`}
                  >
                    {goodsReceipts.length} GR
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className={`text-xs font-bold ${activeTab === 'receiving' ? 'text-white' : 'text-slate-900'}`}>
                  2. Penerimaan &amp; Timbangan Aktual
                </div>
                <div className={`text-[11px] font-semibold ${activeTab === 'receiving' ? 'text-emerald-100' : 'text-slate-600'}`}>
                  Cek Berat Riil &amp; MAC
                </div>
              </div>
            </button>

            {/* Tab 3: Gudang Multi-Lokasi & Mutasi */}
            <button
              type="button"
              onClick={() => setActiveTab('warehouse')} data-spot="workflow" data-active={activeTab === 'warehouse'} aria-pressed={activeTab === 'warehouse'}
              className={`p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                activeTab === 'warehouse'
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-md shadow-indigo-500/25 ring-2 ring-indigo-400/40 border-indigo-500'
                  : 'bg-white hover:bg-indigo-50/40 border-slate-200/90 hover:border-indigo-300 text-slate-800 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={`p-1.5 rounded-lg ${
                    activeTab === 'warehouse' ? 'bg-indigo-500/50 text-white' : 'bg-indigo-100 text-indigo-800'
                  }`}
                >
                  <Building2 className="h-4 w-4" />
                </div>
                {warehouses?.length > 0 && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      activeTab === 'warehouse' ? 'bg-white text-indigo-700' : 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                    }`}
                  >
                    {warehouses.length} Gudang
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className={`text-xs font-bold ${activeTab === 'warehouse' ? 'text-white' : 'text-slate-900'}`}>
                  3. Gudang Multi-Lokasi &amp; Mutasi
                </div>
                <div className={`text-[11px] font-semibold ${activeTab === 'warehouse' ? 'text-indigo-100' : 'text-slate-600'}`}>
                  Gudang Mandiri Cabang
                </div>
              </div>
            </button>

            {/* Tab 4: Blind Stock Opname */}
            <button
              type="button"
              onClick={() => setActiveTab('opname')} data-spot="workflow" data-active={activeTab === 'opname'} aria-pressed={activeTab === 'opname'}
              className={`p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                activeTab === 'opname'
                  ? 'bg-gradient-to-r from-purple-700 to-purple-600 text-white shadow-md shadow-purple-500/25 ring-2 ring-purple-400/40 border-purple-600'
                  : 'bg-white hover:bg-purple-50/40 border-slate-200/90 hover:border-purple-300 text-slate-800 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={`p-1.5 rounded-lg ${
                    activeTab === 'opname' ? 'bg-purple-600/50 text-white' : 'bg-purple-100 text-purple-800'
                  }`}
                >
                  <ClipboardList className="h-4 w-4" />
                </div>
                {stockOpnames?.filter((o) => o.status === 'DRAFT').length > 0 && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      activeTab === 'opname' ? 'bg-white text-purple-700' : 'bg-purple-100 text-purple-900 border border-purple-200'
                    }`}
                  >
                    {stockOpnames.filter((o) => o.status === 'DRAFT').length} Aktif
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className={`text-xs font-bold ${activeTab === 'opname' ? 'text-white' : 'text-slate-900'}`}>
                  4. Blind Stock Opname (Anti-Manipulasi)
                </div>
                <div className={`text-[11px] font-semibold ${activeTab === 'opname' ? 'text-purple-100' : 'text-slate-600'}`}>
                  Audit Fisik Independen
                </div>
              </div>
            </button>

            {/* Tab 5: Waste & Monitoring HPA Realtime */}
            <button
              type="button"
              onClick={() => setActiveTab('hpa')} data-spot="workflow" data-active={activeTab === 'hpa'} aria-pressed={activeTab === 'hpa'}
              className={`p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                activeTab === 'hpa'
                  ? 'bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-md shadow-rose-500/25 ring-2 ring-rose-400/40 border-rose-500'
                  : 'bg-white hover:bg-rose-50/40 border-slate-200/90 hover:border-rose-300 text-slate-800 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={`p-1.5 rounded-lg ${
                    activeTab === 'hpa' ? 'bg-rose-500/50 text-white' : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  <Sliders className="h-4 w-4" />
                </div>
                {menuHpaItems?.filter((m) => m.is_variance_alert).length > 0 && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full animate-pulse ${
                      activeTab === 'hpa' ? 'bg-white text-rose-700' : 'bg-rose-100 text-rose-900 border border-rose-200'
                    }`}
                  >
                    {menuHpaItems.filter((m) => m.is_variance_alert).length} Alert
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className={`text-xs font-bold ${activeTab === 'hpa' ? 'text-white' : 'text-slate-900'}`}>
                  5. Waste &amp; Monitoring HPA Realtime
                </div>
                <div className={`text-[11px] font-semibold ${activeTab === 'hpa' ? 'text-rose-100' : 'text-slate-600'}`}>
                  Dynamic BOM vs Target
                </div>
              </div>
            </button>

            {/* Tab 6: Mutasi Antar-Resto & Cabang */}
            <button
              type="button"
              onClick={() => setActiveTab('transfer')} data-spot="workflow" data-active={activeTab === 'transfer'} aria-pressed={activeTab === 'transfer'}
              className={`p-3.5 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                activeTab === 'transfer'
                  ? 'bg-gradient-to-r from-blue-600 to-sky-500 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/40 border-blue-500'
                  : 'bg-white hover:bg-blue-50/40 border-slate-200/90 hover:border-blue-300 text-slate-800 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div
                  className={`p-1.5 rounded-lg ${
                    activeTab === 'transfer' ? 'bg-blue-500/50 text-white' : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  <ArrowRightLeft className="h-4 w-4" />
                </div>
                {stockTransfers?.filter((t) => t.status === 'IN_TRANSIT').length > 0 && (
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                      activeTab === 'transfer' ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-900 border border-blue-200 animate-pulse'
                    }`}
                  >
                    {stockTransfers.filter((t) => t.status === 'IN_TRANSIT').length} In-Transit
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <div className={`text-xs font-bold ${activeTab === 'transfer' ? 'text-white' : 'text-slate-900'}`}>
                  6. Mutasi Antar-Resto &amp; Cabang
                </div>
                <div className={`text-[11px] font-semibold ${activeTab === 'transfer' ? 'text-blue-100' : 'text-slate-600'}`}>
                  Steak ⇄ Garden Resto
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* =================================================================== */}
        {/* TAB 1: PENGADAAN & PO SUPPLIER                                      */}
        {/* =================================================================== */}
        {activeTab === 'po' && (
          <div className="space-y-6">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Total Purchase Order</span>
                  <span className="p-2 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-200/50">
                    <Truck className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2">
                  <SmoothNumber value={purchaseOrders.length} format="number" />
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">Dokumen PO Tercatat</div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Nilai Komitmen PO</span>
                  <span className="p-2 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-200/50">
                    <Coins className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-amber-700 mt-2">
                  <SmoothNumber value={purchaseOrders.reduce((sum, p) => sum + p.total_amount, 0)} format="idr" />
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">Estimasi Belanja Bahan</div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Menunggu Pengiriman</span>
                  <span className="p-2 rounded-xl bg-sky-500/10 text-sky-700 border border-sky-200/50">
                    <Clock className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-sky-700 mt-2">
                  <SmoothNumber value={purchaseOrders.filter((p) => p.status === 'SUBMITTED').length} format="number" />
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">PO Aktif di Supplier</div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Supplier Rekanan Terdaftar</span>
                  <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-700 border border-emerald-200/50">
                    <Building2 className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-emerald-700 mt-2">
                  <SmoothNumber value={suppliers.length} format="number" />
                </div>
                <div className="text-xs font-semibold text-slate-600 mt-1">Term of Payment Aktif</div>
              </div>
            </div>

            {/* PO Filter & Action Bar */}
            <div data-spot="toolbar" className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-800">Status PO:</span>
                {['ALL', 'SUBMITTED', 'RECEIVED', 'CANCELLED'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedPOStatus(st)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedPOStatus === st
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300'
                    }`}
                  >
                    {st === 'ALL' ? 'Semua' : st}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  setPoFormWarehouseId(warehouses[0]?.id || '')
                  setPoFormSupplierId(suppliers[0]?.id || '')
                  setPoFormExpectedDate(new Date(Date.now() + 86400000).toISOString().slice(0, 10))
                  setPoFormItems([])
                  handleAddPOItem()
                  setShowCreatePOModal(true)
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-md transition-transform active:scale-95 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Buat Purchase Order (PO)
              </button>
            </div>

            {/* PO List Table */}
            <div data-spot="table" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3.5 px-4">No. PO</th>
                      <th className="py-3.5 px-4">Supplier Rekanan</th>
                      <th className="py-3.5 px-4">Gudang Tujuan</th>
                      <th className="py-3.5 px-4">Tgl Pesan</th>
                      <th className="py-3.5 px-4">Est. Tiba</th>
                      <th className="py-3.5 px-4 text-right">Nilai Total</th>
                      <th className="py-3.5 px-4 text-center">Status</th>
                      <th className="py-3.5 px-4 text-center">Aksi Operasional</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {purchaseOrders.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-10 text-center text-slate-500 font-semibold bg-white">
                          Belum ada Purchase Order untuk kriteria filter ini.
                        </td>
                      </tr>
                    ) : (
                      purchaseOrders.map((po) => (
                        <tr key={po.id} className="bg-white odd:bg-white even:bg-slate-50/60 hover:bg-amber-50/40 border-b border-slate-100 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{po.po_number}</td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{po.supplier_name}</div>
                            <div className="text-[11px] text-slate-600 font-mono font-medium">{po.supplier_code}</div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-800 font-semibold">{po.warehouse_name}</td>
                          <td className="py-3.5 px-4 text-slate-700 font-medium">{po.order_date}</td>
                          <td className="py-3.5 px-4 text-slate-700 font-medium">{po.expected_delivery_date}</td>
                          <td className="py-3.5 px-4 text-right font-mono font-black text-slate-900">
                            {formatRupiah(po.total_amount)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                po.status === 'SUBMITTED'
                                  ? 'bg-amber-50 text-amber-800 border border-amber-300'
                                  : po.status === 'RECEIVED'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                                    : 'bg-rose-50 text-rose-800 border border-rose-300'
                              }`}
                            >
                              {po.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              {/* Primary Action: Terima di Timbangan (EMERALD) for SUBMITTED PO */}
                              {po.status === 'SUBMITTED' && (
                                <button
                                  type="button"
                                  onClick={() => void handleOpenGRForPO(po)}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 transition-transform active:scale-95 whitespace-nowrap cursor-pointer"
                                  title="Buka form timbangan penerimaan untuk PO ini"
                                >
                                  <Scale className="h-3.5 w-3.5" />
                                  Terima di Timbangan
                                </button>
                              )}

                              {po.status === 'PARTIALLY_RECEIVED' && (
                                <button
                                  type="button"
                                  onClick={() => void handleOpenGRForPO(po)}
                                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow-xs flex items-center gap-1.5 transition-transform active:scale-95 whitespace-nowrap cursor-pointer"
                                >
                                  <Scale className="h-3.5 w-3.5" />
                                  Terima Sisa PO
                                </button>
                              )}

                              {/* Detail Button */}
                              <button
                                type="button"
                                onClick={() => void handleViewPODetail(po.id)}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold rounded-lg text-xs flex items-center gap-1 whitespace-nowrap shadow-2xs cursor-pointer"
                                title="Lihat detail pesanan bahan PO"
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-600" />
                                Rincian PO
                              </button>

                              {/* Cancel Button */}
                              {po.status === 'SUBMITTED' &&
                                (confirmCancelPoId === po.id ? (
                                  <div className="inline-flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => void handleCancelPO(po.id)}
                                      className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-xs whitespace-nowrap cursor-pointer"
                                    >
                                      Ya, Batalkan
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmCancelPoId(null)}
                                      className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold rounded-lg text-xs whitespace-nowrap cursor-pointer"
                                    >
                                      Batal
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmCancelPoId(po.id)}
                                    className="px-2.5 py-1.5 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-lg text-xs flex items-center gap-1 whitespace-nowrap shadow-2xs cursor-pointer"
                                    title="Batalkan Purchase Order"
                                  >
                                    <XCircle className="h-3.5 w-3.5 text-rose-600" />
                                    Batalkan
                                  </button>
                                ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: PENERIMAAN BARANG DENGAN TIMBANGAN AKTUAL (RECEIVING)       */}
        {/* =================================================================== */}
        {activeTab === 'receiving' && (
          <div className="space-y-6">
            {/* KPI Summary Cards for Goods Receipts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Total Penerimaan (GR)</span>
                  <span className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <Scale className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
                  <SmoothNumber value={goodsReceipts.length} format="number" />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-semibold">Dokumen Timbangan Tersimpan</div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Total Tagihan Faktur</span>
                  <span className="p-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200">
                    <FileText className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-amber-900 mt-2 font-mono">
                  <SmoothNumber value={goodsReceipts.reduce((sum, g) => sum + (g.total_billed_amount || 0), 0)} format="idr" />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-semibold">Berdasarkan Faktur Supplier</div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Nilai Aktual Timbangan</span>
                  <span className="p-2 rounded-xl bg-teal-50 text-teal-800 border border-teal-200">
                    <Coins className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-emerald-800 mt-2 font-mono">
                  <SmoothNumber value={goodsReceipts.reduce((sum, g) => sum + (g.total_actual_amount || 0), 0)} format="idr" />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-semibold">HPP Riil Masuk Gudang</div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Selisih Efisiensi Berat</span>
                  <span className="p-2 rounded-xl bg-sky-50 text-sky-800 border border-sky-200">
                    <Sparkles className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-sky-900 mt-2 font-mono">
                  <SmoothNumber
                    value={Math.max(
                      0,
                      goodsReceipts.reduce(
                        (sum, g) => sum + ((g.total_billed_amount || 0) - (g.total_actual_amount || 0)),
                        0
                      )
                    )}
                    format="idr"
                  />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-semibold">Efisiensi Timbangan Masuk</div>
              </div>
            </div>

            {/* Header info */}
            <div data-spot="toolbar" className="bg-amber-50/90 border border-amber-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-start gap-3">
                <Scale className="h-6 w-6 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-black text-amber-950">
                    Penerimaan Barang dengan Timbangan Aktual (Actual Scale Weight)
                  </h3>
                  <p className="text-xs text-amber-900 mt-0.5 font-medium">
                    Mencatat berat aktual dari timbangan digital, memvalidasi selisih penyusutan faktur vs riil, serta
                    menghitung harga pokok bergerak (Moving Average Cost / MAC) secara otomatis.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setGrFormSupplierId(suppliers[0]?.id || '')
                  setGrFormWarehouseId(warehouses[0]?.id || '')
                  setGrFormPoId('')
                  setGrFormInvoiceNumber('')
                  setGrFormReceiverName('')
                  setGrFormNotes('')
                  setGrFormItems([])
                  handleAddGRItem()
                  setShowCreateGRModal(true)
                }}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition-transform active:scale-95 shrink-0"
              >
                <Scale className="h-4 w-4" />
                Catat Penerimaan Barang (GR) di Timbangan
              </button>
            </div>

            {/* Goods Receipts List */}
            <div data-spot="table" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70">
                <h3 className="text-sm font-black text-slate-900">Riwayat Surat Jalan & Penerimaan Barang</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">No. Penerimaan</th>
                      <th className="py-3 px-4">Supplier</th>
                      <th className="py-3 px-4">Gudang Penyimpanan</th>
                      <th className="py-3 px-4">Tgl Terima</th>
                      <th className="py-3 px-4">No. Faktur</th>
                      <th className="py-3 px-4 text-right">Tagihan Faktur</th>
                      <th className="py-3 px-4 text-right">Nilai Aktual Timbangan</th>
                      <th className="py-3 px-4">Penerima</th>
                      <th className="py-3 px-4 text-center">Aksi Operasional</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {goodsReceipts.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500 font-medium">
                          Belum ada catatan penerimaan barang.
                        </td>
                      </tr>
                    ) : (
                      goodsReceipts.map((gr) => (
                        <tr key={gr.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-amber-50/40 border-b border-slate-100 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{gr.receipt_number}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{gr.supplier_name}</td>
                          <td className="py-3 px-4 text-slate-800 font-medium">{gr.warehouse_name}</td>
                          <td className="py-3 px-4 text-slate-700 font-medium">{gr.received_date}</td>
                          <td className="py-3 px-4 font-mono font-medium text-slate-700">{gr.invoice_number || '-'}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {formatRupiah(gr.total_billed_amount)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-emerald-800">
                            {formatRupiah(gr.total_actual_amount)}
                          </td>
                          <td className="py-3 px-4 text-slate-800 font-medium">{gr.received_by_name || '-'}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => setSelectedGRDetail(gr)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer"
                              title="Lihat rincian timbangan penerimaan"
                            >
                              <Eye className="h-3.5 w-3.5 text-slate-600" />
                              Rincian Timbangan
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 3: GUDANG MULTI-LOKASI & MUTASI STOK                            */}
        {/* =================================================================== */}
        {activeTab === 'warehouse' && (
          <div className="space-y-6">
            {/* KPI Summary Cards for Warehouses & Stock Balances */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Total Gudang Mandiri</span>
                  <span className="p-2 rounded-xl bg-indigo-50 text-indigo-800 border border-indigo-200">
                    <Building2 className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
                  <SmoothNumber value={warehouses.length} format="number" />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-semibold">Gudang Steak &amp; Garden</div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Item Bahan Tersimpan</span>
                  <span className="p-2 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <Package className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
                  <SmoothNumber value={stockBalances.length} format="number" />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-semibold">Posisi Stok Aktif Gudang</div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Total Valuasi Aset Gudang</span>
                  <span className="p-2 rounded-xl bg-amber-50 text-amber-800 border border-amber-200">
                    <Coins className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-amber-900 mt-2 font-mono">
                  <SmoothNumber value={stockBalances.reduce((sum, b) => sum + (b.total_value || 0), 0)} format="idr" />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-semibold">Nilai Buku Persediaan</div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Peringatan Menipis</span>
                  <span className="p-2 rounded-xl bg-rose-50 text-rose-800 border border-rose-200">
                    <AlertTriangle className="size-4" />
                  </span>
                </div>
                <div className="text-2xl font-black text-rose-700 mt-2 font-mono">
                  <SmoothNumber
                    value={stockBalances.filter((b) => b.stock_status === 'LOW_STOCK' || b.stock_status === 'OUT_OF_STOCK').length}
                    format="number"
                  />
                </div>
                <div className="text-xs text-slate-600 mt-1 font-semibold">Di Bawah Batas Re-Order</div>
              </div>
            </div>

            {/* Decentralized Warehouses Header Banner */}
            <div data-spot="toolbar" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Gudang Penyimpanan Terdesentralisasi per Resto
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    Masing-masing resto (Tropical Steak House & Tropical Garden Resto) mengelola gudang dan persediaan secara mandiri tanpa gudang pusat.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewWhOutletId(selectedOutlet !== 'ALL' ? selectedOutlet : '01a16ca4-770a-7f46-9216-79dd3612a375')
                  setNewWhCode('')
                  setNewWhName('')
                  setNewWhType('DRY_STORE')
                  setNewWhPic('')
                  setNewWhAddress('')
                  setShowCreateWarehouseModal(true)
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-transform active:scale-95 shrink-0 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Tambah Gudang Baru
              </button>
            </div>

            {/* Top Multi-Outlet Warehouse Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {warehouses.map((wh) => {
                const outletBadge =
                  wh.outlet_name ||
                  (wh.outlet_id === '01a16ca4-770a-7f46-9216-79dd3612a375'
                    ? '🥩 Tropical Steak House'
                    : '🌿 Tropical Garden Resto')
                return (
                  <div
                    key={wh.id}
                    onClick={() => setSelectedWarehouseId(wh.id)}
                    data-spot="card"
                    data-active={selectedWarehouseId === wh.id}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedWarehouseId === wh.id
                        ? 'bg-amber-50/90 border-amber-500 shadow-md ring-2 ring-amber-400/20'
                        : 'bg-white border-slate-200/90 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-black text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                        {wh.code}
                      </span>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-300">
                          {outletBadge}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            wh.warehouse_type === 'CHILLER'
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : wh.warehouse_type === 'FREEZER'
                                ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          }`}
                        >
                          {wh.warehouse_type}
                        </span>
                      </div>
                    </div>
                    <h3 className="text-sm font-black text-slate-900 mt-2.5">{wh.name}</h3>
                    <div className="text-xs text-slate-600 mt-1 flex items-center gap-1.5 font-medium">
                      <MapPin className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{wh.address || 'Area Restoran Tropical'}</span>
                    </div>
                    {wh.pic_name && (
                      <div className="text-xs text-slate-700 mt-1 font-medium">
                        PIC: <span className="font-bold text-slate-900">{wh.pic_name}</span>
                      </div>
                    )}
                    <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-600 font-medium">Total Nilai Stok:</span>{' '}
                        <span className="font-black text-slate-900 font-mono">{formatRupiah(wh.total_stock_value)}</span>
                      </div>
                      <span className="text-slate-700 text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">{wh.item_count} Bahan</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Warehouse Stock Controls */}
            <div data-spot="toolbar" className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari bahan baku atau SKU..."
                  value={stockSearchQuery}
                  onChange={(e) => setStockSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 text-slate-900 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    const pool = allWarehouses.length > 0 ? allWarehouses : warehouses
                    const origin = (selectedWarehouseId && pool.some((w) => w.id === selectedWarehouseId))
                      ? selectedWarehouseId
                      : warehouses[0]?.id || pool[0]?.id || ''
                    const originObj = pool.find((w) => w.id === origin)
                    const destObj = pool.find((w) => w.outlet_id !== originObj?.outlet_id) || pool.find((w) => w.id !== origin) || pool[0]
                    setTrfOriginWhId(origin)
                    setTrfDestWhId(destObj?.id || '')
                    setTrfDriverName('')
                    setTrfNotes('')
                    setTrfItems([])
                    handleAddTransferItem()
                    setShowTransferModal(true)
                  }}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-transform active:scale-95 cursor-pointer"
                >
                  <ArrowRightLeft className="h-4 w-4" />
                  Kirim Mutasi Antar-Gudang
                </button>
              </div>
            </div>

            {/* Stock Balances Table */}
            <div data-spot="table" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Daftar Saldo Stok:{' '}
                    <span className="text-amber-800">
                      {warehouses.find((w) => w.id === selectedWarehouseId)?.name || 'Pilih Gudang'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5 font-medium">
                    Harga pokok dihitung dengan Moving Average Cost aktual secara presisi
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Kode Bahan</th>
                      <th className="py-3 px-4">Nama Bahan</th>
                      <th className="py-3 px-4">Kategori</th>
                      <th className="py-3 px-4">Tipe Simpan</th>
                      <th className="py-3 px-4 text-right">Saldo Stok</th>
                      <th className="py-3 px-4 text-right">Min. Alert</th>
                      <th className="py-3 px-4 text-right">Harga MAC (Rp)</th>
                      <th className="py-3 px-4 text-right">Total Valuasi</th>
                      <th className="py-3 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStockBalances.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-500 font-medium">
                          Tidak ada bahan baku di gudang ini atau pencarian tidak cocok.
                        </td>
                      </tr>
                    ) : (
                      filteredStockBalances.map((b) => (
                        <tr key={b.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-amber-50/40 border-b border-slate-100 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{b.item_code}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{b.item_name}</td>
                          <td className="py-3 px-4 text-slate-700 font-medium">{b.category_name}</td>
                          <td className="py-3 px-4">
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-bold">
                              {b.storage_type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                            {formatNumber(b.quantity)} {b.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-700">
                            {formatNumber(b.min_stock_alert)} {b.unit}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            {formatRupiah(b.cost_price)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-amber-900">
                            {formatRupiah(b.total_value)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                b.stock_status === 'OK'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : b.stock_status === 'LOW_STOCK'
                                    ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                            >
                              {b.stock_status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* In-Transit Transfers List */}
            {stockTransfers.length > 0 && (
              <div data-spot="table" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50/70">
                  <h3 className="text-sm font-black text-slate-900">Mutasi Barang Sedang Berjalan (In-Transit)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">No. Surat Jalan</th>
                        <th className="py-3 px-4">Gudang Asal</th>
                        <th className="py-3 px-4">Gudang Tujuan</th>
                        <th className="py-3 px-4">Tgl Kirim</th>
                        <th className="py-3 px-4">Pengemudi / Kurir</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Aksi Operasional</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stockTransfers.map((trf) => (
                        <tr key={trf.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-sky-50/40 border-b border-slate-100 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{trf.transfer_number}</td>
                          <td className="py-3 px-4 text-slate-800 font-medium">{trf.origin_warehouse_name}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{trf.destination_warehouse_name}</td>
                          <td className="py-3 px-4 text-slate-700 font-medium">{trf.transfer_date}</td>
                          <td className="py-3 px-4 text-slate-700 font-medium">{trf.dispatched_by_name || '-'}</td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                trf.status === 'IN_TRANSIT'
                                  ? 'bg-sky-50 text-sky-800 border border-sky-300'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {trf.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {trf.status === 'IN_TRANSIT' ? (
                              <button
                                type="button"
                                onClick={() => void handleConfirmReceiveTransfer(trf.id)}
                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md inline-flex items-center gap-1.5 animate-pulse transition-transform active:scale-95 cursor-pointer"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                Konfirmasi Terima Barang
                              </button>
                            ) : (
                              <span className="text-xs text-slate-600 font-medium">Telah Diterima</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 4: BLIND STOCK OPNAME (ANTI-MANIPULASI)                         */}
        {/* =================================================================== */}
        {activeTab === 'opname' && (
          <div className="space-y-6">
            {/* Philosophical explanation banner */}
            <div data-spot="toolbar" className="bg-indigo-50/90 border border-indigo-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-start gap-3">
                <ClipboardList className="h-6 w-6 text-indigo-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-black text-indigo-950">
                    Protokol Blind Stock Opname (Standar Audit Restoran Anti-Manipulasi)
                  </h3>
                  <p className="text-xs text-indigo-900 mt-0.5 font-medium">
                    Angka saldo sistem disembunyikan dari staf lapangan agar penghitungan fisik dilakukan murni dan jujur
                    tanpa mencocokkan angka. Perbedaan akan dianalisis oleh Manajer / Direksi saat sesi review.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={() => setIsBlindView(!isBlindView)}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer ${
                    isBlindView
                      ? 'bg-purple-700 hover:bg-purple-800 text-white ring-2 ring-purple-300'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300'
                  }`}
                >
                  {isBlindView ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {isBlindView
                    ? '🔒 Mode Blind Staff (Stok Disembunyikan) — Buka Mode Manajer'
                    : '👁️ Mode Manajer Terbuka (Lihat Selisih) — Kunci Blind Staff'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpnameFormWhId(warehouses[0]?.id || '')
                    setOpnameFormStaffName('')
                    setShowNewOpnameModal(true)
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-transform active:scale-95 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Mulai Sesi Stock Opname
                </button>
              </div>
            </div>

            {/* Active Opname Sheet or History */}
            {activeOpnameDetail ? (
              <div data-spot="table" className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-base font-black text-indigo-950">
                        {activeOpnameDetail.opname_number}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-50 text-amber-900 border border-amber-200">
                        {activeOpnameDetail.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 font-medium mt-1">
                      Gudang: <span className="font-bold text-slate-900">{activeOpnameDetail.warehouse_name}</span> • Petugas: <span className="font-bold text-slate-900">{activeOpnameDetail.conducted_by_name}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => void handleSaveOpnameCounts()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Simpan Hitungan Fisik
                    </button>
                    {!isBlindView &&
                      (confirmApproveOpnameId === activeOpnameDetail.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleApproveOpname(activeOpnameDetail.id)}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1 cursor-pointer"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Ya, Setujui Stok
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmApproveOpnameId(null)}
                            className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmApproveOpnameId(activeOpnameDetail.id)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 animate-pulse transition-transform active:scale-95 cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Setujui & Sesuaikan Stok Riil
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmApproveOpnameId(null)
                        setActiveOpnameDetail(null)
                      }}
                      className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold rounded-xl cursor-pointer"
                    >
                      Tutup Lembar
                    </button>
                  </div>
                </div>

                {/* Counting Grid */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">Nama Bahan Baku</th>
                        <th className="py-3 px-4 text-center">Satuan</th>
                        {!isBlindView && <th className="py-3 px-4 text-right">Saldo Sistem (Teoretis)</th>}
                        <th className="py-3 px-4 text-right w-44">Hitungan Fisik Nyata</th>
                        {!isBlindView && (
                          <>
                            <th className="py-3 px-4 text-right">Selisih Qty</th>
                            <th className="py-3 px-4 text-right">Nilai Selisih (Rp)</th>
                          </>
                        )}
                        <th className="py-3 px-4">Kategori Selisih & Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeOpnameDetail.items?.map((it) => {
                        const currentVal = opnameCounts[it.item_id]?.physical_qty ?? 0
                        const systemQty = it.system_theoretical_qty ?? 0
                        const diffQty = currentVal - systemQty
                        const unitCost = it.unit_cost ?? 0
                        const diffCost = diffQty * unitCost

                        return (
                          <tr key={it.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-indigo-50/40 border-b border-slate-100 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-black text-slate-900">{it.item_name}</div>
                              <div className="text-xs text-slate-600 font-mono font-bold">{it.item_code}</div>
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-slate-700">{it.unit}</td>
                            {!isBlindView && (
                              <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                                {formatNumber(systemQty)} {it.unit}
                              </td>
                            )}
                            <td className="py-3 px-4 text-right">
                              <NumberInput
                                min={0}
                                allowDecimal
                                value={currentVal}
                                placeholder="0"
                                aria-label={`Hitungan fisik ${it.item_name}`}
                                onChange={(val) => {
                                  updateOpnameCount(it.item_id, { physical_qty: val })
                                }}
                                className="w-32 px-3 py-1.5 text-right font-mono font-black bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </td>
                            {!isBlindView && (
                              <>
                                <td
                                  className={`py-3 px-4 text-right font-mono font-black ${
                                    diffQty < 0 ? 'text-rose-700' : diffQty > 0 ? 'text-emerald-700' : 'text-slate-600'
                                  }`}
                                >
                                  {diffQty > 0 ? `+${formatNumber(diffQty)}` : formatNumber(diffQty)} {it.unit}
                                </td>
                                <td
                                  className={`py-3 px-4 text-right font-mono font-black ${
                                    diffCost < 0
                                      ? 'text-rose-700'
                                      : diffCost > 0
                                        ? 'text-emerald-700'
                                        : 'text-slate-600'
                                  }`}
                                >
                                  {formatRupiah(diffCost)}
                                </td>
                              </>
                            )}
                            <td className="py-3 px-4">
                              <select
                                value={opnameCounts[it.item_id]?.variance_category || 'PORTIONING_VARIANCE'}
                                onChange={(e) => {
                                  updateOpnameCount(it.item_id, { variance_category: e.target.value })
                                }}
                                className="px-2 py-1 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded text-xs text-slate-900 font-semibold"
                              >
                                <option value="PORTIONING_VARIANCE">Selisih Porsi / Trim</option>
                                <option value="UNRECORDED_SPOILAGE">Basi Belum Tercatat</option>
                                <option value="THEFT_SHRINKAGE">Penyusutan / Hilang</option>
                                <option value="COUNTING_MISTAKE">Koreksi Salah Hitung</option>
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div data-spot="table" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 bg-slate-50/70">
                  <h3 className="text-sm font-black text-slate-900">Daftar Sesi Stock Opname</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">No. Opname</th>
                        <th className="py-3 px-4">Gudang</th>
                        <th className="py-3 px-4">Tgl Pelaksanaan</th>
                        <th className="py-3 px-4">Petugas Lapangan</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Aksi Operasional</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stockOpnames.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500 font-medium">
                            Belum ada sesi stock opname yang dibuat.
                          </td>
                        </tr>
                      ) : (
                        stockOpnames.map((so) => (
                          <tr key={so.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-indigo-50/40 border-b border-slate-100 transition-colors">
                            <td className="py-3 px-4 font-mono font-black text-indigo-950">{so.opname_number}</td>
                            <td className="py-3 px-4 font-bold text-slate-900">{so.warehouse_name}</td>
                            <td className="py-3 px-4 text-slate-700 font-medium">{so.opname_date}</td>
                            <td className="py-3 px-4 text-slate-800 font-semibold">{so.conducted_by_name || '-'}</td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                  so.status === 'APPROVED'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : 'bg-amber-50 text-amber-800 border-amber-300'
                                }`}
                              >
                                {so.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                type="button"
                                onClick={() => void handleOpenOpnameSheet(so)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm inline-flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer ${
                                  so.status === 'DRAFT'
                                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300'
                                }`}
                              >
                                {so.status === 'DRAFT' ? <ClipboardList className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5 text-emerald-700" />}
                                {so.status === 'DRAFT' ? 'Isi / Lanjutkan Hitungan' : 'Lihat Hasil Audit Final'}
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 5: WASTE & MONITORING HPA REALTIME                              */}
        {/* =================================================================== */}
        {activeTab === 'hpa' && (
          <div className="space-y-8">
            {/* Philosophical explanation banner for HPA */}
            <div data-spot="hero" className="bg-gradient-to-r from-amber-600 to-orange-700 rounded-2xl p-6 text-white shadow-md">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-sm">
                    <Sparkles className="h-3.5 w-3.5" />
                    Solusi Pertanyaan Arsitektur Restoran Presisi
                  </div>
                  <h2 className="text-xl font-bold">Kalkulasi HPA Menu: Dynamic BOM vs Manual Target Override</h2>
                  <p className="text-xs text-amber-100 max-w-3xl leading-relaxed">
                    Sistem mendukung dua mode sekaligus: <strong>Mode Dynamic BOM</strong> menghitung HPA secara presisi
                    realtime berdasarkan harga rata-rata bergerak (MAC) bahan baku dan hasil uji potong daging (yield
                    test). Jika manajemen ingin mematok target HPA tertentu, cukup aktifkan{' '}
                    <strong>Manual Override</strong>. Sistem otomatis memberi peringatan merah jika harga bahan naik
                    melebihi target batas aman!
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setWasteWhId(warehouses[0]?.id || '')
                      setWasteCategory('SPOILAGE_EXPIRED')
                      setWasteItems([])
                      handleAddWasteItem()
                      setShowWasteModal(true)
                    }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-lg transition-transform active:scale-95 shrink-0"
                  >
                    <Flame className="h-4 w-4" />
                    + Catat Waste / Spoilage
                  </button>
                </div>
              </div>
            </div>

            {/* Menu HPA Monitoring Table */}
            <div data-spot="table" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Daftar Menu & Kontrol HPA (Harga Pokok Akhir / COGS)
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    Klik tombol mode untuk beralih antara hitungan otomatis BOM dan target manual manajemen
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">Nama Menu & Outlet</th>
                      <th className="py-3 px-4 text-right">Harga Jual</th>
                      <th className="py-3 px-4 text-right">HPA Dinamis BOM (Riil)</th>
                      <th className="py-3 px-4 text-right">Target Manual Manajemen</th>
                      <th className="py-3 px-4 text-center">Mode Aktif</th>
                      <th className="py-3 px-4 text-right">HPA Efektif</th>
                      <th className="py-3 px-4 text-right">Margin Kotor</th>
                      <th className="py-3 px-4 text-center">Food Cost %</th>
                      <th className="py-3 px-4 text-center">Peringatan Fluktuasi</th>
                      <th className="py-3 px-4 text-center">Aksi Operasional</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {menuHpaItems.map((item) => (
                      <tr key={item.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-amber-50/40 border-b border-slate-100 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-black text-slate-900">{item.name}</div>
                          <div className="text-xs text-slate-600 font-medium">
                            {item.outlet_name} • {item.category_name}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                          {formatRupiah(item.selling_price)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-sky-900 bg-sky-50/80">
                          {formatRupiah(item.dynamic_bom_hpa)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-800">
                          {item.manual_hpa > 0 ? formatRupiah(item.manual_hpa) : '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => void handleToggleHpaMode(item)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm inline-flex items-center gap-1.5 cursor-pointer ${
                              item.hpa_calculation_mode === 'DYNAMIC_BOM'
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-amber-600 hover:bg-amber-700 text-white'
                            }`}
                            title="Klik untuk beralih antara Dynamic BOM dan Manual Target"
                          >
                            {item.hpa_calculation_mode === 'DYNAMIC_BOM' ? '⚙️ Dynamic BOM' : '🔒 Manual Override'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                          {formatRupiah(item.effective_hpa)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-emerald-800">
                          {formatRupiah(item.gross_margin)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono border ${
                              item.food_cost_pct > 50
                                ? 'bg-rose-50 text-rose-800 border-rose-200'
                                : item.food_cost_pct > 40
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {formatNumber(item.food_cost_pct, 1)}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          {item.is_variance_alert ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-300 animate-pulse">
                              <AlertTriangle className="h-3 w-3" />
                              HPA Naik (+{formatNumber(item.variance_pct, 1)}%)
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-800 font-bold flex items-center justify-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Aman
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingHpaItem(item)
                              setEditManualHpaVal(item.manual_hpa || item.dynamic_bom_hpa)
                            }}
                            className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Sliders className="h-3.5 w-3.5 text-amber-700" />
                            Edit Target
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Waste & Spoilage Log Section */}
            <div data-spot="table" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Buku Catatan Pembuangan / Kerusakan Bahan (Waste & Spoilage Log)
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    Mencatat kerugian akibat basi, salah masak, atau jatuh untuk mencegah kebocoran HPA
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-600 font-medium">Total Kerugian Waste:</div>
                  <div className="text-base font-black text-rose-700 font-mono">
                    {formatRupiah(wasteRecords.reduce((sum, w) => sum + w.total_cost, 0))}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">No. Waste</th>
                      <th className="py-3 px-4">Gudang</th>
                      <th className="py-3 px-4">Tgl Kejadian</th>
                      <th className="py-3 px-4">Kategori Alasan</th>
                      <th className="py-3 px-4 text-right">Biaya Kerugian (Rp)</th>
                      <th className="py-3 px-4">Dicatat Oleh</th>
                      <th className="py-3 px-4">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {wasteRecords.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 font-medium">
                          Belum ada catatan pembuangan bahan (waste) tercatat.
                        </td>
                      </tr>
                    ) : (
                      wasteRecords.map((w) => (
                        <tr key={w.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-rose-50/40 border-b border-slate-100 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{w.waste_number}</td>
                          <td className="py-3 px-4 text-slate-800 font-medium">{w.warehouse_name}</td>
                          <td className="py-3 px-4 text-slate-700 font-medium">{w.waste_date}</td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col gap-0.5">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold w-fit border ${
                                  w.category === 'SPOILAGE_EXPIRED'
                                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                                    : w.category === 'COOKING_MISTAKE'
                                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                                      : w.category === 'STAFF_MEAL'
                                        ? 'bg-blue-50 text-blue-800 border-blue-200'
                                        : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                }`}
                              >
                                {w.category === 'STAFF_MEAL' ? '🍽️ Staff Meal' : w.category}
                              </span>
                              {w.recipient_division && (
                                <span className="text-xs text-slate-600 font-medium">
                                  Divisi: {w.recipient_division}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-rose-700">
                            {formatRupiah(w.total_cost)}
                          </td>
                          <td className="py-3 px-4 text-slate-800 font-medium">{w.recorded_by_name || '-'}</td>
                          <td className="py-3 px-4 text-slate-700 font-medium italic">{w.notes || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 6: MUTASI ANTAR-RESTO & CABANG (PEER-TO-PEER INTER-BRANCH)      */}
        {/* =================================================================== */}
        {activeTab === 'transfer' && (
          <div className="space-y-6">
            {/* Top Cockpit Banner */}
            <div data-spot="toolbar" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="p-3 bg-indigo-50 text-indigo-700 rounded-2xl border border-indigo-100">
                  <ArrowRightLeft className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-900">
                      Mutasi Logistik Antar-Resto & Cabang Mandiri
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                      Peer-to-Peer Tanpa CK
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium mt-1 max-w-2xl">
                    Sistem pemindahan stok antar-gudang dan antar-cabang restoran Tropical FnB. Dilengkapi penerbitan Surat Jalan otomatis, pemotongan stok asal saat dispatch, dan audit susut berat (transit loss) di timbangan penerima.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const pool = allWarehouses.length > 0 ? allWarehouses : warehouses
                    const origin = warehouses[0]?.id || pool[0]?.id || ''
                    const originObj = pool.find((w) => w.id === origin)
                    const destObj = pool.find((w) => w.outlet_id !== originObj?.outlet_id) || pool.find((w) => w.id !== origin) || pool[0]
                    setTrfOriginWhId(origin)
                    setTrfDestWhId(destObj?.id || '')
                    setTrfDate(new Date().toISOString().slice(0, 10))
                    setTrfDriverName('')
                    setTrfNotes('')
                    setTrfItems([])
                    handleAddTransferItem()
                    setShowTransferModal(true)
                  }}
                  className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-transform active:scale-95 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Buat Permintaan Mutasi
                </button>
              </div>
            </div>

            {/* 4 KPI Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center gap-3">
                <div className="p-3 bg-slate-100 text-slate-800 rounded-2xl border border-slate-200">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-700">Total Pengajuan Mutasi</div>
                  <div className="text-2xl font-black font-mono text-slate-900 mt-0.5">
                    <SmoothNumber value={stockTransfers.length} format="number" />
                  </div>
                </div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center gap-3">
                <div className="p-3 bg-sky-50 text-sky-800 rounded-2xl border border-sky-200">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-700">Dalam Perjalanan (In-Transit)</div>
                  <div className="text-2xl font-black font-mono text-sky-900 mt-0.5">
                    <SmoothNumber value={stockTransfers.filter((t) => t.status === 'IN_TRANSIT').length} format="number" />
                  </div>
                </div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center gap-3">
                <div className="p-3 bg-amber-50 text-amber-800 rounded-2xl border border-amber-200">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-700">Menunggu Kirim (Pending)</div>
                  <div className="text-2xl font-black font-mono text-amber-900 mt-0.5">
                    <SmoothNumber value={stockTransfers.filter((t) => t.status === 'PENDING').length} format="number" />
                  </div>
                </div>
              </div>

              <div data-spot="stat" className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md transition-all flex items-center gap-3">
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-2xl border border-emerald-200">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-700">Selesai Diterima</div>
                  <div className="text-2xl font-black font-mono text-emerald-800 mt-0.5">
                    <SmoothNumber value={stockTransfers.filter((t) => t.status === 'RECEIVED').length} format="number" />
                  </div>
                </div>
              </div>
            </div>

            {/* Filters Bar */}
            <div data-spot="toolbar" className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
              <div className="relative w-full md:w-80">
                <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari No. Transfer, Surat Jalan, Outlet, atau Kurir..."
                  value={trfSearchQuery}
                  onChange={(e) => setTrfSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 text-slate-900 font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                <select
                  value={trfStatusFilter}
                  onChange={(e) => setTrfStatusFilter(e.target.value)}
                  className="text-xs p-1.5 border border-slate-300 bg-slate-50 hover:bg-white focus:bg-white rounded-lg text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ALL">Semua Status Mutasi</option>
                  <option value="PENDING">Menunggu Kirim (PENDING)</option>
                  <option value="IN_TRANSIT">Dalam Pengiriman (IN_TRANSIT)</option>
                  <option value="RECEIVED">Telah Diterima (RECEIVED)</option>
                  <option value="CANCELLED">Dibatalkan (CANCELLED)</option>
                </select>

                <select
                  value={trfTypeFilter}
                  onChange={(e) => setTrfTypeFilter(e.target.value)}
                  className="text-xs p-1.5 border border-slate-300 bg-slate-50 hover:bg-white focus:bg-white rounded-lg text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="ALL">Semua Tipe Mutasi</option>
                  <option value="INTER_BRANCH">Antar-Resto / Cabang (INTER_BRANCH)</option>
                  <option value="INTRA_BRANCH">Internal Gudang Outlet (INTRA_BRANCH)</option>
                </select>

                <button
                  type="button"
                  onClick={() => void loadTabData()}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg border border-slate-300 transition-colors cursor-pointer"
                  title="Refresh Data Mutasi"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Transfers Data Table */}
            <div data-spot="table" className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900">Daftar Mutasi Stok & Surat Jalan</h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    Menampilkan rute asal-tujuan, kurir, jumlah muatan, serta selisih timbangan susut transit
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100/90 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4">No. Mutasi & Surat Jalan</th>
                      <th className="py-3 px-4">Tipe Mutasi</th>
                      <th className="py-3 px-4">Rute Pengiriman (Asal ➔ Tujuan)</th>
                      <th className="py-3 px-4">Tgl & Pengemudi</th>
                      <th className="py-3 px-4 text-center">Item & Susut</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Aksi Operasional</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStockTransfers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 font-medium">
                          Tidak ada data mutasi stok yang sesuai dengan filter.
                        </td>
                      </tr>
                    ) : (
                      filteredStockTransfers.map((trf) => (
                        <tr key={trf.id} className="odd:bg-white even:bg-slate-50/60 hover:bg-indigo-50/40 border-b border-slate-100 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-mono font-black text-slate-900">{trf.transfer_number}</div>
                            <div className="text-xs font-mono font-medium text-slate-600 mt-0.5">
                              {trf.waybill_number ? `SJ: ${trf.waybill_number}` : '-'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                                trf.transfer_type === 'INTER_BRANCH'
                                  ? 'bg-purple-50 text-purple-900 border-purple-200'
                                  : 'bg-slate-100 text-slate-800 border border-slate-300'
                              }`}
                            >
                              {trf.transfer_type === 'INTER_BRANCH' ? '🌐 Antar-Cabang' : '🏢 Internal'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 text-slate-900 font-medium">
                              <span className="font-black text-indigo-950">{trf.origin_warehouse_name}</span>
                              <ArrowRightLeft className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                              <span className="font-black text-emerald-950">{trf.destination_warehouse_name}</span>
                            </div>
                            <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1 font-medium">
                              <span>{trf.origin_outlet_name || 'Resto Asal'}</span>
                              <span>➔</span>
                              <span>{trf.destination_outlet_name || 'Resto Tujuan'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-800 font-medium">
                            <div className="font-bold text-slate-900">{trf.transfer_date}</div>
                            <div className="text-xs text-slate-600">{trf.dispatched_by_name || 'Kurir belum diset'}</div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="font-mono font-black text-slate-900">
                              {trf.total_items ?? trf.items?.length ?? 0} Item
                            </span>
                            {trf.total_variance_qty !== undefined && trf.total_variance_qty > 0 && (
                              <div className="text-[10px] text-rose-800 font-bold bg-rose-50 px-1.5 py-0.5 rounded mt-0.5 inline-block border border-rose-300">
                                ⚠️ Susut: {formatNumber(trf.total_variance_qty)}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                trf.status === 'PENDING'
                                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                                  : trf.status === 'IN_TRANSIT'
                                    ? 'bg-sky-50 text-sky-800 border-sky-300 animate-pulse'
                                    : trf.status === 'RECEIVED'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                              }`}
                            >
                              {trf.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={() => void handleOpenDetail(trf)}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer"
                                title="Lihat Surat Jalan & Rincian Muatan"
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-600" />
                                Surat Jalan
                              </button>

                              {trf.status === 'PENDING' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDispatch(trf)}
                                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1 shadow-sm transition-transform active:scale-95 cursor-pointer"
                                    title="Kirim muatan dan potong stok asal"
                                  >
                                    <Truck className="h-3.5 w-3.5" />
                                    Kirim
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCancel(trf)}
                                    className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer"
                                    title="Batalkan permintaan mutasi"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}

                              {trf.status === 'IN_TRANSIT' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void handleOpenReceive(trf)}
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs inline-flex items-center gap-1 shadow-sm animate-pulse transition-transform active:scale-95 cursor-pointer"
                                    title="Timbang dan terima barang di gudang tujuan"
                                  >
                                    <Scale className="h-3.5 w-3.5" />
                                    Terima & Timbang
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenCancel(trf)}
                                    className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 font-bold rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer"
                                    title="Batalkan dan rollback stok ke gudang asal"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                </>
                              )}

                              {trf.status === 'RECEIVED' && (
                                <span className="text-xs text-emerald-800 font-bold flex items-center gap-1">
                                  <CheckCircle className="h-3.5 w-3.5" /> Selesai
                                </span>
                              )}

                              {trf.status === 'CANCELLED' && (
                                <span className="text-xs text-rose-700 font-bold">Dibatalkan</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: BUAT PURCHASE ORDER (PO)                                     */}
      {/* ===================================================================== */}
      {showCreatePOModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Buat Purchase Order (PO) Baru</h3>
              <button
                type="button"
                onClick={() => setShowCreatePOModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePOSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pilih Supplier Rekanan</label>
                  <select
                    value={poFormSupplierId}
                    onChange={(e) => setPoFormSupplierId(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (TOP {s.term_of_payment_days} Hari)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Gudang Tujuan Penerimaan</label>
                  <select
                    value={poFormWarehouseId}
                    onChange={(e) => setPoFormWarehouseId(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} - {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Estimasi Tanggal Tiba</label>
                  <input
                    type="date"
                    value={poFormExpectedDate}
                    onChange={(e) => setPoFormExpectedDate(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Catatan Pesanan (Optional)</label>
                  <input
                    type="text"
                    placeholder="Contoh: Daging suhu chiller < 4C"
                    value={poFormNotes}
                    onChange={(e) => setPoFormNotes(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">Item Bahan yang Dipesan</span>
                  <button
                    type="button"
                    onClick={handleAddPOItem}
                    className="text-xs text-amber-700 font-semibold hover:text-amber-800 flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Tambah Baris
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto p-1">
                  {poFormItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <select
                        value={item.item_id}
                        onChange={(e) => {
                          const chosen = inventoryItems.find((ii) => ii.id === e.target.value)
                          updatePOItem(idx, {
                            item_id: e.target.value,
                            unit: chosen?.unit || 'kg',
                            unit_price: chosen?.cost_price || 0,
                          })
                        }}
                        className="flex-1 text-xs p-1.5 border border-slate-300 rounded bg-white"
                      >
                        {inventoryItems.map((ii) => (
                          <option key={ii.id} value={ii.id}>
                            {ii.name} ({ii.unit})
                          </option>
                        ))}
                      </select>

                      <div className="w-24">
                        <NumberInput
                          min={0}
                          allowDecimal
                          placeholder="Qty"
                          value={item.ordered_qty}
                          aria-label="Jumlah pesanan bahan"
                          onChange={(val) => {
                            updatePOItem(idx, { ordered_qty: val })
                          }}
                          className="w-full text-xs p-1.5 border border-slate-300 rounded text-right font-mono"
                        />
                      </div>

                      <div className="w-28">
                        <NumberInput
                          min={0}
                          allowDecimal={false}
                          placeholder="Harga"
                          value={item.unit_price}
                          aria-label="Harga beli satuan"
                          onChange={(val) => {
                            updatePOItem(idx, { unit_price: val })
                          }}
                          className="w-full text-xs p-1.5 border border-slate-300 rounded text-right font-mono"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setPoFormItems(poFormItems.filter((_, i) => i !== idx))
                        }}
                        className="text-rose-500 hover:text-rose-700 p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 text-right text-xs">
                  <span className="text-slate-500">Estimasi Total PO:</span>{' '}
                  <span className="font-bold font-mono text-slate-900 text-sm">
                    {formatRupiah(poFormItems.reduce((acc, it) => acc + (it.ordered_qty || 0) * (it.unit_price || 0), 0))}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreatePOModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm"
                >
                  Kirim Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: CATAT PENERIMAAN DENGAN TIMBANGAN AKTUAL                      */}
      {/* ===================================================================== */}
      {showCreateGRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Penerimaan Barang & Timbangan Digital</h3>
                <p className="text-xs text-slate-500">
                  Masukkan berat faktur vs timbangan aktual untuk menghitung Moving Average Cost
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateGRModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGRSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Supplier Rekanan</label>
                  <select
                    value={grFormSupplierId}
                    onChange={(e) => setGrFormSupplierId(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Gudang Penerima</label>
                  <select
                    value={grFormWarehouseId}
                    onChange={(e) => setGrFormWarehouseId(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} - {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">No. Surat Jalan / Faktur</label>
                  <input
                    type="text"
                    placeholder="Contoh: SJ-ABU-9841"
                    value={grFormInvoiceNumber}
                    onChange={(e) => setGrFormInvoiceNumber(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Rujukan PO (Opsional)</label>
                  <select
                    value={grFormPoId}
                    onChange={(e) => setGrFormPoId(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono"
                  >
                    <option value="">Penerimaan Langsung (Tanpa PO)</option>
                    {purchaseOrders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.po_number} ({p.supplier_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Petugas Penerima</label>
                  <input
                    type="text"
                    placeholder="Contoh: Rian Pratama (SPV)"
                    value={grFormReceiverName}
                    onChange={(e) => setGrFormReceiverName(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Catatan Penerimaan / Fisik</label>
                  <input
                    type="text"
                    placeholder="Contoh: Suhu chiller aman < 4C"
                    value={grFormNotes}
                    onChange={(e) => setGrFormNotes(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Items List with Scale Inputs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">Item Bahan & Hasil Timbangan Digital</span>
                  <button
                    type="button"
                    onClick={handleAddGRItem}
                    className="text-xs text-amber-700 font-semibold hover:text-amber-800 flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Tambah Bahan
                  </button>
                </div>

                <div className="space-y-3">
                  {grFormItems.map((item, idx) => {
                    const netActual = Math.max(0, item.actual_weight_qty - (item.tare_weight || 0))
                    const varianceQty = netActual - item.billed_qty
                    const variancePct = item.billed_qty > 0 ? (varianceQty / item.billed_qty) * 100 : 0

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <select
                            value={item.item_id}
                            onChange={(e) => {
                              const chosen = inventoryItems.find((ii) => ii.id === e.target.value)
                              updateGRItem(idx, {
                                item_id: e.target.value,
                                unit: chosen?.unit || 'kg',
                                unit_cost: chosen?.cost_price || 0,
                              })
                            }}
                            className="font-bold text-slate-900 bg-white border border-slate-300 rounded p-1 w-64"
                          >
                            {inventoryItems.map((ii) => (
                              <option key={ii.id} value={ii.id}>
                                {ii.name} ({ii.unit})
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() => setGrFormItems(grFormItems.filter((_, i) => i !== idx))}
                            className="text-rose-500 hover:text-rose-700"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                          <div>
                            <label className="text-[10px] text-slate-500">Berat Faktur ({item.unit})</label>
                            <NumberInput
                              min={0}
                              allowDecimal
                              value={item.billed_qty}
                              placeholder="0"
                              aria-label="Berat Faktur"
                              onChange={(val) => {
                                updateGRItem(idx, { billed_qty: val })
                              }}
                              className="w-full p-1.5 border border-slate-300 rounded font-mono text-right"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500">Timbangan Aktual ({item.unit})</label>
                            <NumberInput
                              min={0}
                              allowDecimal
                              value={item.actual_weight_qty}
                              placeholder="0"
                              aria-label="Timbangan Aktual"
                              onChange={(val) => {
                                updateGRItem(idx, { actual_weight_qty: val })
                              }}
                              className="w-full p-1.5 border border-slate-300 rounded font-mono text-right font-bold text-slate-900"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500">Tara Keranjang ({item.unit})</label>
                            <NumberInput
                              min={0}
                              allowDecimal
                              value={item.tare_weight}
                              placeholder="0"
                              aria-label="Tara Keranjang"
                              onChange={(val) => {
                                updateGRItem(idx, { tare_weight: val })
                              }}
                              className="w-full p-1.5 border border-slate-300 rounded font-mono text-right text-slate-500"
                            />
                          </div>

                          <div>
                            <label className="text-[10px] text-slate-500">Harga Beli Satuan (Rp)</label>
                            <NumberInput
                              min={0}
                              allowDecimal={false}
                              value={item.unit_cost}
                              placeholder="0"
                              aria-label="Harga Beli Satuan"
                              onChange={(val) => {
                                updateGRItem(idx, { unit_cost: val })
                              }}
                              className="w-full p-1.5 border border-slate-300 rounded font-mono text-right"
                            />
                          </div>
                        </div>

                        {/* Live Variance Calculation Badge */}
                        <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-200">
                          <div>
                            <span className="text-[11px] text-slate-500">Netto Timbangan:</span>{' '}
                            <span className="font-mono font-bold text-slate-800">
                              {formatNumber(netActual)} {item.unit}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-slate-500">Selisih:</span>
                            <span
                              className={`font-mono font-bold text-[11px] px-2 py-0.5 rounded ${
                                variancePct < -3
                                  ? 'bg-rose-100 text-rose-800 animate-pulse'
                                  : variancePct < -1.5
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {varianceQty > 0 ? `+${formatNumber(varianceQty)}` : formatNumber(varianceQty)}{' '}
                              {item.unit} ({formatNumber(variancePct, 1)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateGRModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm"
                >
                  Simpan Penerimaan & Hitung MAC
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: KIRIM MUTASI ANTAR-GUDANG (TRANSFER)                         */}
      {/* ===================================================================== */}
      {showTransferModal && (() => {
        const pool = allWarehouses.length > 0 ? allWarehouses : warehouses
        const originWh = pool.find((w) => w.id === trfOriginWhId)
        const destWh = pool.find((w) => w.id === trfDestWhId)
        const isInterBranch = originWh && destWh && originWh.outlet_id !== destWh.outlet_id

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                    <ArrowRightLeft className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Pengajuan Mutasi Stok Gudang</h3>
                    <p className="text-xs text-slate-500">Pindahkan stok antar-resto atau internal cabang</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {originWh && destWh && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                    isInterBranch
                      ? 'bg-purple-50 border-purple-200 text-purple-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <div>
                    <span className="font-bold">
                      {isInterBranch
                        ? '🌐 Mutasi Antar-Resto / Cabang (INTER_BRANCH)'
                        : '🏢 Mutasi Internal Resto (INTRA_BRANCH)'}
                    </span>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {originWh.name} ➔ {destWh.name}
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                      isInterBranch ? 'bg-purple-200 text-purple-900' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {isInterBranch ? 'Lintas Resto' : 'Internal'}
                  </span>
                </div>
              )}

              <form onSubmit={handleCreateTransferSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Gudang Asal (Pengirim)</label>
                    <select
                      value={trfOriginWhId}
                      onChange={(e) => setTrfOriginWhId(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      {pool.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} - {w.name} ({w.outlet_name || 'Resto'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Gudang Tujuan (Penerima)</label>
                    <select
                      value={trfDestWhId}
                      onChange={(e) => setTrfDestWhId(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      {pool.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.code} - {w.name} ({w.outlet_name || 'Resto'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Tanggal Rencana Kirim</label>
                    <input
                      type="date"
                      value={trfDate || new Date().toISOString().slice(0, 10)}
                      onChange={(e) => setTrfDate(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Pengemudi / Runner / Ekspedisi</label>
                    <input
                      type="text"
                      placeholder="Contoh: Pak Joko (Kurir Manding)"
                      value={trfDriverName}
                      onChange={(e) => setTrfDriverName(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 mb-1">Catatan Permintaan Mutasi</label>
                    <input
                      type="text"
                      placeholder="Contoh: Persiapan stok marinasi akhir pekan"
                      value={trfNotes}
                      onChange={(e) => setTrfNotes(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Items List */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800">Daftar Bahan Baku yang Dimutasi</span>
                    <button
                      type="button"
                      onClick={handleAddTransferItem}
                      className="text-xs text-indigo-700 font-semibold hover:text-indigo-800 flex items-center gap-1"
                    >
                      <Plus className="h-3.5 w-3.5" /> Tambah Bahan
                    </button>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto p-1">
                    {trfItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                        <select
                          value={item.item_id}
                          onChange={(e) => {
                            const chosen = inventoryItems.find((ii) => ii.id === e.target.value)
                            updateTransferItem(idx, {
                              item_id: e.target.value,
                              unit: chosen?.unit || 'kg',
                            })
                          }}
                          className="flex-1 text-xs p-1.5 border border-slate-300 rounded-lg bg-white"
                        >
                          {inventoryItems.map((ii) => (
                            <option key={ii.id} value={ii.id}>
                              {ii.name} ({ii.unit})
                            </option>
                          ))}
                        </select>

                        <div className="w-24">
                          <NumberInput
                            min={0}
                            allowDecimal
                            placeholder="Qty"
                            value={item.requested_qty}
                            aria-label="Jumlah bahan mutasi"
                            onChange={(val) => {
                              updateTransferItem(idx, { requested_qty: val, dispatched_qty: val })
                            }}
                            className="w-full text-xs p-1.5 border border-slate-300 rounded-lg text-right font-mono"
                          />
                        </div>

                        <span className="text-xs text-slate-500 font-medium w-8">{item.unit}</span>

                        <button
                          type="button"
                          onClick={() => setTrfItems(trfItems.filter((_, i) => i !== idx))}
                          className="text-rose-500 hover:text-rose-700 p-1"
                          title="Hapus baris"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => setShowTransferModal(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-transform active:scale-95"
                  >
                    Ajukan Permintaan Mutasi
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      })()}

      {/* ===================================================================== */}
      {/* MODAL 4: MULAI SESI STOCK OPNAME                                      */}
      {/* ===================================================================== */}
      {showNewOpnameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Mulai Sesi Blind Stock Opname</h3>
              <button
                type="button"
                onClick={() => setShowNewOpnameModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOpnameSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gudang yang Dihitung</label>
                <select
                  value={opnameFormWhId}
                  onChange={(e) => setOpnameFormWhId(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.code} - {w.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Petugas Penghitung</label>
                <input
                  type="text"
                  placeholder="Contoh: Rian & Siti (Tim Gudang)"
                  value={opnameFormStaffName}
                  onChange={(e) => setOpnameFormStaffName(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Catatan Sesi</label>
                <input
                  type="text"
                  placeholder="Contoh: Audit stok mingguan akhir shift"
                  value={opnameFormNotes}
                  onChange={(e) => setOpnameFormNotes(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowNewOpnameModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm"
                >
                  Buka Lembar Hitung
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: CATAT WASTE / SPOILAGE                                       */}
      {/* ===================================================================== */}
      {showWasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Catat Kerusakan / Waste Bahan</h3>
              <button
                type="button"
                onClick={() => setShowWasteModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWasteSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Lokasi Gudang / Dapur</label>
                  <select
                    value={wasteWhId}
                    onChange={(e) => setWasteWhId(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} - {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kategori Alasan Waste / Konsumsi</label>
                  <select
                    value={wasteCategory}
                    onChange={(e) => setWasteCategory(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="SPOILAGE_EXPIRED">Kadaluwarsa / Basi (Expired)</option>
                    <option value="DROPPED_DAMAGED">Jatuh / Rusak Kemasan</option>
                    <option value="COOKING_MISTAKE">Salah Masak / Gosong di Kitchen</option>
                    <option value="STAFF_MEAL">Jatah Makan Karyawan / Sisa Olahan Trimming</option>
                    <option value="CUSTOM_REASON">+ Ketik Alasan Sendiri (Custom Reason)</option>
                  </select>
                </div>

                {wasteCategory === 'CUSTOM_REASON' && (
                  <div>
                    <label className="block text-xs font-medium text-amber-900 mb-1">
                      Ketik Alasan Khusus Pengeluaran Bahan <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Contoh: Sisa trimming daging dibuat makan siang, Tester tamu VIP..."
                      value={wasteCustomReason}
                      onChange={(e) => setWasteCustomReason(e.target.value)}
                      className="w-full text-xs p-2 border border-amber-300 rounded-lg bg-amber-50/50 text-slate-900 font-medium"
                      required
                    />
                  </div>
                )}

                {(wasteCategory === 'STAFF_MEAL' || wasteCategory === 'CUSTOM_REASON') && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Divisi / Bagian Penerima (Opsional)
                    </label>
                    <input
                      list="division-options"
                      type="text"
                      placeholder="Pilih atau ketik divisi..."
                      value={wasteRecipientDivision}
                      onChange={(e) => setWasteRecipientDivision(e.target.value)}
                      className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                    />
                    <datalist id="division-options">
                      <option value="Tim Kitchen (Dapur)" />
                      <option value="Tim Service & Waiter" />
                      <option value="Tim Barista & Minuman" />
                      <option value="Dishwasher & Stewarding" />
                      <option value="Manajemen Outlet" />
                    </datalist>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Petugas Pencatat</label>
                  <input
                    type="text"
                    placeholder="Contoh: Chef Agus"
                    value={wasteStaffName}
                    onChange={(e) => setWasteStaffName(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Keterangan / Detail Tambahan</label>
                  <input
                    type="text"
                    placeholder="Contoh: Sisa potongan 2 porsi dibuat soto staf..."
                    value={wasteNotes}
                    onChange={(e) => setWasteNotes(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Items List */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">Bahan yang Dibuang</span>
                  <button
                    type="button"
                    onClick={handleAddWasteItem}
                    className="text-xs text-rose-700 font-semibold hover:text-rose-800 flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Tambah Bahan
                  </button>
                </div>

                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {wasteItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      <select
                        value={item.item_id}
                        onChange={(e) => {
                          const chosen = inventoryItems.find((ii) => ii.id === e.target.value)
                          updateWasteItem(idx, {
                            item_id: e.target.value,
                            unit: chosen?.unit || 'kg',
                            unit_cost: chosen?.cost_price || 0,
                          })
                        }}
                        className="flex-1 text-xs p-1.5 border border-slate-300 rounded bg-white"
                      >
                        {inventoryItems.map((ii) => (
                          <option key={ii.id} value={ii.id}>
                            {ii.name} ({ii.unit})
                          </option>
                        ))}
                      </select>

                      <NumberInput
                        min={0}
                        allowDecimal
                        placeholder="Qty"
                        value={item.quantity}
                        aria-label="Jumlah bahan terbuang"
                        onChange={(val) => {
                          updateWasteItem(idx, { quantity: val })
                        }}
                        className="w-20 text-xs p-1.5 border border-slate-300 rounded text-right font-mono"
                      />

                      <div className="text-[11px] font-mono text-slate-600 w-24 text-right">
                        {formatRupiah((item.quantity || 0) * (item.unit_cost || 0))}
                      </div>

                      <button
                        type="button"
                        onClick={() => setWasteItems(wasteItems.filter((_, i) => i !== idx))}
                        className="text-rose-500 hover:text-rose-700 p-1"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowWasteModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm"
                >
                  Simpan Catatan Waste
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 6: EDIT TARGET HPA MANUAL                                       */}
      {/* ===================================================================== */}
      {editingHpaItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Patokan Modal (HPA) Manual</h3>
                <p className="text-xs text-slate-500">{editingHpaItem.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingHpaItem(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs text-sky-900">
                <div className="font-semibold">Modal Resep Otomatis Saat Ini:</div>
                <div className="text-base font-bold font-mono mt-0.5">{formatRupiah(editingHpaItem.dynamic_bom_hpa)}</div>
                <div className="text-[10px] text-sky-700 mt-1">Dihitung otomatis dari rata-rata harga beli bahan terbaru</div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Patokan Modal (HPA) Manual Manajemen (Rp)
                </label>
                <NumberInput
                  min={0}
                  allowDecimal={false}
                  value={editManualHpaVal}
                  placeholder="0"
                  aria-label="Patokan Modal HPA Manual"
                  onChange={setEditManualHpaVal}
                  className="w-full text-base font-mono font-bold p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Menyimpan angka ini akan memakai patokan manual sampai Anda mengaktifkan kembali hitungan resep otomatis.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditingHpaItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                onClick={() => void handleSaveManualHpa()}
                className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-sm"
              >
                Simpan Target
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 7: RINCIAN PURCHASE ORDER                                       */}
      {/* ===================================================================== */}
      {selectedPODetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Rincian Purchase Order: <span className="font-mono text-amber-700">{selectedPODetail.po_number}</span>
                  </h3>
                  <p className="text-xs text-slate-500">Dokumen pemesanan bahan ke supplier rekanan</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPODetail(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-300 text-xs">
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Supplier:</span>
                <span className="font-black text-slate-900">{selectedPODetail.supplier_name}</span>
              </div>
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Gudang Penerima:</span>
                <span className="font-black text-slate-900">{selectedPODetail.warehouse_name}</span>
              </div>
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Tgl Pemesanan:</span>
                <span className="font-semibold text-slate-800">{selectedPODetail.order_date}</span>
              </div>
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Status:</span>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                    selectedPODetail.status === 'SUBMITTED'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : selectedPODetail.status === 'RECEIVED'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {selectedPODetail.status}
                </span>
              </div>
            </div>

            {selectedPODetail.notes && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-950 font-medium">
                <strong>Catatan PO:</strong> {selectedPODetail.notes}
              </div>
            )}

            <div>
              <h4 className="text-xs font-black text-slate-900 mb-2">Daftar Bahan yang Dipesan</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px]">
                      <th className="py-2.5 px-3">Bahan Baku</th>
                      <th className="py-2.5 px-3 text-right">Qty Pesan</th>
                      <th className="py-2.5 px-3 text-right">Harga Satuan</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                      <th className="py-2.5 px-3 text-right">Telah Diterima</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedPODetail.items && selectedPODetail.items.length > 0 ? (
                      selectedPODetail.items.map((it) => (
                        <tr key={it.id} className="odd:bg-white even:bg-slate-50/60">
                          <td className="py-2.5 px-3">
                            <div className="font-black text-slate-900">{it.item_name}</div>
                            <div className="text-xs text-slate-600 font-mono font-bold">{it.item_code}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                            {formatNumber(it.ordered_qty)} {it.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                            {formatRupiah(it.unit_price)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900">
                            {formatRupiah(it.subtotal)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">
                            {formatNumber(it.received_qty)} {it.unit}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-500 font-medium">
                          Tidak ada baris item dalam PO ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <div>
                <span className="text-xs text-slate-700 font-bold block">Total Nilai Pesanan:</span>
                <span className="text-lg font-black font-mono text-amber-900">
                  {formatRupiah(selectedPODetail.total_amount)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedPODetail.status === 'SUBMITTED' && (
                  <button
                    type="button"
                    onClick={() => void handleOpenGRForPO(selectedPODetail)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center gap-1.5 transition-transform active:scale-95"
                  >
                    <Scale className="h-4 w-4" />
                    Terima di Timbangan Sekarang
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedPODetail(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 8: RINCIAN PENERIMAAN BARANG (GOODS RECEIPT DETAIL)             */}
      {/* ===================================================================== */}
      {selectedGRDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 text-emerald-800 rounded-xl">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Rincian Penerimaan: <span className="font-mono text-emerald-700">{selectedGRDetail.receipt_number}</span>
                  </h3>
                  <p className="text-xs text-slate-500">Hasil timbangan riil dan perbandingan faktur</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGRDetail(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-300">
                <div>
                  <span className="text-slate-700 block text-[11px] font-bold">Supplier:</span>
                  <span className="font-black text-slate-900">{selectedGRDetail.supplier_name}</span>
                </div>
                <div>
                  <span className="text-slate-700 block text-[11px] font-bold">Gudang Penerima:</span>
                  <span className="font-black text-slate-900">{selectedGRDetail.warehouse_name}</span>
                </div>
                <div>
                  <span className="text-slate-700 block text-[11px] font-bold">No. Faktur / Surat Jalan:</span>
                  <span className="font-mono font-bold text-slate-800">{selectedGRDetail.invoice_number || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-700 block text-[11px] font-bold">Tgl Terima:</span>
                  <span className="font-semibold text-slate-800">{selectedGRDetail.received_date}</span>
                </div>
                <div>
                  <span className="text-slate-700 block text-[11px] font-bold">Petugas Penerima:</span>
                  <span className="font-bold text-slate-900">{selectedGRDetail.received_by_name || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-700 block text-[11px] font-bold">Rujukan PO:</span>
                  <span className="font-mono text-amber-900 font-bold">{selectedGRDetail.po_number || 'Tanpa PO'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-300">
                  <span className="text-xs font-bold text-slate-700 block">Total Tagihan Faktur:</span>
                  <span className="text-base font-black font-mono text-slate-900">
                    {formatRupiah(selectedGRDetail.total_billed_amount)}
                  </span>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-300">
                  <span className="text-xs font-bold text-emerald-800 block">Nilai Riil Timbangan (MAC):</span>
                  <span className="text-base font-black font-mono text-emerald-800">
                    {formatRupiah(selectedGRDetail.total_actual_amount)}
                  </span>
                </div>
              </div>

              {selectedGRDetail.notes && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-300 text-slate-800 font-medium">
                  <strong>Catatan Pemeriksaan:</strong> {selectedGRDetail.notes}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedGRDetail(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===================================================================== */}
      {/* MODAL 9: TAMBAH GUDANG TERDESENTRALISASI PER RESTO                   */}
      {/* ===================================================================== */}
      {showCreateWarehouseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Tambah Gudang Cabang Baru</h3>
                  <p className="text-xs text-slate-500">Daftarkan gudang mandiri untuk restoran</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateWarehouseModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateWarehouseSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Restoran Pemilik Gudang</label>
                {isGlobalAllOutlets ? (
                  <select
                    value={newWhOutletId}
                    onChange={(e) => setNewWhOutletId(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="01a16ca4-770a-7f46-9216-79dd3612a375">🥩 Tropical Steak House (TSH-01)</option>
                    <option value="01a16ca4-770c-7143-80f4-2c8ece46d467">🌿 Tropical Garden Resto (TGR-01)</option>
                  </select>
                ) : (
                  <div className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 font-medium flex items-center justify-between">
                    <span>{activeOutlet?.name ?? 'Cabang Resto'}</span>
                    <span className="font-mono text-[10px] text-slate-400">[🔒 {activeOutlet?.code ?? 'RESTO'}]</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Kode Gudang</label>
                  <input
                    type="text"
                    placeholder="Misal: WH-TSH-03"
                    value={newWhCode}
                    onChange={(e) => setNewWhCode(e.target.value.toUpperCase())}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono uppercase focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Tipe Gudang</label>
                  <select
                    value={newWhType}
                    onChange={(e) => setNewWhType(e.target.value as WarehouseType)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="DRY_STORE">Gudang Kering (Dry Store)</option>
                    <option value="CHILLER">Chiller Pendingin (0-4°C)</option>
                    <option value="FREEZER">Freezer Daging Beku (-18°C)</option>
                    <option value="KITCHEN_STOCK">Stok Dapur Operasional</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Nama Gudang</label>
                <input
                  type="text"
                  placeholder="Misal: Gudang Marinasi & Bumbu Basah"
                  value={newWhName}
                  onChange={(e) => setNewWhName(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Penanggung Jawab (PIC)</label>
                <input
                  type="text"
                  placeholder="Misal: Chef Juna / Supervisor Dapur"
                  value={newWhPic}
                  onChange={(e) => setNewWhPic(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Alamat / Lokasi Spesifik</label>
                <input
                  type="text"
                  placeholder="Misal: Area Dapur Barat Lantai 1"
                  value={newWhAddress}
                  onChange={(e) => setNewWhAddress(e.target.value)}
                  className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateWarehouseModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-transform active:scale-95"
                >
                  Simpan Gudang Cabang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 10: DISPATCH STOCK TRANSFER (KIRIM DARI GUDANG ASAL)           */}
      {/* ===================================================================== */}
      {showDispatchModal && dispatchTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
                  <Truck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Konfirmasi Pengiriman (Dispatch)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">{dispatchTarget.transfer_number}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDispatchModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Gudang Asal (Potong Stok):</span>
                <span className="font-bold text-slate-900">{dispatchTarget.origin_warehouse_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Gudang Tujuan:</span>
                <span className="font-bold text-slate-900">{dispatchTarget.destination_warehouse_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Rute Resto:</span>
                <span className="font-semibold text-indigo-700">
                  {dispatchTarget.origin_outlet_name || 'Resto Asal'} ➔ {dispatchTarget.destination_outlet_name || 'Resto Tujuan'}
                </span>
              </div>
            </div>

            <form onSubmit={handleDispatchSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">No. Surat Jalan (Waybill)</label>
                  <input
                    type="text"
                    value={dispatchWaybill}
                    onChange={(e) => setDispatchWaybill(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-indigo-500"
                    placeholder="Misal: SJ-TRF-001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Nama Pengemudi / Ekspedisi</label>
                  <input
                    type="text"
                    value={dispatchDriver}
                    onChange={(e) => setDispatchDriver(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    placeholder="Misal: Joko (Kurir Operasional)"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">Konfirmasi Jumlah Muatan yang Berangkat</label>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <th className="py-2 px-3">Bahan Baku</th>
                        <th className="py-2 px-3 text-right">Qty Diminta</th>
                        <th className="py-2 px-3 text-right w-28">Qty Dikirim</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dispatchTarget.items?.map((it) => (
                        <tr key={it.id}>
                          <td className="py-2 px-3">
                            <span className="font-bold text-slate-900">{it.item_name}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">
                            {formatNumber(it.requested_qty)} {it.unit}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <NumberInput
                              min={0}
                              allowDecimal
                              value={dispatchItemQtys[it.item_id] ?? it.requested_qty}
                              aria-label={`Jumlah kirim ${it.item_name}`}
                              onChange={(val) => {
                                setDispatchItemQtys((prev) => ({ ...prev, [it.item_id]: val }))
                              }}
                              className="w-20 text-xs p-1 border border-slate-300 rounded text-right font-mono font-bold"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Perhatian:</strong> Menekan tombol kirim muatan akan langsung memotong stok di gudang asal ({dispatchTarget.origin_warehouse_name}) dan mencatat riwayat barang keluar.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md transition-transform active:scale-95"
                >
                  Kirim Muatan & Potong Stok Asal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 11: TERIMA & AUDIT TIMBANGAN MUTASI STOK                        */}
      {/* ===================================================================== */}
      {showReceiveModal && receiveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl">
                  <Scale className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Penerimaan & Audit Timbangan Mutasi
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">{receiveTarget.waybill_number || receiveTarget.transfer_number}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReceiveModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-slate-400">Gudang Penerima:</span>{' '}
                <span className="font-bold text-slate-900">{receiveTarget.destination_warehouse_name}</span>
              </div>
              <div>
                <span className="text-slate-400">Pengemudi:</span>{' '}
                <span className="font-medium text-slate-800">{receiveTarget.dispatched_by_name || '-'}</span>
              </div>
            </div>

            <form onSubmit={handleReceiveSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Petugas Penerima / Kepala Dapur</label>
                  <input
                    type="text"
                    value={receiveReceiverName}
                    onChange={(e) => setReceiveReceiverName(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    placeholder="Misal: Chef Dimas"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Catatan Penerimaan Fisik</label>
                  <input
                    type="text"
                    value={receiveNotes}
                    onChange={(e) => setReceiveNotes(e.target.value)}
                    className="w-full text-xs p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                    placeholder="Misal: Diterima dalam kondisi beku baik"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Hasil Timbangan Aktual di Gudang Tujuan
                </label>
                <div className="space-y-3">
                  {receiveRowItems.map((r, idx) => {
                    const diff = Math.max(0, r.dispatched_qty - (Number(r.received_qty) || 0))
                    return (
                      <div key={r.item_id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{r.item_name}</span>
                          <span className="text-slate-500">
                            Dikirim Asal: <strong className="font-mono text-slate-800">{formatNumber(r.dispatched_qty)} {r.unit}</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 items-center">
                          <div>
                            <label className="text-[10px] text-slate-500 block mb-0.5">Timbangan Riil Tiba ({r.unit})</label>
                            <NumberInput
                              min={0}
                              allowDecimal
                              value={r.received_qty}
                              aria-label={`Timbangan tiba ${r.item_name}`}
                              onChange={(val) => {
                                setReceiveRowItems((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, received_qty: val } : item))
                                )
                              }}
                              className="w-full text-xs p-1.5 border border-slate-300 rounded-lg font-mono font-bold text-right"
                            />
                          </div>

                          <div className="sm:col-span-2">
                            <label className="text-[10px] text-slate-500 block mb-0.5">Alasan Susut / Catatan</label>
                            {diff > 0 ? (
                              <select
                                value={r.variance_reason}
                                onChange={(e) => {
                                  const reason = e.target.value
                                  setReceiveRowItems((prev) =>
                                    prev.map((item, i) => (i === idx ? { ...item, variance_reason: reason } : item))
                                  )
                                }}
                                className="w-full text-xs p-1.5 border border-rose-300 bg-rose-50 rounded-lg text-rose-900 font-medium"
                              >
                                <option value="Susut timbangan kemasan es mencair saat transit">
                                  Susut timbangan kemasan es mencair saat transit
                                </option>
                                <option value="Penyusutan penguapan suhu udara perjalanan">
                                  Penyusutan penguapan suhu udara perjalanan
                                </option>
                                <option value="Bocoran / tumpah kemasan dalam perjalanan">
                                  Bocoran / tumpah kemasan dalam perjalanan
                                </option>
                                <option value="Salah hitung fisik saat pengiriman dari gudang asal">
                                  Salah hitung fisik saat pengiriman dari gudang asal
                                </option>
                                <option value="Barang rusak / afkir dalam perjalanan">
                                  Barang rusak / afkir dalam perjalanan
                                </option>
                              </select>
                            ) : (
                              <div className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-200 font-semibold flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Berat utuh / tidak ada susut
                              </div>
                            )}
                          </div>
                        </div>

                        {diff > 0 && (
                          <div className="text-[11px] font-mono text-rose-700 font-bold bg-white p-2 rounded-lg border border-rose-200 flex items-center justify-between">
                            <span>Susut Transit Terdeteksi:</span>
                            <span>-{formatNumber(diff)} {r.unit} ({formatNumber((diff / r.dispatched_qty) * 100, 1)}%)</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowReceiveModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md transition-transform active:scale-95"
                >
                  Konfirmasi Penerimaan & Tambah Stok
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 12: BATALKAN MUTASI STOK                                        */}
      {/* ===================================================================== */}
      {showCancelModal && cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-50 text-rose-700 rounded-xl">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Batalkan Mutasi Stok</h3>
                  <p className="text-xs text-slate-500 font-mono">{cancelTarget.transfer_number}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {cancelTarget.status === 'IN_TRANSIT' ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 leading-relaxed">
                  <strong>⚠️ Perhatian Otomatisasi Stok:</strong> Mutasi ini sedang berstatus <code>IN_TRANSIT</code>. Membatalkan mutasi akan secara otomatis <strong>mengembalikan saldo stok</strong> ke gudang asal ({cancelTarget.origin_warehouse_name}) melalui mutasi pengembalian.
                </div>
              ) : (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700">
                  Mutasi ini masih berstatus <code>PENDING</code>. Pembatalan tidak mempengaruhi saldo fisik karena belum dilakukan pemotongan stok.
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Alasan Pembatalan (Wajib)</label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Contoh: Kesalahan input cabang penerima, atau mobil pengantar mogok"
                  className="w-full text-xs p-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleCancelTransferSubmit}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md transition-transform active:scale-95"
              >
                Ya, Batalkan Mutasi Ini
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 13: RINCIAN SURAT JALAN & BUKTI SERAH TERIMA                    */}
      {/* ===================================================================== */}
      {showDetailModal && detailTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    SURAT JALAN & BUKTI SERAH TERIMA MUTASI
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs font-bold text-indigo-700">
                      {detailTarget.waybill_number || detailTarget.transfer_number}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        detailTarget.transfer_type === 'INTER_BRANCH'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {detailTarget.transfer_type === 'INTER_BRANCH' ? 'Antar-Resto / Cabang' : 'Internal Resto'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-300 text-xs">
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Gudang & Resto Asal:</span>
                <span className="font-black text-slate-900">{detailTarget.origin_warehouse_name}</span>
                <div className="text-xs text-slate-600 font-medium">{detailTarget.origin_outlet_name || 'Resto Asal'}</div>
              </div>
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Gudang & Resto Tujuan:</span>
                <span className="font-black text-slate-900">{detailTarget.destination_warehouse_name}</span>
                <div className="text-xs text-slate-600 font-medium">{detailTarget.destination_outlet_name || 'Resto Tujuan'}</div>
              </div>
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Pengemudi / Kurir:</span>
                <span className="font-bold text-slate-900">{detailTarget.dispatched_by_name || '-'}</span>
              </div>
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Status Saat Ini:</span>
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${
                    detailTarget.status === 'PENDING'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : detailTarget.status === 'IN_TRANSIT'
                        ? 'bg-sky-50 text-sky-800 border-sky-300'
                        : detailTarget.status === 'RECEIVED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {detailTarget.status}
                </span>
              </div>
            </div>

            {/* Lifecycle Timestamps */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-300 text-xs">
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Diberangkatkan:</span>
                <span className="font-mono text-slate-900 font-semibold">{detailTarget.dispatched_at || 'Belum dispatch'}</span>
              </div>
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Diterima di Tujuan:</span>
                <span className="font-mono text-slate-900 font-semibold">{detailTarget.received_at || 'Belum diterima'}</span>
              </div>
              <div>
                <span className="text-slate-700 block text-[11px] font-bold">Dibatalkan:</span>
                <span className="font-mono text-rose-700 font-semibold">{detailTarget.cancelled_at || '-'}</span>
              </div>
            </div>

            {detailTarget.notes && (
              <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-950 font-medium">
                <strong>Catatan Permintaan:</strong> {detailTarget.notes}
              </div>
            )}

            {detailTarget.cancellation_reason && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-950 font-medium">
                <strong>Alasan Pembatalan:</strong> {detailTarget.cancellation_reason}
              </div>
            )}

            <div>
              <h4 className="text-xs font-black text-slate-900 mb-2">Rincian Muatan Barang</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px]">
                      <th className="py-2.5 px-3">Bahan Baku</th>
                      <th className="py-2.5 px-3 text-right">Qty Diminta</th>
                      <th className="py-2.5 px-3 text-right">Qty Dikirim</th>
                      <th className="py-2.5 px-3 text-right">Qty Diterima</th>
                      <th className="py-2.5 px-3 text-center">Susut Transit</th>
                      <th className="py-2.5 px-3">Keterangan / Alasan Susut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {detailTarget.items && detailTarget.items.length > 0 ? (
                      detailTarget.items.map((it) => (
                        <tr key={it.id} className="odd:bg-white even:bg-slate-50/60">
                          <td className="py-2.5 px-3">
                            <div className="font-black text-slate-900">{it.item_name}</div>
                            <div className="text-xs text-slate-600 font-mono font-bold">{it.item_code}</div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-700">
                            {formatNumber(it.requested_qty)} {it.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {formatNumber(it.dispatched_qty)} {it.unit}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-800">
                            {formatNumber(it.received_qty)} {it.unit}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {it.variance_qty !== undefined && it.variance_qty > 0 ? (
                              <span className="text-rose-800 font-mono font-bold text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-300">
                                -{formatNumber(it.variance_qty)} {it.unit}
                              </span>
                            ) : (
                              <span className="text-slate-600 font-mono font-medium">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-700 font-medium">
                            {it.variance_reason || it.notes || '-'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-4 text-center text-slate-500 font-medium">
                          Tidak ada baris barang dalam mutasi ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Simulated Signatures */}
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-200 text-center text-xs">
              <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                <span className="text-slate-700 text-xs font-bold block">Petugas Gudang Asal</span>
                <div className="h-10"></div>
                <span className="font-black text-slate-900">
                  {detailTarget.origin_warehouse_name?.slice(0, 15)} (Staf)
                </span>
              </div>
              <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                <span className="text-slate-700 text-xs font-bold block">Pengemudi / Kurir</span>
                <div className="h-10"></div>
                <span className="font-black text-slate-900">
                  {detailTarget.dispatched_by_name || 'Kurir Ekspedisi'}
                </span>
              </div>
              <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/50">
                <span className="text-slate-700 text-xs font-bold block">Penerima Gudang Tujuan</span>
                <div className="h-10"></div>
                <span className="font-black text-slate-900">
                  {detailTarget.received_by_name || 'Kepala Dapur Tujuan'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
              >
                <FileSpreadsheet className="h-4 w-4 text-slate-600" />
                Cetak Dokumen
              </button>

              <button
                type="button"
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl"
              >
                Tutup Rincian
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
