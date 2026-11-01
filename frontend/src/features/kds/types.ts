export type ItemStatus = 'ORDERED' | 'COOKING' | 'READY' | 'SERVED' | 'CANCELLED';
export type TicketStatus = 'OPEN' | 'IN_KITCHEN' | 'SERVED' | 'COMPLETED' | 'CANCELLED';

export interface KitchenTicketItem {
  id: string;
  menu_item_id: string;
  item_name: string;
  category_code: string;
  category_name: string;
  station: string; // GRILL_STEAK, SIDES_PANTRY, BEVERAGE_BAR, BAKARAN_GORENG, DAPUR_NUSANTARA, BAR_TRADISIONAL, EXPEDITER
  quantity: number;
  notes?: string | undefined;
  status: ItemStatus;
  created_at: string;
  updated_at: string;
}

export interface KitchenTicket {
  id: string;
  tenant_id: string;
  outlet_id: string;
  outlet_code: string;
  outlet_name: string;
  order_number: string;
  order_type: 'DINE_IN' | 'TAKEAWAY' | 'EVENT_RESERVATION';
  table_id?: string | undefined;
  table_number?: string | undefined;
  section?: string | undefined;
  customer_name: string;
  pax_count: number;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  items: KitchenTicketItem[];
}
