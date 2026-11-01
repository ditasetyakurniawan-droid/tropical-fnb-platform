import React, { useState } from 'react';
import { X, Flame, Utensils, Sparkles, Check, ChefHat } from 'lucide-react';
import type { MenuItemWithHPA } from '@/features/menu/types';
import { formatIDR } from '@/shared/utils/currency';

export interface SteakModifierResult {
  doneness: string;
  sauce: string;
  carb: string;
  notes?: string | undefined;
  formattedNotes: string;
}

interface SteakModifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuItem: MenuItemWithHPA | null;
  onConfirm: (result: SteakModifierResult) => void;
  initialNotes?: string | undefined;
}

const DONENESS_OPTIONS = [
  { id: 'Rare', label: 'Rare', desc: 'Dingin & merah membara di tengah', color: 'border-rose-300 text-rose-800 bg-rose-50/50' },
  { id: 'Medium Rare', label: 'Medium Rare ⭐', desc: 'Rekomendasi Chef — Lembut, hangat & sangat juicy', color: 'border-amber-400 text-amber-900 bg-amber-50/80', isChefChoice: true },
  { id: 'Medium', label: 'Medium', desc: 'Merah muda hangat di bagian tengah', color: 'border-orange-300 text-orange-900 bg-orange-50/50' },
  { id: 'Medium Well', label: 'Medium Well', desc: 'Sedikit rona merah muda, padat', color: 'border-stone-300 text-stone-800 bg-stone-50/50' },
  { id: 'Well Done', label: 'Well Done', desc: 'Matang merata sempurna, tanpa warna merah muda', color: 'border-slate-300 text-slate-800 bg-slate-50/50' },
];

const SAUCE_OPTIONS = [
  { id: 'Mushroom Cream Sauce', label: 'Creamy Mushroom Sauce', desc: 'Krim jamur champignon gurih lembut khas' },
  { id: 'BBQ House Sauce', label: 'Tropical House BBQ', desc: 'Saus BBQ racikan manis berasap gurih' },
  { id: 'Black Pepper Sauce', label: 'Black Pepper Sauce', desc: 'Lada hitam harum dengan sensasi hangat' },
];

const CARB_OPTIONS = [
  { id: 'French Fries (150g)', label: 'Shoestring French Fries (150g)', desc: 'Kentang goreng renyah resep klasik' },
  { id: 'Mashed Potato Truffle (150g)', label: 'Mashed Potato Truffle (150g)', desc: 'Kentang tumbuk creamy aroma truffle' },
  { id: 'Nasi Putih (100g)', label: 'Nasi Putih Pulen (100g)', desc: 'Nasi putih hangat khas nusantara' },
  { id: 'Extra Veggies', label: 'Extra Veggies (Tanpa Karbo)', desc: 'Double sayuran pelengkap & lalapan segar' },
];

export const SteakModifierModal: React.FC<SteakModifierModalProps> = ({
  isOpen,
  onClose,
  menuItem,
  onConfirm,
  initialNotes,
}) => {
  if (!isOpen || !menuItem) return null;

  return (
    <SteakModifierModalContent
      key={menuItem.id + (initialNotes || '')}
      menuItem={menuItem}
      onClose={onClose}
      onConfirm={onConfirm}
      initialNotes={initialNotes}
    />
  );
};

interface SteakModifierContentProps {
  menuItem: MenuItemWithHPA;
  onClose: () => void;
  onConfirm: (result: SteakModifierResult) => void;
  initialNotes?: string | undefined;
}

