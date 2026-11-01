import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  ArrowLeft,
  Receipt,
  User,
  CreditCard,
  Banknote,
  QrCode,
  AlertCircle,
  Printer,
  ChefHat,
  UtensilsCrossed,
  Building2,
  Flame,
  Lock,
  Trees,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth/auth-store';
import { PageTransition } from '@/shared/components/transitions/PageTransition';
import { Button } from '@/shared/ui/Button';
import { NumberInput } from '@/shared/ui/NumberInput';
import { SmoothNumber } from '@/shared/ui/SmoothNumber';
import { formatIDR, calculateTaxPB1 } from '@/shared/utils/currency';
import {
  POSTerminalIcon,
  DiningTableIcon,
  SplitBillIcon,
  QRISBadgeIcon,
  CashDrawerIcon,
} from '@/shared/components/icons/EnterpriseIcons';
import { fetchMenuItems } from '@/features/menu/menu-api';
import type { MenuItemWithHPA } from '@/features/menu/types';
import {
  fetchTables,
  createOrder,
  addOrderItems,
  processOrderPayment,
  fetchOrderDetail,
  fetchCurrentShift,
  openShift,
  closeShift,
  fetchShiftXReport,
  fetchShiftZReport,
  createCashMovement,
} from './pos-api';
import type {
  Order,
  PaymentFlow,
  PaymentMethod,
  OpenShiftPayload,
  CloseShiftPayload,
  CashMovementPayload,
  ShiftReport,
  CartItem,
} from './types';
import { SplitBillModal } from './SplitBillModal';
import { ReceiptModal } from './ReceiptModal';
import { autoPrintReceiptOnce } from './thermal-printer';
import { ShiftStatusWidget } from './ShiftStatusWidget';
import { ShiftOpenModal } from './ShiftOpenModal';
import { CashMovementModal } from './CashMovementModal';
import { ShiftCloseModal } from './ShiftCloseModal';
import { ShiftReportModal } from './ShiftReportModal';
import { SteakModifierModal, type SteakModifierResult } from './SteakModifierModal';
import { ItemNoteModal } from './ItemNoteModal';

