import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        'glossy-card rounded-card border border-slate-200/85 bg-surface',
        className,
      )}
      {...rest}
    />
  )
}

interface CardHeaderProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export function CardHeader({ title, description, icon, action }: CardHeaderProps) {
  return (
    <header className="glossy-header flex items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-4 rounded-t-card">
      <div className="flex items-start gap-3">
        {icon ? (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-brand-200/70 bg-gradient-to-b from-brand-50 to-brand-100/70 text-brand-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(6,95,70,0.08)]">
            {icon}
          </span>
        ) : null}
        <div>
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-ink-500">{description}</p> : null}
        </div>
      </div>
      {action}
    </header>
  )
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 py-4', className)} {...rest} />
}

/** Label/value rows used for read-only detail lists. */
export function DescriptionList({ items }: { items: ReadonlyArray<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="divide-y divide-line">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="text-sm text-ink-500">{item.label}</dt>
          <dd className="tabular text-right text-sm font-medium text-ink-900">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
