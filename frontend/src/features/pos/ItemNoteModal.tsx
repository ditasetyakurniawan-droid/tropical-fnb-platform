import React, { useState } from 'react';
import { X, Utensils, GlassWater, Check, Trash2 } from 'lucide-react';
import type { CartItem } from './types';

interface ItemNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  cartItem: CartItem | null;
  onSaveNote: (cartItemId: string, note: string) => void;
}

const BEVERAGE_CHIPS = [
  { label: '🧊 Sedikit Es (Less Ice)', value: 'Less Ice' },
  { label: '🚫 Tanpa Es (No Ice)', value: 'No Ice' },
  { label: '🍯 Sedikit Gula (Less Sugar)', value: 'Less Sugar' },
  { label: '🚫 Tanpa Gula (No Sugar)', value: 'No Sugar' },
  { label: '🔥 Sajikan Panas/Hangat', value: 'Sajikan Hangat' },
  { label: '🥡 Cup Takeaway / Pisah', value: 'Cup Takeaway' },
];

const FOOD_CHIPS = [
  { label: '🥣 Sambal Dipisah', value: 'Sambal Dipisah' },
  { label: '🌶️ Ekstra Pedas', value: 'Ekstra Pedas' },
  { label: '🚫 Tidak Pedas', value: 'Tidak Pedas' },
  { label: '🚫 Tanpa Bawang', value: 'Tanpa Bawang' },
  { label: '🍽️ Piring Ekstra Hangat', value: 'Piring Hangat' },
  { label: '🥡 Bungkus Terpisah', value: 'Bungkus Terpisah' },
];

export const ItemNoteModal: React.FC<ItemNoteModalProps> = ({
  isOpen,
  onClose,
  cartItem,
  onSaveNote,
}) => {
  if (!isOpen || !cartItem) return null;

  return (
    <ItemNoteModalContent
      key={cartItem.id}
      cartItem={cartItem}
      onClose={onClose}
      onSaveNote={onSaveNote}
    />
  );
};

interface ContentProps {
  cartItem: CartItem;
  onClose: () => void;
  onSaveNote: (cartItemId: string, note: string) => void;
}

const ItemNoteModalContent: React.FC<ContentProps> = ({
  cartItem,
  onClose,
  onSaveNote,
}) => {
  const [note, setNote] = useState<string>(cartItem.notes || '');

  const isBeverage =
    (cartItem.menuItem.menu_type || '').toUpperCase() === 'BEVERAGE' ||
    (cartItem.menuItem.kitchen_station || '').toUpperCase() === 'BEVERAGE_BAR' ||
    (cartItem.menuItem.kitchen_station || '').toUpperCase() === 'BAR_TRADISIONAL' ||
    (cartItem.menuItem.category_name || '').toLowerCase().includes('minuman') ||
    (cartItem.menuItem.category_name || '').toLowerCase().includes('bar');

  const chips = isBeverage ? BEVERAGE_CHIPS : FOOD_CHIPS;

  const handleToggleChip = (value: string) => {
    const current = note.trim();
    if (!current) {
      setNote(value);
      return;
    }

    const parts = current.split(',').map(s => s.trim()).filter(Boolean);
    const existingIndex = parts.findIndex(p => p.toLowerCase() === value.toLowerCase());

    if (existingIndex >= 0) {
      parts.splice(existingIndex, 1);
      setNote(parts.join(', '));
    } else {
      parts.push(value);
      setNote(parts.join(', '));
    }
  };

  const handleSave = () => {
    onSaveNote(cartItem.id, note.trim());
    onClose();
  };

  const handleClear = () => {
    setNote('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-lg flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between text-white ${
          isBeverage
            ? 'bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950'
            : 'bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              isBeverage
                ? 'bg-sky-500/20 text-sky-400 border border-sky-400/30'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30'
            }`}>
              {isBeverage ? <GlassWater className="w-5 h-5" /> : <Utensils className="w-5 h-5" />}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-slate-300">
                {isBeverage ? '🍹 Racikan & Catatan Minuman' : '🍳 Catatan Dapur / Masak'}
              </div>
              <h3 className="text-base font-black text-white leading-tight">
                {cartItem.menuItem.name}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-2">
              <span>Pilihan Cepat (Quick Notes)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {chips.map(chip => {
                const isActive = note.toLowerCase().includes(chip.value.toLowerCase());
                return (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => handleToggleChip(chip.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border shadow-2xs ${
                      isActive
                        ? isBeverage
                          ? 'bg-sky-600 text-white border-sky-600 ring-2 ring-sky-300'
                          : 'bg-emerald-700 text-white border-emerald-700 ring-2 ring-emerald-300'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{chip.label}</span>
                    {isActive && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="custom-item-note-input" className="text-xs font-black uppercase tracking-wider text-slate-700">
                Ketik Catatan Tambahan (Opsional)
              </label>
              {note && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                  Hapus Catatan
                </button>
              )}
            </div>
            <textarea
              id="custom-item-note-input"
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={
                isBeverage
                  ? 'Contoh: Sedikit es, gula 50%, minta cup takeaway terpisah...'
                  : 'Contoh: Sambal dipisah, bumbu banyak, jangan terlalu asin...'
              }
              className="w-full p-3 text-xs font-semibold rounded-2xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Catatan ini akan dicetak pada bon masak dan tampil jelas di layar dapur KDS.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleSave}
            className={`px-5 py-2 rounded-xl text-xs font-black text-white transition flex items-center gap-1.5 shadow-sm ${
              isBeverage
                ? 'bg-sky-600 hover:bg-sky-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <Check className="w-4 h-4" />
            Simpan Catatan
          </button>
        </div>
      </div>
    </div>
  );
};
