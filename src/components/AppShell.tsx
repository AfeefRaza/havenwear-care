import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Hourglass,
  Inbox as InboxIcon,
  Layers,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Search,
  Settings as SettingsIcon,
  Truck,
  User,
  UserX,
  Users,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useCounts } from '../data/queries'
import { ROLE_LABEL } from '../domain/labels'
import type { Counts } from '../domain/types'
import { useAuth } from '../lib/auth'
import { cn, modKey, useHotkeys } from '../lib/utils'
import { CommandPalette } from './CommandPalette'
import { Avatar, Button, Kbd, Menu, MenuItem, MenuSeparator } from './ui'

interface NavItem {
  to: string
  label: string
  icon: typeof InboxIcon
  count?: keyof Counts
  alert?: boolean
}

const QUEUES: NavItem[] = [
  { to: '/inbox/mine', label: 'My queue', icon: InboxIcon, count: 'mine' },
  { to: '/inbox/followups', label: 'Follow-ups due', icon: CalendarClock, count: 'followups', alert: true },
  { to: '/inbox/overdue', label: 'Overdue', icon: Hourglass, count: 'overdue', alert: true },
  { to: '/inbox/unassigned', label: 'Unassigned', icon: UserX, count: 'unassigned', alert: true },
  { to: '/inbox/serious', label: 'Serious', icon: AlertTriangle, count: 'serious' },
  { to: '/inbox/awaiting', label: 'Awaiting customer', icon: User, count: 'awaiting' },
  { to: '/inbox/all_open', label: 'All open', icon: Layers, count: 'open' },
  { to: '/inbox/resolved', label: 'Resolved', icon: CheckCircle2 },
]

const TOOLS: NavItem[] = [
  { to: '/watch', label: 'Delivery watch', icon: Truck, count: 'watch', alert: true },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
]

function NavRow({ item, counts, onNavigate }: { item: NavItem; counts?: Counts; onNavigate?: () => void }) {
  const n = item.count && counts ? counts[item.count] : 0
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
          isActive ? 'bg-hover text-text' : 'text-muted hover:bg-hover hover:text-text',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1 truncate">{item.label}</span>
      {n ? (
        <span
          className={cn(
            'tabular min-w-5 rounded-md px-1.5 text-center text-[11px] font-semibold',
            item.alert ? 'bg-bad-bg text-bad' : 'bg-surface-2 text-muted',
          )}
        >
          {n > 999 ? '999+' : n}
        </span>
      ) : null}
    </NavLink>
  )
}

function Sidebar({ onNavigate, onSearch }: { onNavigate?: () => void; onSearch: () => void }) {
  const { member, can, signOut } = useAuth()
  const navigate = useNavigate()
  const counts = useCounts().data
  return (
    <div className="flex h-full flex-col gap-1 px-2.5 py-3">
      <div className="mb-2 flex items-center gap-2 px-1.5">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-7 rounded-lg" />
        <div className="leading-tight">
          <div className="text-[14px] font-semibold tracking-tight">Havenwear Care</div>
          <div className="text-[11px] text-faint">Customer support desk</div>
        </div>
      </div>

      <div className="mb-2 flex gap-1.5">
        {can('agent') ? (
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={() => {
              onNavigate?.()
              navigate('/new')
            }}
          >
            <Plus className="size-4" /> New case <span className="ml-auto opacity-60">C</span>
          </Button>
        ) : null}
        <Button variant="secondary" size="icon" className="h-8 w-8" onClick={onSearch} aria-label="Search">
          <Search className="size-4" />
        </Button>
      </div>

      <nav aria-label="Queues" className="flex flex-col gap-0.5">
        {QUEUES.map((i) => (
          <NavRow key={i.to} item={i} counts={counts} onNavigate={onNavigate} />
        ))}
      </nav>
      <div className="mt-3 mb-1 px-2.5 text-[11px] font-semibold tracking-wide text-faint uppercase">Workspace</div>
      <nav aria-label="Workspace" className="flex flex-col gap-0.5">
        {TOOLS.map((i) => (
          <NavRow key={i.to} item={i} counts={counts} onNavigate={onNavigate} />
        ))}
        {can('admin') ? <NavRow item={{ to: '/settings/types', label: 'Settings', icon: SettingsIcon }} onNavigate={onNavigate} /> : null}
      </nav>

      <div className="mt-auto pt-2">
        <Menu
          align="start"
          trigger={
            <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-hover">
              <Avatar name={member?.full_name ?? member?.email} size={26} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-[13px] font-medium">{member?.full_name ?? member?.email}</span>
                <span className="block text-[11px] text-faint">{member ? ROLE_LABEL[member.role] : ''}</span>
              </span>
            </button>
          }
        >
          <MenuItem
            onSelect={() => {
              onNavigate?.()
              navigate('/account')
            }}
          >
            Account & preferences
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => void signOut()}>
            <span className="flex items-center gap-2">
              <LogOut className="size-3.5" /> Sign out
            </span>
          </MenuItem>
        </Menu>
      </div>
    </div>
  )
}

function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })
  if (!needRefresh) return null
  return (
    <div className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5 text-[13px] shadow-pop">
      A new version is available.
      <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
        Update
      </Button>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const navigate = useNavigate()
  const { can } = useAuth()
  const counts = useCounts().data

  // Browser tab shows what needs attention
  useEffect(() => {
    const n = (counts?.my_due ?? 0) + (counts?.unassigned ?? 0)
    document.title = n ? `(${n}) Havenwear Care` : 'Havenwear Care'
  }, [counts?.my_due, counts?.unassigned])

  useHotkeys({
    'mod+k': () => setPaletteOpen(true),
    '/': () => setPaletteOpen(true),
    c: () => can('agent') && navigate('/new'),
    g: () => navigate('/inbox/mine'),
  })

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-surface-2/60 md:block">
        <Sidebar onSearch={() => setPaletteOpen(true)} />
      </aside>

      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 md:hidden" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-72 border-r border-border bg-surface shadow-pop md:hidden" aria-describedby={undefined}>
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Sidebar onNavigate={() => setDrawer(false)} onSearch={() => setPaletteOpen(true)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setDrawer(true)} aria-label="Open menu">
            <MenuIcon className="size-4.5" />
          </Button>
          <span className="flex-1 text-[14px] font-semibold">Havenwear Care</span>
          <Button variant="ghost" size="icon-sm" onClick={() => setPaletteOpen(true)} aria-label="Search">
            <Search className="size-4" />
          </Button>
          {can('agent') ? (
            <Button variant="primary" size="icon-sm" onClick={() => navigate('/new')} aria-label="New case">
              <Plus className="size-4" />
            </Button>
          ) : null}
        </header>
        <main className="min-h-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <UpdateBanner />
      <span className="sr-only">
        Press <Kbd>{modKey}</Kbd>+<Kbd>K</Kbd> to search
      </span>
    </div>
  )
}
