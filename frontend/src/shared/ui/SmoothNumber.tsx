import { useEffect, useState, useRef } from 'react'
import { formatIDR } from '@/shared/utils/currency'

export interface SmoothNumberProps {
  value: number
  format?: 'idr' | 'percent' | 'number'
  decimals?: number
  duration?: number
  prefix?: string
  suffix?: string
  className?: string
}

/**
 * SmoothNumber - Ultra-smooth rolling animated counter (V14 Standard)
 * Animates numbers using an Ease-Out Expo curve at 60/120fps.
 * Instantly renders in test/headless environments for test reliability.
 */
export function SmoothNumber({
  value,
  format = 'idr',
  decimals = 1,
  duration = 900,
  prefix = '',
  suffix = '',
  className = '',
}: SmoothNumberProps) {
  const env = (
    globalThis as unknown as { process?: { env?: { NODE_ENV?: string; VITEST?: string } } }
  ).process?.env
  const isTest = env?.NODE_ENV === 'test' || Boolean(env?.VITEST)

  const [displayValue, setDisplayValue] = useState<number>(isTest ? value : 0)
  const prevValueRef = useRef<number>(isTest ? value : 0)
  const animRef = useRef<number | null>(null)

  useEffect(() => {
    if (isTest || typeof window === 'undefined') {
      prevValueRef.current = value
      return
    }

    const startVal = prevValueRef.current
    const diff = value - startVal
    if (diff === 0) {
      animRef.current = requestAnimationFrame(() => {
        setDisplayValue(value)
      })
      return
    }

    let startTime: number | null = null

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const elapsed = timestamp - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Ease-out expo easing curve for natural physical inertia
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      const current = startVal + diff * ease

      prevValueRef.current = current
      setDisplayValue(current)

      if (progress < 1) {
        animRef.current = requestAnimationFrame(step)
      } else {
        prevValueRef.current = value
        setDisplayValue(value)
      }
    }

    animRef.current = requestAnimationFrame(step)

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current)
        animRef.current = null
      }
    }
  }, [value, duration, isTest])

  const targetNum = isTest ? value : displayValue

  let formatted: string
  if (format === 'idr') {
    formatted = formatIDR(Math.round(targetNum))
  } else if (format === 'percent') {
    formatted = `${targetNum.toFixed(decimals)}%`
  } else {
    formatted = Math.round(targetNum).toLocaleString('id-ID')
  }

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}
