import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SteakModifierModal } from './SteakModifierModal';
import type { MenuItemWithHPA } from '@/features/menu/types';

const MOCK_STEAK: MenuItemWithHPA = {
  id: 'item-ribeye-1',
  tenant_id: 'tenant-1',
  code: 'STEAK-RIBEYE',
  name: 'Australian Ribeye Steak 200g',
  description: 'Tender prime ribeye with marbling',
  category_id: 'cat-steak',
  category_code: 'CAT-STEAK',
  category_name: 'Steak & Grill',
  selling_price: 185000,
  target_food_cost_pct: 35,
  is_available: true,
  status: 'PUBLISHED',
  menu_type: 'FOOD',
  hpa_calculation_mode: 'DYNAMIC_BOM',
  manual_hpa: 0,
  hpa: 65000,
  gross_margin: 120000,
  food_cost_pct: 35.14,
  kitchen_station: 'GRILL_STEAK',
};

describe('SteakModifierModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <SteakModifierModal
        isOpen={false}
        onClose={vi.fn()}
        menuItem={MOCK_STEAK}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders steak title, default selections, and formats notes upon confirm', () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <SteakModifierModal
        isOpen={true}
        onClose={handleClose}
        menuItem={MOCK_STEAK}
        onConfirm={handleConfirm}
      />
    );

    // Title and price
    expect(screen.getByText('Australian Ribeye Steak 200g')).toBeInTheDocument();
    expect(screen.getByText('Rp 185.000')).toBeInTheDocument();

    // Default Chef choice Medium Rare should be rendered
    expect(screen.getByText('Medium Rare ⭐')).toBeInTheDocument();

    // Select Well Done
    fireEvent.click(screen.getByText('Well Done'));

    // Select BBQ House Sauce
    fireEvent.click(screen.getByText('Tropical House BBQ'));

    // Select Mashed Potato Truffle
    fireEvent.click(screen.getByText('Mashed Potato Truffle (150g)'));

    // Enter special notes
    const input = screen.getByPlaceholderText(/saus dipisah/i);
    fireEvent.change(input, { target: { value: 'Saus dipisah di wadah kecil' } });

    // Click confirm
    fireEvent.click(screen.getByText('Tambahkan ke Pesanan'));

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    const result = handleConfirm.mock.calls[0]?.[0];
    expect(result).toBeDefined();
    expect(result.doneness).toBe('Well Done');
    expect(result.sauce).toBe('BBQ House Sauce');
    expect(result.carb).toBe('Mashed Potato Truffle (150g)');
    expect(result.notes).toBe('Saus dipisah di wadah kecil');
    expect(result.formattedNotes).toBe(
      'Well Done | BBQ House Sauce | Mashed Potato Truffle (150g) | Catatan: Saus dipisah di wadah kecil'
    );
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Batal is clicked', () => {
    const handleClose = vi.fn();
    render(
      <SteakModifierModal
        isOpen={true}
        onClose={handleClose}
        menuItem={MOCK_STEAK}
        onConfirm={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Batal'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('pre-selects options when initialNotes is provided', () => {
    const handleConfirm = vi.fn();
    render(
      <SteakModifierModal
        isOpen={true}
        onClose={vi.fn()}
        menuItem={MOCK_STEAK}
        initialNotes="Well Done | Black Pepper Sauce | Nasi Putih (100g) | Catatan: Tanpa sayur"
        onConfirm={handleConfirm}
      />
    );

    // Confirm without touching anything, should retain the initial values
    fireEvent.click(screen.getByText('Tambahkan ke Pesanan'));

    expect(handleConfirm).toHaveBeenCalledTimes(1);
    const result = handleConfirm.mock.calls[0]?.[0];
    expect(result.doneness).toBe('Well Done');
    expect(result.sauce).toBe('Black Pepper Sauce');
    expect(result.carb).toBe('Nasi Putih (100g)');
    expect(result.notes).toBe('Tanpa sayur');
  });
});