export const CashierPOSPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { activeOutletId, accessibleOutlets, isGlobalAllOutlets, setActiveOutletId } = useAuthStore();

  const posOutlet = accessibleOutlets.find(o => o.id === activeOutletId);
  const isSteakPOS = posOutlet?.code === 'TSH-01' || (!posOutlet && activeOutletId.includes('TSH'));
  const isGardenPOS = posOutlet?.code === 'TGR-01' || (!posOutlet && activeOutletId.includes('TGR'));

  const preselectedTableId = searchParams.get('table_id') || '';
  const preselectedOrderId = searchParams.get('order_id') || '';

  // Auto-default to physical outlet if entering POS Kasir with "ALL" (Consolidated Group)
  useEffect(() => {
    if (activeOutletId === 'ALL' && accessibleOutlets.length > 0) {
      const preferred = accessibleOutlets.find(o => o.code === 'TSH-01') || accessibleOutlets[0];
      if (preferred) {
        setActiveOutletId(preferred.id);
      }
    }
  }, [activeOutletId, accessibleOutlets, setActiveOutletId]);

  // Data queries (POS strictly fetches PUBLISHED menus only; R&D DRAFT menus are hidden)
  const { data: menuItems = [], isLoading: isMenuLoading } = useQuery({
    queryKey: ['menu-items', activeOutletId, 'pos-only'],
    queryFn: () => fetchMenuItems(activeOutletId || undefined, { posOnly: true }),
  });

  const { data: tables = [], isLoading: isTablesLoading } = useQuery({
    queryKey: ['dining-tables', activeOutletId],
    queryFn: () => fetchTables(activeOutletId || undefined),
  });

  const isLoading = isMenuLoading || isTablesLoading;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Order & Flow states
  const [paymentFlow, setPaymentFlow] = useState<PaymentFlow>('PAY_AFTER');
  const [selectedTableId, setSelectedTableId] = useState<string>(preselectedTableId);
  const [customerName, setCustomerName] = useState('Tamu Dine-In');
  const [paxCount, setPaxCount] = useState(2);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeExistingOrder, setActiveExistingOrder] = useState<Order | null>(null);

  // Payment Tender Modal
  const [isTenderModalOpen, setIsTenderModalOpen] = useState(false);
  const [tenderMethod, setTenderMethod] = useState<PaymentMethod>('CASH');
  const [cashTendered, setCashTendered] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Split Bill Modal
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);

  // Auto-Print Receipt Bill Setting (stored in localStorage, default true)
  const [autoPrintReceipt, setAutoPrintReceipt] = useState<boolean>(() => {
    return localStorage.getItem('auto_print_receipt_bill') !== 'false';
  });

  const toggleAutoPrintReceipt = () => {
    setAutoPrintReceipt(prev => {
      const next = !prev;
      localStorage.setItem('auto_print_receipt_bill', String(next));
      return next;
    });
  };

  // Receipt Print Modal
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptTargetOrder, setReceiptTargetOrder] = useState<Order | null>(null);
  const [isReceiptProForma, setIsReceiptProForma] = useState(false);

  const handleOpenReceipt = (order: Order, proForma = false) => {
    setReceiptTargetOrder(order);
    setIsReceiptProForma(proForma);
    setIsReceiptModalOpen(true);
  };

  // Shift Management State & React Query
  const [isShiftOpenModalOpen, setIsShiftOpenModalOpen] = useState(false);
  const [isShiftCloseModalOpen, setIsShiftCloseModalOpen] = useState(false);
  const [isCashMovementModalOpen, setIsCashMovementModalOpen] = useState(false);
  const [isShiftReportModalOpen, setIsShiftReportModalOpen] = useState(false);
  const [activeShiftReport, setActiveShiftReport] = useState<ShiftReport | null>(null);

  const {
    data: shiftData,
    isLoading: isLoadingShift,
    refetch: refetchShift,
  } = useQuery({
    queryKey: ['cashier-current-shift', activeOutletId],
    queryFn: () => fetchCurrentShift(activeOutletId),
    enabled: Boolean(activeOutletId && activeOutletId !== 'ALL'),
    refetchInterval: 15000,
  });

  const currentShift = shiftData?.shift ?? null;
  const isShiftOpen = shiftData?.is_open ?? false;

  const handleOpenShiftSubmit = async (payload: OpenShiftPayload) => {
    await openShift(payload);
    if (payload.outlet_id && payload.outlet_id !== activeOutletId) {
      setActiveOutletId(payload.outlet_id);
    }
    await refetchShift();
  };

  const handleCloseShiftSubmit = async (payload: CloseShiftPayload) => {
    if (!currentShift) return;
    const closed = await closeShift(currentShift.id, payload);
    const zReport = await fetchShiftZReport(closed.id);
    setActiveShiftReport(zReport);
    setIsShiftReportModalOpen(true);
    await refetchShift();
  };

  const handleCashMovementSubmit = async (payload: CashMovementPayload) => {
    if (!currentShift) return;
    await createCashMovement(currentShift.id, payload);
    await refetchShift();
  };

  const handleOpenXReport = async () => {
    if (!currentShift) return;
    try {
      const xReport = await fetchShiftXReport(currentShift.id, activeOutletId);
      setActiveShiftReport(xReport);
      setIsShiftReportModalOpen(true);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat Audit X-Report');
    }
  };

  // Load existing active order if preselectedOrderId or preselectedTableId is provided
  useEffect(() => {
    if (preselectedOrderId) {
      fetchOrderDetail(preselectedOrderId)
        .then(existing => {
          setActiveExistingOrder(existing);
          setCustomerName(existing.customer_name);
          setPaxCount(existing.pax_count);
          setPaymentFlow(existing.payment_flow);
          if (existing.table_id) {
            setSelectedTableId(existing.table_id);
          }
        })
        .catch(console.error);
      return;
    }

    if (!preselectedTableId || tables.length === 0) return;
    const matched = tables.find(t => t.id === preselectedTableId);
    if (matched && matched.active_order_id) {
      fetchOrderDetail(matched.active_order_id)
        .then(existing => {
          setActiveExistingOrder(existing);
          setCustomerName(existing.customer_name);
          setPaxCount(existing.pax_count);
          setPaymentFlow(existing.payment_flow);
        })
        .catch(console.error);
    }
  }, [preselectedTableId, preselectedOrderId, tables]);

  // When table changes, check if it has active order
  const handleTableChange = async (tblId: string) => {
    setSelectedTableId(tblId);
    const matched = tables.find(t => t.id === tblId);
    if (matched && matched.active_order_id) {
      try {
        const ord = await fetchOrderDetail(matched.active_order_id);
        setActiveExistingOrder(ord);
        setCustomerName(ord.customer_name);
        setPaxCount(ord.pax_count);
        setPaymentFlow(ord.payment_flow);
      } catch (err) {
        console.error('Failed to load existing table order:', err);
      }
    } else {
      setActiveExistingOrder(null);
    }
  };

  // Steak Modifiers Modal state
  const [modifierSteakItem, setModifierSteakItem] = useState<MenuItemWithHPA | null>(null);
  const [editingCartItemKey, setEditingCartItemKey] = useState<string | null>(null);

  // General Item Note Modal state (for beverages, traditional foods, snacks, etc.)
  const [editingCartItemForNote, setEditingCartItemForNote] = useState<CartItem | null>(null);

  /**
   * isSteakItem determines if a menu item is a genuine steak meat cut that requires
   * the steak modifier modal (Doneness, Signature Sauce, Carb/Side, Kitchen Notes).
   *
   * STRICT GUARD RULES:
   * 1. BEVERAGE or SNACK types are NEVER steaks.
   * 2. Non-grill stations (BEVERAGE_BAR, BAR_TRADISIONAL, BAKARAN_GORENG, DAPUR_NUSANTARA) are NEVER steaks.
   * 3. Beverage/bar categories or drink names (Mojito, Tea, Kopi, Espresso, Juice, etc.) are NEVER steaks.
   * 4. Condiments, sauces, sides, or non-steak proteins (Ayam, Ikan, Gurame, Fries, etc.) are NEVER steaks.
   * 5. MUST be a steak meat cut (Tenderloin, Ribeye, Sirloin, Wagyu, Tomahawk, T-Bone, Striploin, Meltique, etc.).
   */
  const isSteakItem = (item: MenuItemWithHPA): boolean => {
    // Rule 1: Menu type filter
    const menuType = (item.menu_type || '').toUpperCase();
    if (menuType === 'BEVERAGE' || menuType === 'SNACK') {
      return false;
    }

    // Rule 2: Kitchen station filter
    const station = (item.kitchen_station || '').toUpperCase();
    if (
      station === 'BEVERAGE_BAR' ||
      station === 'BAR_TRADISIONAL' ||
      station === 'BAKARAN_GORENG' ||
      station === 'DAPUR_NUSANTARA'
    ) {
      return false;
    }

    const cat = (item.category_name || '').toLowerCase();
    const name = (item.name || '').toLowerCase();

    // Rule 3: Exclude drink keywords
    const isDrink =
      cat.includes('minuman') ||
      cat.includes('beverage') ||
      cat.includes('bar ') ||
      cat.includes('mocktail') ||
      name.includes('mojito') ||
      name.includes('tea') ||
      name.includes('teh') ||
      name.includes('kopi') ||
      name.includes('coffee') ||
      name.includes('espresso') ||
      name.includes('latte') ||
      name.includes('juice') ||
      name.includes('jus') ||
      name.includes('kelapa') ||
      name.includes('wedang');
    if (isDrink) {
      return false;
    }

    // Rule 4: Exclude condiments, sauces, sides, or other proteins
    const isNonSteak =
      cat.includes('saus') ||
      cat.includes('kondimen') ||
      cat.includes('side') ||
      cat.includes('tradisional') ||
      cat.includes('bakaran') ||
      name.includes('ayam') ||
      name.includes('gurame') ||
      name.includes('ikan') ||
      name.includes('bebek') ||
      name.includes('sambal') ||
      name.includes('french fries') ||
      name.includes('mashed potato') ||
      name.includes('nasi putih');
    if (isNonSteak) {
      return false;
    }

    // Rule 5: Must match steak meat cut keywords
    const isSteakCut =
      name.includes('tenderloin') ||
      name.includes('ribeye') ||
      name.includes('sirloin') ||
      name.includes('wagyu') ||
      name.includes('tomahawk') ||
      name.includes('t-bone') ||
      name.includes('striploin') ||
      name.includes('porterhouse') ||
      name.includes('meltique') ||
      name.includes('steak');

    const isGrillStation = station === 'GRILL_STEAK';
    const isSteakCategory =
      cat.includes('steak house specialties') ||
      item.category_code === 'CAT-STEAK' ||
      (cat.includes('steak') && !cat.includes('minuman') && !cat.includes('bar'));

    return (isGrillStation || isSteakCategory) && isSteakCut;
  };

  const handleMenuClick = (menu: MenuItemWithHPA) => {
    if (!menu.is_available || menu.status === 'DRAFT' || menu.status === 'ARCHIVED') {
      return;
    }
    if (isSteakItem(menu)) {
      setEditingCartItemKey(null);
      setModifierSteakItem(menu);
      return;
    }
    addToCart(menu);
  };

  // Cart operations
  const addToCart = (menu: MenuItemWithHPA, notes?: string) => {
    if (!menu.is_available || menu.status === 'DRAFT' || menu.status === 'ARCHIVED') {
      return;
    }
    const cartKey = `${menu.id}-${notes || ''}`;
    setCart(prev => {
      const existing = prev.find(i => i.id === cartKey);
      if (existing) {
        return prev.map(i =>
          i.id === cartKey ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: cartKey,
          menuItem: menu,
          quantity: 1,
          notes,
        },
      ];
    });
  };

  const addToCartWithModifier = (menu: MenuItemWithHPA, mod: SteakModifierResult) => {
    if (editingCartItemKey) {
      // Editing existing cart line
      setCart(prev =>
        prev.map(i => {
          if (i.id === editingCartItemKey) {
            const newKey = `${menu.id}-${mod.formattedNotes}`;
            return {
              ...i,
              id: newKey,
              notes: mod.formattedNotes,
            };
          }
          return i;
        })
      );
      setEditingCartItemKey(null);
    } else {
      addToCart(menu, mod.formattedNotes);
    }
  };

  const handleSaveItemNote = (cartItemId: string, note: string) => {
    setCart(prev =>
      prev.map(i => {
        if (i.id === cartItemId) {
          const trimmed = note.trim();
          const newKey = `${i.menuItem.id}-${trimmed}`;
          return {
            ...i,
            id: newKey,
            notes: trimmed ? trimmed : undefined,
          };
        }
        return i;
      })
    );
    setEditingCartItemForNote(null);
  };

  const updateQuantity = (cartItemId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(i => {
          if (i.id === cartItemId) {
            const newQty = i.quantity + delta;
            return newQty > 0 ? { ...i, quantity: newQty } : null;
          }
          return i;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(i => i.id !== cartItemId));
  };

  // Financial calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((acc, i) => acc + i.menuItem.selling_price * i.quantity, 0);
  }, [cart]);

  const taxPB1 = useMemo(() => calculateTaxPB1(cartSubtotal, 10), [cartSubtotal]);
  const cartFinalTotal = useMemo(() => cartSubtotal + taxPB1, [cartSubtotal, taxPB1]);

  // Categories
  const categories = useMemo(() => {
    const publishedItems = menuItems.filter(m => m.status !== 'DRAFT' && m.status !== 'ARCHIVED');
    const cats = Array.from(new Set(publishedItems.map(m => m.category_name)));
    return ['ALL', ...cats];
  }, [menuItems]);

  const filteredMenuItems = useMemo(() => {
    return menuItems.filter(m => {
      if (m.status === 'DRAFT' || m.status === 'ARCHIVED') return false;
      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCat = selectedCategory === 'ALL' || m.category_name === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [menuItems, searchQuery, selectedCategory]);

  // Handle Pay First or Pay After Order Submission
  const handleOpenOrder = async () => {
    if (cart.length === 0) return;
    if (paymentFlow === 'PAY_AFTER' && !selectedTableId) {
      setErrorMsg('Pilih Meja / Gazebo terlebih dahulu untuk alur Bayar di Akhir (Dine-in)!');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);

    // Resolve outlet ID
    let outletId = activeOutletId;
    if (!outletId || outletId === 'ALL') {
      const selectedTbl = tables.find(t => t.id === selectedTableId);
      outletId = selectedTbl?.outlet_id || (accessibleOutlets.length > 0 ? (accessibleOutlets[0]?.id ?? '') : '');
    }

    try {
      const ord = await createOrder({
        outlet_id: outletId,
        ...(selectedTableId ? { table_id: selectedTableId } : {}),
        customer_name: customerName,
        pax_count: paxCount,
        order_type: 'DINE_IN',
        payment_flow: paymentFlow,
        items: cart.map(i => ({
          menu_item_id: i.menuItem.id,
          quantity: i.quantity,
          ...(i.notes ? { notes: i.notes } : {}),
        })),
      });

      if (paymentFlow === 'PAY_FIRST') {
        // Open tender modal immediately
        setActiveExistingOrder(ord);
        setCashTendered(ord.final_total);
        setIsTenderModalOpen(true);
      } else {
        // Dine in Pay After: order opened & sent to kitchen KDS
        setSuccessOrder(ord);
        void refetchShift();
        setCart([]);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat pesanan');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle adding extra items to an existing open dine-in table order
  const handleAddItemsToOrder = async () => {
    if (!activeExistingOrder || cart.length === 0) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const updated = await addOrderItems(
        activeExistingOrder.id,
        cart.map(i => ({
          menu_item_id: i.menuItem.id,
          quantity: i.quantity,
          ...(i.notes ? { notes: i.notes } : {}),
        }))
      );

      setActiveExistingOrder(updated);
      setSuccessOrder(updated);
      void refetchShift();
      setCart([]);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menambahkan menu ke pesanan');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Payment Settlement in Tender Modal
  const handleTenderPayment = async () => {
    const targetOrder = activeExistingOrder || successOrder;
    if (!targetOrder) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const amt = tenderMethod === 'CASH' ? cashTendered : targetOrder.final_total;
      const settled = await processOrderPayment(targetOrder.id, {
        payment_method: tenderMethod,
        amount: amt,
        paid_by: customerName,
        ...(tenderMethod === 'QRIS' ? { reference_number: `QRIS-${Date.now().toString().slice(-6)}` } : {}),
      });

      setSuccessOrder(settled);
      void refetchShift();
      setActiveExistingOrder(null);
      setIsTenderModalOpen(false);
      setCart([]);
      if (autoPrintReceipt) {
        autoPrintReceiptOnce(settled, '80mm');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memproses pembayaran');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <div className="tropical-glass max-w-7xl mx-auto space-y-4 pb-12">
        {/* Top Bar with Back and Table Info */}
        <div data-spot="toolbar" className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-3xl bg-white border border-slate-200 shadow-xs gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/pos/tables')}
              className="p-2 rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition"
              title="Kembali ke Denah Meja"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-black text-slate-950 flex items-center gap-2">
                <POSTerminalIcon className="w-6 h-6 text-emerald-600" />
                Terminal Kasir POS Touch
              </h1>
              <p className="text-xs text-slate-600 font-semibold">
                Sistem Order Cepat Multi-Alur • {isSteakPOS ? 'Tropical Steak House Manding' : isGardenPOS ? 'Tropical Garden Resto Manding' : 'Tropical F&B Group'}
              </p>
            </div>
          </div>

          {/* Flow Mode Switcher Pills + Quick Navigation */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-100 border border-slate-200">
              <button
                type="button"
                onClick={() => setPaymentFlow('PAY_FIRST')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-2xs ${
                  paymentFlow === 'PAY_FIRST'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-950 hover:bg-white'
                }`}
              >
                <CashDrawerIcon className="w-3.5 h-3.5" />
                ⚡ Bayar di Awal (Counter)
              </button>
              <button
                type="button"
                onClick={() => setPaymentFlow('PAY_AFTER')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-2xs ${
                  paymentFlow === 'PAY_AFTER'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-700 hover:text-slate-950 hover:bg-white'
                }`}
              >
                <DiningTableIcon className="w-3.5 h-3.5" />
                🍽️ Bayar di Akhir (Meja/Gazebo)
              </button>
            </div>

            <button
              type="button"
              onClick={() => navigate('/pos/tables')}
              className="px-3 py-2 rounded-2xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 flex items-center gap-1.5 shadow-2xs"
            >
              <DiningTableIcon className="w-3.5 h-3.5 text-amber-600" />
              Denah Meja
            </button>

            <button
              type="button"
              onClick={() => navigate('/pos/kds')}
              className="px-3 py-2 rounded-2xl text-xs font-bold bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 flex items-center gap-1.5 shadow-2xs"
            >
              <ChefHat className="w-3.5 h-3.5 text-emerald-600" />
              Layar Dapur (KDS)
            </button>

            <button
              type="button"
              onClick={toggleAutoPrintReceipt}
              className={`px-3 py-2 rounded-2xl text-xs font-black transition flex items-center gap-1.5 border shadow-2xs ${
                autoPrintReceipt
                  ? 'bg-emerald-500/15 text-emerald-900 border-emerald-400 hover:bg-emerald-500/25'
                  : 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
              }`}
              title="Klik untuk mengubah status cetak otomatis struk pembayaran kasir"
            >
              <Printer className={`w-3.5 h-3.5 ${autoPrintReceipt ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
              <span>Auto-Print Struk: {autoPrintReceipt ? 'AKTIF' : 'MATI'}</span>
            </button>
          </div>
        </div>

        {/* Cashier Shift Drawer & Reconciliation Status Widget */}
        <ShiftStatusWidget
          shift={currentShift}
          isOpen={isShiftOpen}
          isLoading={isLoadingShift}
          activeOutletId={activeOutletId}
          accessibleOutlets={accessibleOutlets}
          onSelectOutlet={(oid) => setActiveOutletId(oid)}
          onOpenShiftClick={() => setIsShiftOpenModalOpen(true)}
          onCloseShiftClick={() => setIsShiftCloseModalOpen(true)}
          onCashMovementClick={() => setIsCashMovementModalOpen(true)}
          onXReportClick={handleOpenXReport}
        />

        {/* Success Alert Banner */}
        {successOrder && (
          <div className="p-4 rounded-2xl bg-emerald-100 border-2 border-emerald-400 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0" />
              <div>
                <strong className="text-sm font-black">
                  Pesanan #{successOrder.order_number} Berhasil Diproses!
                </strong>
                <p className="text-xs text-emerald-900 font-semibold">
                  Status: <span className="font-bold">{successOrder.status}</span> • Total:{' '}
                  <span className="font-mono font-black">{formatIDR(successOrder.final_total)}</span>
                  {successOrder.payment_status === 'PAID' && ' (Lunas • Struk dicetak otomatis ✓)'}
                  {successOrder.status === 'IN_KITCHEN' && ' (Tiket Terkirim ke Layar Dapur KDS)'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => handleOpenReceipt(successOrder, successOrder.payment_status !== 'PAID')}
                className="text-xs font-black bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                Cetak Ulang Struk
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/pos/kds')}
                className="text-xs font-bold border-emerald-400 text-emerald-950 bg-white hover:bg-emerald-50"
              >
                Ke Layar KDS
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate('/pos/tables')}
                className="text-xs font-bold border-emerald-400 text-emerald-950 bg-white hover:bg-emerald-50"
              >
                Ke Denah Meja
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSuccessOrder(null)}
                className="text-xs font-bold border-emerald-400 text-emerald-950 bg-white hover:bg-emerald-50"
              >
                Tutup
              </Button>
            </div>
          </div>
        )}

        {/* Main 2-Column POS Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Menu Catalog (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Quick Outlet Selector / Status Bar */}
            {isGlobalAllOutlets ? (
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-900 text-white shadow-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400 pl-1 uppercase tracking-wider">
                    Counter:
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {accessibleOutlets.map((outlet) => {
                      const isSelected = activeOutletId === outlet.id;
                      const isSteak = outlet.code.toUpperCase().includes('TSH') || outlet.name.toLowerCase().includes('steak');
                      return (
                        <button
                          key={outlet.id}
                          type="button"
                          onClick={() => {
                            setActiveOutletId(outlet.id);
                            setSelectedCategory('ALL');
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                            isSelected
                              ? isSteak
                                ? 'bg-amber-500 text-slate-950 font-black shadow-xs ring-2 ring-amber-300'
                                : 'bg-emerald-500 text-slate-950 font-black shadow-xs ring-2 ring-emerald-300'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {isSteak ? <Flame className="w-3.5 h-3.5" /> : <Trees className="w-3.5 h-3.5" />}
                          {outlet.name}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setActiveOutletId('ALL');
                        setSelectedCategory('ALL');
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-2xs ${
                        activeOutletId === 'ALL'
                          ? 'bg-blue-600 text-white font-black shadow-xs ring-2 ring-blue-300'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      🏢 Semua (Konsolidasi)
                    </button>
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 font-mono hidden sm:inline-block pr-1">
                  Mode Owner Group
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between px-3.5 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 shadow-2xs">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-lg bg-emerald-100 text-emerald-800">
                    <Lock className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-bold">
                    Counter Kasir Terisolasi:{' '}
                    <span className="text-emerald-950 font-black">
                      {accessibleOutlets.find((o) => o.id === activeOutletId)?.name || 'Resto Terpilih'}
                    </span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-200/80 font-mono font-bold">
                    {accessibleOutlets.find((o) => o.id === activeOutletId)?.code || activeOutletId}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700">
                  🔒 Menu &amp; Meja Khusus Cabang Ini
                </span>
              </div>
            )}

            {/* Search & Category Filter Bar */}
            <div data-spot="toolbar" className="p-4 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={
                    isSteakPOS
                      ? 'Cari nama steak, sirloin, tenderloin, mocktail...'
                      : isGardenPOS
                        ? 'Cari nama gurame, ayam bakar, kelapa muda, kopi...'
                        : 'Cari nama steak, sambal, minuman...'
                  }
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                />
              </div>

              {/* Categories Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition shadow-2xs ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {cat === 'ALL' ? 'Semua Menu' : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Items Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {filteredMenuItems.map(item => {
                const soldOut = !item.is_available;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={soldOut}
                    data-spot="card"
                    onClick={() => handleMenuClick(item)}
                    className={`p-3.5 rounded-3xl border-2 transition text-left flex flex-col justify-between group shadow-xs ${
                      soldOut
                        ? 'bg-slate-100/80 border-slate-200 opacity-65 cursor-not-allowed'
                        : 'bg-white border-slate-200 hover:border-emerald-500 hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 inline-block truncate">
                          {item.category_name}
                        </span>
                        {soldOut ? (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white shrink-0">
                            HABIS
                          </span>
                        ) : isSteakItem(item) ? (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-0.5 shrink-0">
                            <Flame className="w-2.5 h-2.5 text-rose-600" />
                            Racik Steak
                          </span>
                        ) : null}
                      </div>
                      <h4 className={`font-black text-xs transition line-clamp-2 ${soldOut ? 'text-slate-500 line-through' : 'text-slate-950 group-hover:text-emerald-700'}`}>
                        {item.name}
                      </h4>
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                      <span className={`font-mono font-black text-xs ${soldOut ? 'text-slate-400' : 'text-emerald-700'}`}>
                        {formatIDR(item.selling_price)}
                      </span>
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center transition font-bold ${
                        soldOut
                          ? 'bg-slate-200 text-slate-400'
                          : 'bg-emerald-100 text-emerald-800 group-hover:bg-emerald-600 group-hover:text-white'
                      }`}>
                        <Plus className="w-4 h-4" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {filteredMenuItems.length === 0 && !isLoading && (
              <div className="p-8 text-center rounded-3xl bg-white border border-slate-200 text-slate-500 text-xs font-semibold">
                Tidak ada menu yang sesuai dengan pencarian Anda.
              </div>
            )}
          </div>

          {/* Right Column: Order Bill / Cart (5 Cols) - High-Contrast Ticket Slip */}
          <div className="lg:col-span-5 space-y-4">
            <div data-spot="panel" className="rounded-3xl bg-white border-2 border-slate-200 shadow-xl p-5 flex flex-col justify-between sticky top-4">
              {/* Order Header Form */}
              <div className="space-y-3.5 pb-4 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-base text-slate-950 flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-600" />
                    Tagihan Pesanan
                  </h3>
                  <span
                    className={`text-[11px] font-black px-3 py-1 rounded-full shadow-2xs ${
                      paymentFlow === 'PAY_FIRST'
                        ? 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                        : 'bg-amber-100 text-amber-950 border border-amber-300'
                    }`}
                  >
                    {paymentFlow === 'PAY_FIRST' ? '⚡ Bayar di Awal' : '🍽️ Bayar di Akhir'}
                  </span>
                </div>

                {/* Table & Customer Inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Meja / Gazebo
                    </label>
                    <select
                      value={selectedTableId}
                      onChange={e => handleTableChange(e.target.value)}
                      className={`w-full mt-1.5 px-3 py-2 text-xs font-black rounded-xl border bg-white text-slate-950 focus:outline-none focus:ring-2 shadow-2xs ${
                        paymentFlow === 'PAY_AFTER' && !selectedTableId
                          ? 'border-amber-400 focus:ring-amber-500 bg-amber-50/40'
                          : 'border-slate-300 focus:ring-emerald-500'
                      }`}
                    >
                      {paymentFlow === 'PAY_FIRST' ? (
                        <option value="">Tanpa Meja (Takeaway / Counter)</option>
                      ) : (
                        <option value="">-- Pilih Meja / Gazebo (Wajib) --</option>
                      )}
                      {tables.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.table_number} ({t.status === 'AVAILABLE' ? 'Kosong' : t.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                      Jumlah Tamu
                    </label>
                    <div className="mt-1.5">
                      <NumberInput
                        min={1}
                        max={100}
                        value={paxCount}
                        onChange={(val) => setPaxCount(val || 1)}
                        prefix={<User className="w-3.5 h-3.5 text-slate-500" />}
                        suffix="Pax"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Nama Pelanggan / PIC
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Nama pelanggan..."
                    className="w-full mt-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                  />
                </div>
              </div>

              {/* Active Existing Dine-In Order Notice & Quick Tools */}
              {activeExistingOrder && (
                <div className="my-3 p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-xs text-amber-950 space-y-2.5">
                  <div className="flex items-center justify-between font-black">
                    <span className="flex items-center gap-1.5">
                      <DiningTableIcon className="w-4 h-4 text-amber-700" />
                      Pesanan Meja #{activeExistingOrder.order_number}
                    </span>
                    <span className="font-mono text-sm text-amber-900 font-black">
                      {formatIDR(activeExistingOrder.final_total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-amber-800">
                    <span>Status: <strong className="uppercase">{activeExistingOrder.status}</strong></span>
                    <span>Tamu: <strong>{activeExistingOrder.customer_name} ({activeExistingOrder.pax_count} Pax)</strong></span>
                  </div>
                  <div className="pt-1 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsSplitModalOpen(true)}
                      className="text-xs py-1.5 font-bold bg-white hover:bg-amber-100 text-amber-950 border border-amber-400 shadow-2xs flex-1 flex items-center justify-center gap-1.5"
                    >
                      <SplitBillIcon className="w-3.5 h-3.5 text-amber-600" />
                      Split Bill
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleOpenReceipt(activeExistingOrder, true)}
                      className="text-xs py-1.5 font-bold bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 shadow-2xs flex-1 flex items-center justify-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      Cetak Bill Meja
                    </Button>
                  </div>
                </div>
              )}

              {/* Items Section: Active Existing Order Items + Additional Cart Items */}
              <div className="my-3 max-h-72 overflow-y-auto space-y-3 pr-1">
                {/* Active Items on Table */}
                {activeExistingOrder && activeExistingOrder.items && activeExistingOrder.items.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 pb-1 border-b border-slate-200">
                      <UtensilsCrossed className="w-3 h-3 text-emerald-600" />
                      Pesanan Berjalan di Meja ({activeExistingOrder.items.length} Menu)
                    </div>
                    <div className="divide-y divide-slate-100">
                      {activeExistingOrder.items.map((it) => (
                        <div key={it.id} className="py-2 flex items-center justify-between text-xs bg-slate-50/60 p-2 rounded-xl my-1 border border-slate-200/60">
                          <div className="flex-1 pr-2">
                            <div className="font-bold text-slate-950">{it.item_name}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {it.quantity}x @ {formatIDR(it.unit_price)}
                              {it.notes && <span className="italic ml-1 text-slate-400">({it.notes})</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-slate-900 block">
                              {formatIDR(it.subtotal)}
                            </span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-emerald-100 text-emerald-800 inline-block">
                              {it.status === 'COOKING' ? '🔥 Dimasak' : it.status === 'READY' ? '✅ Siap' : it.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Newly Added Cart Items */}
                {cart.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-black uppercase tracking-wider text-amber-700 flex items-center gap-1.5 pb-1 border-b border-amber-200">
                      <Plus className="w-3 h-3 text-amber-600" />
                      {activeExistingOrder ? 'Tambahan Menu Baru' : 'Daftar Menu yang Dipesan'} ({cart.length})
                    </div>
                    <div className="divide-y divide-slate-200">
                      {cart.map(item => (
                        <div key={item.id} className="py-2.5 flex items-center justify-between text-xs bg-amber-50/50 p-2.5 rounded-2xl my-1.5 border border-amber-200/80 shadow-2xs">
                          <div className="flex-1 pr-2">
                            <div className="font-black text-slate-950 flex items-center gap-1.5 flex-wrap">
                              <span>{item.menuItem.name}</span>
                              {isSteakItem(item.menuItem) ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCartItemKey(item.id);
                                    setModifierSteakItem(item.menuItem);
                                  }}
                                  className="text-[10px] text-amber-700 hover:text-amber-900 underline font-semibold cursor-pointer"
                                  title="Ubah Racikan Steak (Doneness, Saus, Sides)"
                                >
                                  (Ubah Racikan)
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setEditingCartItemForNote(item)}
                                  className="text-[10px] text-slate-500 hover:text-emerald-700 underline font-semibold cursor-pointer"
                                  title="Tambah atau Ubah Catatan Khusus"
                                >
                                  {item.notes ? '(Ubah Catatan)' : '+ Catatan'}
                                </button>
                              )}
                            </div>
                            {item.notes && (
                              <div className="flex flex-wrap gap-1 mt-1 mb-0.5">
                                {item.notes.split('|').map((part, idx) => {
                                  const text = part.trim();
                                  if (!text) return null;
                                  const isDoneness = ['rare', 'medium', 'well'].some(k => text.toLowerCase().includes(k));
                                  const isSauce = text.toLowerCase().includes('sauce') || text.toLowerCase().includes('saus') || text.toLowerCase().includes('bbq');
                                  const isSide = text.toLowerCase().includes('fries') || text.toLowerCase().includes('potato') || text.toLowerCase().includes('nasi') || text.toLowerCase().includes('veggie');
                                  return (
                                    <span
                                      key={idx}
                                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border flex items-center gap-0.5 ${
                                        isDoneness
                                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                                          : isSauce
                                          ? 'bg-amber-100/70 text-amber-900 border-amber-300'
                                          : isSide
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                          : 'bg-slate-100 text-slate-700 border-slate-200'
                                      }`}
                                    >
                                      {isDoneness && <Flame className="w-2.5 h-2.5 text-rose-600 shrink-0" />}
                                      {text}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            <div className="text-[11px] text-slate-600 font-mono font-semibold">
                              {formatIDR(item.menuItem.selling_price)} x {item.quantity}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white shadow-2xs">
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, -1)}
                                className="px-2 py-0.5 text-slate-700 hover:bg-slate-100 font-bold"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="px-2 text-xs font-mono font-black text-slate-950">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(item.id, 1)}
                                className="px-2 py-0.5 text-slate-700 hover:bg-slate-100 font-bold"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                            <span className="font-mono font-black min-w-16 text-right text-slate-950">
                              {formatIDR(item.menuItem.selling_price * item.quantity)}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.id)}
                              className="text-rose-600 hover:text-rose-800 p-1 font-bold"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Empty State when no items in both */}
                {cart.length === 0 && (!activeExistingOrder || !activeExistingOrder.items || activeExistingOrder.items.length === 0) && (
                  <div className="py-8 text-center text-slate-500 font-semibold text-xs">
                    Keranjang kosong. Pilih menu di sebelah kiri untuk menambahkan.
                  </div>
                )}
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="space-y-2 pt-3 border-t border-slate-200 text-xs">
                <div className="flex justify-between text-slate-700 font-semibold">
                  <span>Subtotal Pesanan:</span>
                  <span className="font-mono font-bold text-slate-950">
                    <SmoothNumber
                      value={(activeExistingOrder?.subtotal || 0) + cartSubtotal}
                      format="idr"
                    />
                  </span>
                </div>
                <div className="flex justify-between text-slate-700 font-semibold">
                  <span>Pajak Restoran (PB1 10%):</span>
                  <span className="font-mono font-bold text-slate-950">
                    <SmoothNumber
                      value={(activeExistingOrder?.tax_pb1_amount || 0) + taxPB1}
                      format="idr"
                    />
                  </span>
                </div>
                <div className="flex justify-between text-base font-black pt-2 border-t border-slate-300 text-slate-950">
                  <span>Total Tagihan:</span>
                  <span className="font-mono text-emerald-700 font-black text-lg">
                    <SmoothNumber
                      value={(activeExistingOrder?.final_total || 0) + cartFinalTotal}
                      format="idr"
                    />
                  </span>
                </div>
              </div>

              {/* Action Submit Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-200 space-y-2">
                {errorMsg && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs flex items-center gap-1.5 font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Case 1: Active Order exists, Cart is Empty -> Guest wants to settle bill */}
                {activeExistingOrder && cart.length === 0 ? (
                  <Button
                    onClick={() => {
                      setCashTendered(activeExistingOrder.final_total);
                      setIsTenderModalOpen(true);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 text-sm shadow-md shadow-emerald-600/30 rounded-2xl flex items-center justify-center gap-2"
                  >
                    <CashDrawerIcon className="w-4 h-4" />
                    Bayar Tagihan Meja ({formatIDR(activeExistingOrder.final_total)})
                  </Button>
                ) : activeExistingOrder && cart.length > 0 ? (
                  /* Case 2: Active Order exists, Cart has Items -> Guest adds extra items */
                  <Button
                    onClick={handleAddItemsToOrder}
                    loading={isSubmitting}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-3.5 text-sm shadow-md shadow-amber-600/30 rounded-2xl flex items-center justify-center gap-2"
                  >
                    <ChefHat className="w-4 h-4" />
                    Kirim Tambahan Menu ke Dapur (+{formatIDR(cartFinalTotal)})
                  </Button>
                ) : cart.length > 0 && paymentFlow === 'PAY_FIRST' ? (
                  /* Case 3: New Order Pay First */
                  <Button
                    onClick={handleOpenOrder}
                    loading={isSubmitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3.5 text-sm shadow-md shadow-emerald-600/30 rounded-2xl flex items-center justify-center gap-2"
                  >
                    <CashDrawerIcon className="w-4 h-4" />
                    Bayar Sekarang ({formatIDR(cartFinalTotal)})
                  </Button>
                ) : cart.length > 0 && paymentFlow === 'PAY_AFTER' ? (
                  /* Case 4: New Order Pay After */
                  <Button
                    onClick={handleOpenOrder}
                    loading={isSubmitting}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black py-3.5 text-sm shadow-md shadow-amber-600/30 rounded-2xl flex items-center justify-center gap-2"
                  >
                    <DiningTableIcon className="w-4 h-4" />
                    Kirim ke Dapur / Buka Meja ({formatIDR(cartFinalTotal)})
                  </Button>
                ) : (
                  /* Case 5: Empty Cart & No Active Order */
                  <Button
                    disabled
                    className="w-full bg-slate-100 text-slate-500 font-bold py-3.5 text-xs rounded-2xl border border-slate-300 cursor-not-allowed"
                  >
                    Pilih Menu di Sebelah Kiri untuk Buka Tagihan
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Payment Tender Modal */}
        {isTenderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 space-y-5">
              <div className="text-center">
                <h3 className="text-xl font-black text-slate-950">
                  Pembayaran Kasir POS
                </h3>
                <p className="text-xs text-slate-600 font-bold mt-1">
                  Total Tagihan:{' '}
                  <strong className="text-xl font-mono font-black text-emerald-700">
                    {formatIDR(activeExistingOrder?.final_total || cartFinalTotal)}
                  </strong>
                </p>
              </div>

              {/* Payment Method Selector */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTenderMethod('CASH')}
                  className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition font-bold ${
                    tenderMethod === 'CASH'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Banknote className="w-5 h-5 text-emerald-700" />
                  <span className="text-xs">Tunai</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTenderMethod('QRIS')}
                  className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition font-bold ${
                    tenderMethod === 'QRIS'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <QrCode className="w-5 h-5 text-indigo-700" />
                  <span className="text-xs">QRIS BCA</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTenderMethod('DEBIT_CARD')}
                  className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 transition font-bold ${
                    tenderMethod === 'DEBIT_CARD'
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-blue-700" />
                  <span className="text-xs">Kartu Debit</span>
                </button>
              </div>

              {/* Cash Denominations */}
              {tenderMethod === 'CASH' && (
                <div className="space-y-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-800 font-bold">Uang Diterima:</span>
                    <div className="w-48">
                      <NumberInput
                        min={0}
                        step={1000}
                        value={cashTendered}
                        onChange={(val) => setCashTendered(val)}
                        prefix="Rp"
                        className="text-right text-sm font-black text-slate-950"
                      />
                    </div>
                  </div>

                  {/* Quick Cash Buttons */}
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      activeExistingOrder?.final_total || cartFinalTotal,
                      50000,
                      100000,
                      200000,
                    ].map((den, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setCashTendered(den)}
                        className="py-1.5 rounded-lg text-[11px] font-mono font-bold bg-white border border-slate-300 text-slate-900 hover:bg-slate-100 shadow-2xs"
                      >
                        {idx === 0 ? 'Uang Pas' : formatIDR(den).replace('Rp', '')}
                      </button>
                    ))}
                  </div>

                  {/* Change calculation */}
                  <div className="pt-2 border-t border-slate-300 flex justify-between text-xs">
                    <span className="text-slate-800 font-bold">Kembalian:</span>
                    <span className="font-mono font-black text-sm text-emerald-800">
                      {formatIDR(
                        Math.max(
                          0,
                          cashTendered - (activeExistingOrder?.final_total || cartFinalTotal)
                        )
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* QRIS Mock Frame */}
              {tenderMethod === 'QRIS' && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                  <div className="w-32 h-32 mx-auto rounded-xl bg-white p-2 border border-slate-200 flex items-center justify-center shadow-xs">
                    <QRISBadgeIcon className="w-24 h-24 text-slate-800" />
                  </div>
                  <div className="text-[11px] text-slate-600 font-semibold">
                    Scan dengan BCA Mobile, GoPay, OVO, atau ShopeePay.
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsTenderModalOpen(false)}
                  className="w-1/2 font-bold"
                >
                  Batal
                </Button>
                <Button
                  onClick={handleTenderPayment}
                  loading={isSubmitting}
                  className="w-1/2 bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-md shadow-emerald-600/25"
                >
                  Konfirmasi Bayar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Steak Customization Modifier Modal */}
        <SteakModifierModal
          isOpen={!!modifierSteakItem}
          onClose={() => {
            setModifierSteakItem(null);
            setEditingCartItemKey(null);
          }}
          menuItem={modifierSteakItem}
          initialNotes={
            editingCartItemKey
              ? cart.find(i => i.id === editingCartItemKey)?.notes
              : undefined
          }
          onConfirm={mod => {
            if (modifierSteakItem) {
              addToCartWithModifier(modifierSteakItem, mod);
            }
          }}
        />

        {/* General Item Note Modal (Beverages, Traditional Foods, etc.) */}
        <ItemNoteModal
          isOpen={!!editingCartItemForNote}
          onClose={() => setEditingCartItemForNote(null)}
          cartItem={editingCartItemForNote}
          onSaveNote={handleSaveItemNote}
        />

        {/* Split Bill Modal */}
        {activeExistingOrder && (
          <SplitBillModal
            order={activeExistingOrder}
            isOpen={isSplitModalOpen}
            onClose={() => setIsSplitModalOpen(false)}
            onOrderUpdated={updated => {
              setActiveExistingOrder(updated);
            }}
          />
        )}

        {/* Printable Thermal Receipt Modal */}
        {receiptTargetOrder && (
          <ReceiptModal
            order={receiptTargetOrder}
            isOpen={isReceiptModalOpen}
            onClose={() => setIsReceiptModalOpen(false)}
            isProForma={isReceiptProForma}
          />
        )}

        {/* Shift Open Modal */}
        <ShiftOpenModal
          isOpen={isShiftOpenModalOpen}
          outletId={activeOutletId}
          outletName={posOutlet?.name || 'Tropical F&B'}
          accessibleOutlets={accessibleOutlets}
          defaultOpeningCash={isSteakPOS ? 250000 : 200000}
          onClose={() => setIsShiftOpenModalOpen(false)}
          onSuccess={handleOpenShiftSubmit}
        />

        {/* Shift Cash Movement (Pay-In / Pay-Out) Modal */}
        {currentShift && (
          <CashMovementModal
            isOpen={isCashMovementModalOpen}
            shiftNumber={currentShift.shift_number}
            onClose={() => setIsCashMovementModalOpen(false)}
            onSuccess={handleCashMovementSubmit}
          />
        )}

        {/* Shift Close & Reconciliation Modal */}
        {currentShift && (
          <ShiftCloseModal
            isOpen={isShiftCloseModalOpen}
            shift={currentShift}
            onClose={() => setIsShiftCloseModalOpen(false)}
            onConfirmClose={handleCloseShiftSubmit}
          />
        )}

        {/* Shift Report (X-Report / Z-Report) Thermal Print Modal */}
        <ShiftReportModal
          isOpen={isShiftReportModalOpen}
          report={activeShiftReport}
          onClose={() => setIsShiftReportModalOpen(false)}
        />
      </div>
    </PageTransition>
  );
};
