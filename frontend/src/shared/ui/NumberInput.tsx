import {
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { cn } from '@/shared/lib/cn'

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'prefix'> {
  value: number | undefined | null
  onChange: (value: number) => void
  allowEmptyOnBlur?: boolean
  allowDecimal?: boolean
  zeroAsEmptyOnFocus?: boolean
  prefix?: ReactNode
  suffix?: ReactNode
  wrapperClassName?: string
}

/**
 * Enterprise NumberInput component that eliminates common React numeric input UX pitfalls:
 * 1. Clears initial '0' automatically on focus (with placeholder '0') so '05000' never occurs.
 * 2. Auto-selects non-zero values on focus/click so typing immediately overwrites old numbers.
 * 3. Strips leading zeroes when followed by digits ('0500' -> '500').
 * 4. Preserves empty string and intermediate decimals ('4.', '4.0', '2,5' -> '2.5') in controlled parents.
 * 5. Prevents accidental scroll-wheel mutations and normalizes/clamps min-max cleanly on blur.
 */
export function NumberInput({
  value,
  onChange,
  allowEmptyOnBlur = false,
  allowDecimal = true,
  zeroAsEmptyOnFocus = true,
  prefix,
  suffix,
  wrapperClassName,
  className,
  placeholder,
  onFocus,
  onBlur,
  onMouseUp,
  min,
  max,
  ...rest
}: NumberInputProps) {
  const [displayValue, setDisplayValue] = useState<string>(() =>
    value === undefined || value === null ? '' : String(value),
  )
  const [prevPropValue, setPrevPropValue] = useState<number | undefined | null>(value)
  const [lastEmitted, setLastEmitted] = useState<number | undefined | null>(value)

  // Sync displayValue only when parent updates `value` externally (not merely echoing our own onChange)
  if (value !== prevPropValue) {
    setPrevPropValue(value)
    if (value !== lastEmitted) {
      setLastEmitted(value)
      setDisplayValue(value === undefined || value === null ? '' : String(value))
    }
  }

  const allowNegative = min === undefined || Number(min) < 0

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value

    if (allowDecimal) {
      raw = raw.replace(/,/g, '.')
    }

    // Allow user to clear completely to blank while editing
    if (raw === '' || (allowNegative && raw === '-')) {
      setDisplayValue(raw)
      setLastEmitted(0)
      onChange(0)
      return
    }

    // Normalize leading decimal dot: '.5' -> '0.5', '-.5' -> '-0.5'
    if (allowDecimal) {
      raw = raw.replace(/^(-?)\./, '$10.')
    }

    // Strip leading zeroes if followed by digits: '05' -> '5', '0500' -> '500', '-05' -> '-5'
    raw = raw.replace(/^(-?)0+(?=\d)/, '$1')

    const validPattern = allowDecimal
      ? allowNegative
        ? /^-?\d*\.?\d*$/
        : /^\d*\.?\d*$/
      : allowNegative
        ? /^-?\d*$/
        : /^\d*$/

    if (!validPattern.test(raw)) {
      return
    }

    setDisplayValue(raw)
    const parsed = Number(raw)
    if (!Number.isNaN(parsed)) {
      let clamped = parsed
      if (max !== undefined && clamped > Number(max)) {
        clamped = Number(max)
        raw = String(clamped)
        setDisplayValue(raw)
      }
      setLastEmitted(clamped)
      onChange(clamped)
    }
  }

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    if (zeroAsEmptyOnFocus && displayValue === '0') {
      setDisplayValue('')
    } else {
      e.currentTarget.select()
    }
    onFocus?.(e)
  }

  const handleMouseUp = (e: MouseEvent<HTMLInputElement>) => {
    // Keep non-zero text selected after click if user did not drag-select a substring
    if (
      document.activeElement === e.currentTarget &&
      displayValue !== '' &&
      e.currentTarget.selectionStart === e.currentTarget.selectionEnd
    ) {
      e.currentTarget.select()
    }
    onMouseUp?.(e)
  }

  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    if (displayValue === '' || displayValue === '-' || Number.isNaN(Number(displayValue))) {
      if (!allowEmptyOnBlur) {
        let fallback = 0
        if (min !== undefined && Number(min) > 0) fallback = Number(min)
        if (max !== undefined && fallback > Number(max)) fallback = Number(max)
        setDisplayValue(String(fallback))
        setLastEmitted(fallback)
        onChange(fallback)
      }
    } else {
      const num = Number(displayValue)
      let clamped = num
      if (min !== undefined && clamped < Number(min)) clamped = Number(min)
      if (max !== undefined && clamped > Number(max)) clamped = Number(max)
      setDisplayValue(String(clamped))
      setLastEmitted(clamped)
      onChange(clamped)
    }
    onBlur?.(e)
  }

  const inputElement = (
    <input
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={displayValue}
      placeholder={placeholder ?? '0'}
      onChange={handleChange}
      onFocus={handleFocus}
      onMouseUp={handleMouseUp}
      onBlur={handleBlur}
      className={cn(
        'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-semibold text-slate-900 transition-colors',
        'focus:border-emerald-600 focus:outline-hidden focus:ring-1 focus:ring-emerald-600',
        'disabled:cursor-not-allowed disabled:opacity-60',
        prefix ? 'pl-8' : '',
        suffix ? 'pr-12' : '',
        className,
      )}
      {...rest}
    />
  )

  if (!prefix && !suffix) {
    return inputElement
  }

  return (
    <div className={cn('relative flex w-full items-center', wrapperClassName)}>
      {prefix && (
        <span className="pointer-events-none absolute left-3 select-none text-xs font-semibold text-slate-400">
          {prefix}
        </span>
      )}
      {inputElement}
      {suffix && (
        <span className="pointer-events-none absolute right-3 select-none text-xs font-semibold text-slate-400">
          {suffix}
        </span>
      )}
    </div>
  )
}
