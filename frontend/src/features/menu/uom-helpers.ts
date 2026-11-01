import type { KitchenStationCode, MenuType } from './types'

export interface UnitOption {
  value: string
  label: string
}

export interface UnitGroup {
  group: string
  options: UnitOption[]
}

export const HUMAN_UNIT_GROUPS: readonly UnitGroup[] = [
  {
    group: 'Berat / Massa (Daging, Bumbu, Tepung)',
    options: [
      { value: 'kg', label: 'kg (Kilogram)' },
      { value: 'ons', label: 'ons (100 gram)' },
      { value: 'g', label: 'g (Gram)' },
      { value: 'mg', label: 'mg (Miligram)' },
    ],
  },
  {
    group: 'Volume / Cairan & Takaran Sendok (Sirup, Susu, Saus)',
    options: [
      { value: 'liter', label: 'liter (1.000 ml)' },
      { value: 'ml', label: 'ml (Mililiter)' },
      { value: 'sdm', label: 'sdm (Sendok Makan • 15 ml)' },
      { value: 'sdt', label: 'sdt (Sendok Teh • 5 ml)' },
    ],
  },
  {
    group: 'Satuan Hitung / Porsi & Kemasan',
    options: [
      { value: 'porsi', label: 'porsi (Takaran Saji)' },
      { value: 'pcs', label: 'pcs (Buah / Potong)' },
      { value: 'butir', label: 'butir (Telur, Bakso, dll)' },
      { value: 'lembar', label: 'lembar (Keju Slice, Roti, Daun)' },
      { value: 'sachet', label: 'sachet' },
      { value: 'ikat', label: 'ikat (Sayuran)' },
      { value: 'batang', label: 'batang (Serai, Sosis, dll)' },
      { value: 'cup', label: 'cup (Gelas / Cup)' },
      { value: 'botol', label: 'botol' },
      { value: 'kaleng', label: 'kaleng' },
      { value: 'pack', label: 'pack (Bungkus)' },
    ],
  },
]

export const BASE_INGREDIENT_UNITS: readonly UnitGroup[] = [
  {
    group: 'Berat / Massa',
    options: [
      { value: 'kg', label: 'kg (Kilogram)' },
      { value: 'g', label: 'g (Gram)' },
      { value: 'ons', label: 'ons (100 gram)' },
    ],
  },
  {
    group: 'Volume / Cairan',
    options: [
      { value: 'liter', label: 'liter (1.000 ml)' },
      { value: 'ml', label: 'ml (Mililiter)' },
    ],
  },
  {
    group: 'Satuan Hitung / Eceran',
    options: [
      { value: 'pcs', label: 'pcs (Buah / Potong)' },
      { value: 'porsi', label: 'porsi' },
      { value: 'butir', label: 'butir' },
      { value: 'lembar', label: 'lembar (Slice)' },
      { value: 'sachet', label: 'sachet' },
      { value: 'ikat', label: 'ikat' },
      { value: 'batang', label: 'batang' },
      { value: 'cup', label: 'cup' },
      { value: 'botol', label: 'botol' },
      { value: 'kaleng', label: 'kaleng' },
      { value: 'pack', label: 'pack' },
    ],
  },
]

export const KITCHEN_STATION_OPTIONS: ReadonlyArray<{
  value: KitchenStationCode
  label: string
  outletHint: 'TSH-01' | 'TGR-01' | 'ALL'
}> = [
  { value: 'GRILL_STEAK', label: '🔥 Dapur Panggangan & Steak (Steak House)', outletHint: 'TSH-01' },
  { value: 'SIDES_PANTRY', label: '🥗 Dapur Camilan & Pendamping (Steak House)', outletHint: 'TSH-01' },
  { value: 'BEVERAGE_BAR', label: '🍹 Bar Minuman & Kopi (Steak House)', outletHint: 'TSH-01' },
  { value: 'BAKARAN_GORENG', label: '🐟 Dapur Bakaran & Gorengan (Garden Resto)', outletHint: 'TGR-01' },
  { value: 'DAPUR_NUSANTARA', label: '🍲 Dapur Masakan & Camilan Nusantara (Garden Resto)', outletHint: 'TGR-01' },
  { value: 'BAR_TRADISIONAL', label: '🥥 Bar Minuman & Kelapa (Garden Resto)', outletHint: 'TGR-01' },
  { value: 'EXPEDITER', label: '🛎️ Meja Cek Pesanan & Saji (Checker)', outletHint: 'ALL' },
  { value: 'NONE', label: '⚡ Tanpa Masuk Layar Dapur (Ambil Langsung di Kasir)', outletHint: 'ALL' },
]

