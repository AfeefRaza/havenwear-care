export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'hw-care-theme'

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function setThemePref(p: ThemePref): void {
  try {
    if (p === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, p)
  } catch {
    /* storage blocked — theme still applies for this session */
  }
  applyTheme(p)
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function applyTheme(p: ThemePref = getThemePref()): void {
  const dark = p === 'dark' || (p === 'system' && !!media?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1013' : '#f6f6f4')
}

media?.addEventListener('change', () => {
  if (getThemePref() === 'system') applyTheme('system')
})
