import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemNoteModal } from './ItemNoteModal';
import type { CartItem } from './types';
import type { MenuItemWithHPA } from '@/features/menu/types';

const MOCK_BEVERAGE: MenuItemWithHPA = {
  id: 'item-mojito-1',
  tenant_id: 'tenant-1',
  code: 'BEV-MOJITO',
  name: 'Classic Virgin Mojito Mint',
  category_id: 'cat-bev',
  category_code: 'CAT-BEV-STEAK',
  category_name: 'Bar Minuman Steak & Mocktail',
  selling_price: 26000,
  target_food_cost_pct: 25,
  is_available: true,
  status: 'PUBLISHED',
  menu_type: 'BEVERAGE',
  kitchen_station: 'BEVERAGE_BAR',
  hpa_calculation_mode: 'DYNAMIC_BOM',
  manual_hpa: 0,
  hpa: 6500,
  gross_margin: 19500,
  food_cost_pct: 25.0,
};

const MOCK_CART_ITEM: CartItem = {
  id: 'item-mojito-1-',
  menuItem: MOCK_BEVERAGE,
  quantity: 2,
};

describe('ItemNoteModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ItemNoteModal
        isOpen={false}
        onClose={vi.fn()}
        cartItem={MOCK_CART_ITEM}
        onSaveNote={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders beverage quick chips and saves note on confirmation', () => {
    const handleSaveNote = vi.fn();
    const handleClose = vi.fn();

    render(
      <ItemNoteModal
        isOpen={true}
        onClose={handleClose}
        cartItem={MOCK_CART_ITEM}
        onSaveNote={handleSaveNote}
      />
    );

    // Header title and item name
    expect(screen.getByText('Classic Virgin Mojito Mint')).toBeInTheDocument();
    expect(screen.getByText('🍹 Racikan & Catatan Minuman')).toBeInTheDocument();

    // Beverage quick chips
    expect(screen.getByText(/Less Ice/i)).toBeInTheDocument();
    expect(screen.getByText(/No Sugar/i)).toBeInTheDocument();

    // Click Less Ice chip
    fireEvent.click(screen.getByText(/Less Ice/i));

    // Click No Sugar chip
    fireEvent.click(screen.getByText(/No Sugar/i));

    // Save note
    fireEvent.click(screen.getByText('Simpan Catatan'));

    expect(handleSaveNote).toHaveBeenCalledWith('item-mojito-1-', 'Less Ice, No Sugar');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('clears note and handles manual typing', () => {
    const handleSaveNote = vi.fn();
    const handleClose = vi.fn();

    render(
      <ItemNoteModal
        isOpen={true}
        onClose={handleClose}
        cartItem={{
          ...MOCK_CART_ITEM,
          notes: 'Sedikit Es',
        }}
        onSaveNote={handleSaveNote}
      />
    );

    // Hapus Catatan button is visible
    const clearBtn = screen.getByText('Hapus Catatan');
    fireEvent.click(clearBtn);

    // Type custom note
    const textarea = screen.getByPlaceholderText(/minta cup takeaway/i);
    fireEvent.change(textarea, { target: { value: 'Gelas terpisah, daun mint double' } });

    fireEvent.click(screen.getByText('Simpan Catatan'));

    expect(handleSaveNote).toHaveBeenCalledWith('item-mojito-1-', 'Gelas terpisah, daun mint double');
  });

  it('calls onClose when Batal is clicked', () => {
    const handleClose = vi.fn();
    render(
      <ItemNoteModal
        isOpen={true}
        onClose={handleClose}
        cartItem={MOCK_CART_ITEM}
        onSaveNote={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Batal'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
