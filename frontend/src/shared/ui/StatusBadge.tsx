import { CircleAlert, CircleCheck, CircleHelp } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type Tone = 'success' | 'danger' | 'neutral'

const tones: Record<Tone, { box: string; Icon: typeof CircleCheck }> = {
  success: { box: 'bg-success-bg text-success-fg', Icon: CircleCheck },
  danger: { box: 'bg-danger-bg text-danger-fg', Icon: CircleAlert },
  neutral: { box: 'bg-ink-300/30 text-ink-700', Icon: CircleHelp },
}

/**
 * Status pill. Colour is never the only signal: every tone has its own icon and
 * a text label, so it stays readable for colour-blind users and in grayscale
 * printouts.
 */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  const { box, Icon } = tones[tone]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', box, className)}>
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  )
}
