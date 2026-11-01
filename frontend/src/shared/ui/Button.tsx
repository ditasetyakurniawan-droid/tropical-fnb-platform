import { LoaderCircle } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  /** `lg` meets the 44px touch-target minimum used on POS/KDS screens. */
  size?: Size
  /** Shows a spinner and blocks clicks, preventing double submits. */
  loading?: boolean
  icon?: ReactNode
}

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-brand-500 to-brand-700 text-white border border-brand-700/80 hover:from-brand-500 hover:to-brand-600 active:from-brand-700 active:to-brand-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_2px_8px_-1px_rgba(6,95,70,0.28)] font-bold',
  secondary:
    'bg-gradient-to-b from-white to-slate-100 text-slate-800 border border-slate-300/90 hover:from-slate-50 hover:to-slate-200/80 active:bg-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.06)] font-semibold',
  outline:
    'bg-gradient-to-b from-white to-slate-50/90 text-slate-800 border border-slate-300/90 hover:border-slate-400 hover:from-white hover:to-slate-100/80 active:bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_1px_2px_rgba(15,23,42,0.05)] font-semibold',
  ghost: 'text-slate-700 hover:bg-slate-100/90 active:bg-slate-200/80 font-medium',
  danger:
    'bg-gradient-to-b from-rose-500 to-rose-700 text-white border border-rose-700/80 hover:from-rose-500 hover:to-rose-600 active:from-rose-700 active:to-rose-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_2px_8px_-1px_rgba(190,18,60,0.28)] font-bold',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 active:translate-y-[0.5px]',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}