export function getKitchenStationLabel(code?: string): string {
  if (!code) return 'Otomatis Layar Dapur'
  const match = KITCHEN_STATION_OPTIONS.find((opt) => opt.value === code.toUpperCase())
  return match ? match.label : code
}

export function suggestKitchenStation(outletCode: string, menuType: MenuType): KitchenStationCode {
  const oCode = outletCode.trim().toUpperCase()
  if (oCode === 'TGR-01') {
    if (menuType === 'BEVERAGE') return 'BAR_TRADISIONAL'
    if (menuType === 'SNACK') return 'DAPUR_NUSANTARA'
    return 'BAKARAN_GORENG'
  }
  if (menuType === 'BEVERAGE') return 'BEVERAGE_BAR'
  if (menuType === 'SNACK') return 'SIDES_PANTRY'
  return 'GRILL_STEAK'
}

const MASS_TO_GRAMS: Record<string, number> = {
  kg: 1000,
  ons: 100,
  g: 1,
  mg: 0.001,
}

const VOL_TO_ML: Record<string, number> = {
  liter: 1000,
  ml: 1,
  sdm: 15,
  sdt: 5,
}

export function isUnitInGroups(unit: string, groups: readonly UnitGroup[]): boolean {
  const target = unit.trim()
  if (!target) return false
  return groups.some((grp) => grp.options.some((opt) => opt.value === target))
}

export function normalizeHumanUnit(raw: string): string {
  const u = raw.trim().toLowerCase()
  switch (u) {
    case 'gram':
    case 'gr':
    case 'grams':
      return 'g'
    case 'kilogram':
    case 'kgs':
      return 'kg'
    case 'miligram':
      return 'mg'
    case 'l':
    case 'ltr':
    case 'litre':
      return 'liter'
    case 'mililiter':
    case 'cc':
      return 'ml'
    case 'tbsp':
    case 'sendok makan':
      return 'sdm'
    case 'tsp':
    case 'sendok teh':
      return 'sdt'
    case 'buah':
    case 'biji':
    case 'pc':
    case 'piece':
    case 'pieces':
    case 'potong':
      return 'pcs'
    case 'slice':
    case 'helai':
      return 'lembar'
    case 'btg':
      return 'batang'
    case 'btl':
      return 'botol'
    case 'portion':
    case 'prs':
    case 'saji':
      return 'porsi'
    case 'gelas':
      return 'cup'
    case 'bungkus':
    case 'pak':
      return 'pack'
    default:
      return u
  }
}

/**
 * Mirrors backend engine.ConvertUoMFactor for accurate real-time browser BOM previews.
 * Returns null if units are dimensionally incompatible.
 */
export function convertClientUoMFactor(
  fromUnit: string,
  toUnit: string,
  yieldOutputUnit?: string,
  yieldConversionRatio?: number,
): number | null {
  const from = normalizeHumanUnit(fromUnit)
  const to = normalizeHumanUnit(toUnit)
  if (!from || !to) return 1
  if (from === to) return 1

  const fromMass = MASS_TO_GRAMS[from]
  const toMass = MASS_TO_GRAMS[to]
  if (fromMass !== undefined && toMass !== undefined) {
    return fromMass / toMass
  }

  const fromVol = VOL_TO_ML[from]
  const toVol = VOL_TO_ML[to]
  if (fromVol !== undefined && toVol !== undefined) {
    return fromVol / toVol
  }

  if (yieldOutputUnit && yieldConversionRatio && yieldConversionRatio > 0) {
    const outUnit = normalizeHumanUnit(yieldOutputUnit)
    if (from === outUnit) {
      return 1 / yieldConversionRatio
    }
    const subFactor = convertClientUoMFactor(from, outUnit)
    if (subFactor !== null) {
      return subFactor / yieldConversionRatio
    }
  }

  return null
}

export function calculateRecommendedSellingPrice(
  hpa: number,
  targetFoodCostPct: number,
): { exactPrice: number; roundedThousand: number } {
  if (hpa <= 0 || targetFoodCostPct <= 0 || targetFoodCostPct >= 100) {
    return { exactPrice: 0, roundedThousand: 0 }
  }
  const exactPrice = Math.round((hpa / (targetFoodCostPct / 100)) * 100) / 100
  const roundedThousand = Math.ceil(exactPrice / 1000) * 1000
  return { exactPrice, roundedThousand }
}

export function formatRupiah(num: number, maxDecimals = 0): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: maxDecimals,
  }).format(Number.isFinite(num) ? num : 0)
}