const SteakModifierModalContent: React.FC<SteakModifierContentProps> = ({
  menuItem,
  onClose,
  onConfirm,
  initialNotes,
}) => {
  const [selectedDoneness, setSelectedDoneness] = useState<string>(() => {
    if (initialNotes) {
      const upper = initialNotes.toUpperCase();
      if (upper.includes('WELL DONE')) return 'Well Done';
      if (upper.includes('MEDIUM WELL')) return 'Medium Well';
      if (upper.includes('MEDIUM RARE')) return 'Medium Rare';
      if (upper.includes('MEDIUM')) return 'Medium';
      if (upper.includes('RARE')) return 'Rare';
    }
    return 'Medium Rare';
  });

  const [selectedSauce, setSelectedSauce] = useState<string>(() => {
    if (initialNotes) {
      const lower = initialNotes.toLowerCase();
      if (lower.includes('bbq') || lower.includes('tropical house bbq')) return 'BBQ House Sauce';
      if (lower.includes('black pepper') || lower.includes('lada hitam')) return 'Black Pepper Sauce';
      if (lower.includes('mushroom') || lower.includes('jamur')) return 'Mushroom Cream Sauce';
    }
    return menuItem.name.toLowerCase().includes('bbq') ? 'BBQ House Sauce' : 'Mushroom Cream Sauce';
  });

  const [selectedCarb, setSelectedCarb] = useState<string>(() => {
    if (initialNotes) {
      const lower = initialNotes.toLowerCase();
      if (lower.includes('mashed potato') || lower.includes('truffle')) return 'Mashed Potato Truffle (150g)';
      if (lower.includes('nasi putih') || lower.includes('nasi')) return 'Nasi Putih (100g)';
      if (lower.includes('extra veggie') || lower.includes('tanpa karbo')) return 'Extra Veggies';
      if (lower.includes('french fries') || lower.includes('fries') || lower.includes('kentang')) return 'French Fries (150g)';
    }
    return 'French Fries (150g)';
  });

  const [customNotes, setCustomNotes] = useState<string>(() => {
    if (initialNotes && initialNotes.includes('Catatan:')) {
      const match = initialNotes.match(/Catatan:\s*([^|]+)/i);
      const noteVal = match?.[1]?.trim();
      return noteVal ?? '';
    }
    return '';
  });

  const handleConfirm = () => {
    const parts = [
      selectedDoneness,
      selectedSauce,
      selectedCarb,
    ];
    if (customNotes.trim()) {
      parts.push(`Catatan: ${customNotes.trim()}`);
    }
    const formattedNotes = parts.join(' | ');

    onConfirm({
      doneness: selectedDoneness,
      sauce: selectedSauce,
      carb: selectedCarb,
      ...(customNotes.trim() ? { notes: customNotes.trim() } : {}),
      formattedNotes,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-linear-to-r from-slate-900 via-amber-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-amber-400 flex items-center gap-1">
                <ChefHat className="w-3.5 h-3.5" /> Pilihan Racikan Steak Kasir
              </div>
              <h3 className="text-base font-black text-white leading-tight">
                {menuItem.name}
              </h3>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs font-mono font-bold text-amber-300 block">
              {formatIDR(menuItem.selling_price)}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="mt-1 text-slate-400 hover:text-white transition p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Section 1: Doneness */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5 mb-2.5">
              <Flame className="w-4 h-4 text-rose-600" />
              1. Tingkat Kematangan Daging (Doneness)
              <span className="text-[10px] text-rose-600 font-bold">*Wajib</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {DONENESS_OPTIONS.map(opt => {
                const isSelected = selectedDoneness === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedDoneness(opt.id)}
                    className={`p-3 rounded-2xl border-2 text-left transition relative flex flex-col justify-between ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-600/20'
                        : `${opt.color} hover:border-slate-400`
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-950 flex items-center gap-1">
                        {opt.label}
                      </span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-600 mt-1 leading-snug">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Sauce */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5 mb-2.5">
              <Sparkles className="w-4 h-4 text-amber-600" />
              2. Pilihan Saus Pendamping (Signature Sauce)
              <span className="text-[10px] text-amber-600 font-bold">*Termasuk BOM</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SAUCE_OPTIONS.map(opt => {
                const isSelected = selectedSauce === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedSauce(opt.id)}
                    className={`p-3 rounded-2xl border-2 text-left transition flex flex-col justify-between ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-600/20'
                        : 'border-slate-200 bg-white hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-950">
                        {opt.label}
                      </span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-600 mt-1 leading-snug">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Sides / Carbs */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5 mb-2.5">
              <Utensils className="w-4 h-4 text-emerald-600" />
              3. Pilihan Karbohidrat & Pelengkap (Side / Carb)
              <span className="text-[10px] text-emerald-600 font-bold">*Termasuk BOM</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CARB_OPTIONS.map(opt => {
                const isSelected = selectedCarb === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedCarb(opt.id)}
                    className={`p-3 rounded-2xl border-2 text-left transition flex flex-col justify-between ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-600/20'
                        : 'border-slate-200 bg-white hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-950">
                        {opt.label}
                      </span>
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-600 mt-1 leading-snug">
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 4: Special Request Notes */}
          <div>
            <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5 mb-1.5">
              4. Catatan Khusus Dapur / Tamu (Opsional)
            </label>
            <input
              type="text"
              placeholder="Contoh: Saus dipisah, tanpa garam, piring ekstra panas..."
              value={customNotes}
              onChange={e => setCustomNotes(e.target.value)}
              className="w-full px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-6 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md hover:shadow-lg transition flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Tambahkan ke Pesanan
          </button>
        </div>
      </div>
    </div>
  );
};
