import * as Dialog from '@radix-ui/react-dialog'
import * as DM from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown, Loader2, X } from 'lucide-react'
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { initials } from '../domain/format'
import { cn } from '../lib/utils'

// ---------------------------------------------------------------- Button
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'outline'
type Size = 'xs' | 'sm' | 'md' | 'icon' | 'icon-sm'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:opacity-90 shadow-sm',
  accent: 'bg-accent text-white hover:opacity-90 shadow-sm',
  secondary: 'bg-surface text-text border border-border hover:bg-hover shadow-[0_1px_0_rgb(0_0_0/0.03)]',
  outline: 'border border-border text-text hover:bg-hover',
  ghost: 'text-muted hover:text-text hover:bg-hover',
  danger: 'bg-bad text-white hover:opacity-90',
}
const SIZE: Record<Size, string> = {
  xs: 'h-6 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-2.5 text-[13px] gap-1.5 rounded-lg',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-lg',
  icon: 'h-9 w-9 justify-center rounded-lg',
  'icon-sm': 'h-7 w-7 justify-center rounded-md',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center font-medium whitespace-nowrap transition-[background,opacity,color] select-none disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
})

// ---------------------------------------------------------------- Inputs
const field =
  'w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-faint transition-colors hover:border-border-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-[var(--c-ring)] disabled:opacity-60'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(field, 'h-9', className)} {...rest} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(field, 'min-h-20 py-2 leading-relaxed', className)} {...rest} />
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} className={cn(field, 'h-9 appearance-none pr-8')} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
    </div>
  )
})

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-faint">{hint}</span> : null}
    </label>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-accent' : 'bg-border-strong')}
    >
      <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}) {
  return (
    <div className={cn('inline-flex rounded-lg border border-border bg-surface-2 p-0.5', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
            value === o.value ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Display
export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info' | 'accent' | 'violet'
const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-border',
  ok: 'bg-ok-bg text-ok border-transparent',
  warn: 'bg-warn-bg text-warn border-transparent',
  bad: 'bg-bad-bg text-bad border-transparent',
  info: 'bg-info-bg text-info border-transparent',
  accent: 'bg-accent-bg text-accent border-transparent',
  violet: 'bg-violet-bg text-violet border-transparent',
}

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  )
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={cn('rounded-xl border border-border bg-surface', className)}>
      {title ? (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h3 className="text-[13px] font-semibold">{title}</h3>
          {action}
        </header>
      ) : null}
      {children}
    </section>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-sans text-[10px] font-medium text-muted">
      {children}
    </kbd>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-faint', className)} aria-label="Loading" />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface-2', className)} aria-hidden />
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon ? <div className="mb-1 rounded-xl bg-surface-2 p-3 text-faint">{icon}</div> : null}
      <p className="text-sm font-semibold">{title}</p>
      {children ? <div className="max-w-sm text-[13px] text-muted">{children}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

const AVATAR_COLORS = ['#b86a2c', '#2456c7', '#1d7a46', '#6b46c1', '#b3261e', '#0e7490', '#9a5b06']
export function Avatar({ name, size = 22, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const n = name ?? '?'
  let h = 0
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: AVATAR_COLORS[h % AVATAR_COLORS.length] }}
      aria-hidden
    >
      {initials(n)}
    </span>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'ok' | 'warn' }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn('tabular mt-1 text-[22px] font-semibold tracking-tight', tone === 'bad' && 'text-bad', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn')}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-faint">{sub}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------- Overlays
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in" />
        <Dialog.Content
          className={cn(
            'fixed top-[8vh] left-1/2 z-50 flex max-h-[84vh] w-[calc(100vw-24px)] -translate-x-1/2 flex-col rounded-2xl border border-border bg-surface shadow-pop data-[state=open]:animate-in',
            wide ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-2">
            <div>
              <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
              {description ? <Dialog.Description className="mt-0.5 text-[13px] text-muted">{description}</Dialog.Description> : null}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function Menu({ trigger, children, align = 'start' }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <DM.Root>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          sideOffset={4}
          className="scroll-thin z-50 max-h-[60vh] min-w-48 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-pop animate-in"
        >
          {children}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  )
}

export function MenuItem({
  children,
  onSelect,
  checked,
  danger,
  hint,
  disabled,
}: {
  children: ReactNode
  onSelect: () => void
  checked?: boolean
  danger?: boolean
  hint?: ReactNode
  disabled?: boolean
}) {
  return (
    <DM.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] outline-none select-none data-[disabled]:opacity-40 data-[highlighted]:bg-hover',
        danger && 'text-bad',
      )}
    >
      <span className="flex w-4 justify-center">{checked ? <Check className="size-3.5" /> : null}</span>
      <span className="flex-1 truncate">{children}</span>
      {hint ? <span className="text-xs text-faint">{hint}</span> : null}
    </DM.Item>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <DM.Label className="px-2 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-faint uppercase">{children}</DM.Label>
}

export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-border" />
