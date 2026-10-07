import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ImportedCase } from '../domain/importSheet'
import type { Case, CaseEvent, CaseItem, Channel, CustomerProfile, Member, Role, Severity, Status, WatchOutcome } from '../domain/types'
import { useAuth } from '../lib/auth'
import { assertOnline, edge, errorMessage, rpc, supabase } from '../lib/supabase'
import { qk } from './queries'

async function run<T>(p: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(errorMessage(error))
  return data as T
}

/** After any case change: refresh lists + badges, keep the detail cache exact. */
function afterCaseChange(qc: QueryClient, c?: Case) {
  if (c) qc.setQueryData(qk.case(c.id), c)
  void qc.invalidateQueries({ queryKey: qk.cases })
  void qc.invalidateQueries({ queryKey: qk.counts })
  if (c) {
    void qc.invalidateQueries({ queryKey: qk.events(c.id) })
    if (c.phone_key) void qc.invalidateQueries({ queryKey: qk.customer(c.phone_key) })
    if (c.order_id) void qc.invalidateQueries({ queryKey: qk.order(c.order_id) })
  }
}

export interface NewCase {
  received_at?: string
  channel: Channel
  order_id: number | null
  order_name: string | null
  customer_name: string | null
  phone: string | null
  city: string | null
  items: CaseItem[]
  courier: string | null
  tracking_number: string | null
  type_id: number | null
  severity: Severity
  description: string
  assignee: string | null
  tags: string[]
  status?: Status
}

export function useCreateCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewCase) => {
      assertOnline()
      return run<Case>(supabase.from('crm_cases').insert(input).select('*').single())
    },
    onSuccess: (c) => afterCaseChange(qc, c),
  })
}

export type CasePatch = Partial<
  Pick<
    Case,
    | 'status'
    | 'assignee'
    | 'follow_up_at'
    | 'type_id'
    | 'severity'
    | 'resolution'
    | 'resolution_cost'
    | 'resolution_notes'
    | 'tags'
    | 'description'
    | 'customer_name'
    | 'phone'
    | 'city'
    | 'order_name'
    | 'order_id'
    | 'items'
    | 'courier'
    | 'tracking_number'
    | 'channel'
  >
>

export function useUpdateCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: CasePatch }) => {
      assertOnline()
      return run<Case>(supabase.from('crm_cases').update(patch).eq('id', id).select('*').single())
    },
    // Optimistic: the detail view updates instantly; rolled back on error.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: qk.case(id) })
      const prev = qc.getQueryData<Case>(qk.case(id))
      if (prev) qc.setQueryData(qk.case(id), { ...prev, ...patch })
      return { prev }
    },
    onError: (err, { id }, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.case(id), ctx.prev)
      toast.error(errorMessage(err))
    },
    onSuccess: (c) => afterCaseChange(qc, c),
  })
}

export function useBulkUpdate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: number[]; patch: CasePatch }) => {
      assertOnline()
      return run<Case[]>(supabase.from('crm_cases').update(patch).in('id', ids).select('id'))
    },
    onSuccess: (_d, { ids }) => {
      ids.forEach((id) => void qc.invalidateQueries({ queryKey: qk.case(id) }))
      afterCaseChange(qc)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useDeleteCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      assertOnline()
      const files = await run<{ path: string }[]>(supabase.from('crm_attachments').select('path').eq('case_id', id))
      if (files.length) await supabase.storage.from('crm-attachments').remove(files.map((f) => f.path))
      await run(supabase.from('crm_cases').delete().eq('id', id))
    },
    onSuccess: () => afterCaseChange(qc),
  })
}

export function useAddEvent() {
  const qc = useQueryClient()
  const { member } = useAuth()
  return useMutation({
    mutationFn: async (e: { case_id: number; kind: 'note' | 'contact'; body?: string | null; meta?: Record<string, unknown> }) => {
      assertOnline()
      return run<CaseEvent>(
        supabase
          .from('crm_case_events')
          .insert({ case_id: e.case_id, kind: e.kind, body: e.body ?? null, meta: e.meta ?? {}, actor: member?.user_id })
          .select('*')
          .single(),
      )
    },
    onMutate: async (e) => {
      // Show the note immediately in the timeline
      const key = qk.events(e.case_id)
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<CaseEvent[]>(key)
      const temp: CaseEvent = {
        id: -Date.now(),
        case_id: e.case_id,
        kind: e.kind,
        body: e.body ?? null,
        meta: e.meta ?? {},
        actor: member?.user_id ?? null,
        created_at: new Date().toISOString(),
      }
      qc.setQueryData(key, [...(prev ?? []), temp])
      return { prev }
    },
    onError: (err, e, ctx) => {
      qc.setQueryData(qk.events(e.case_id), ctx?.prev)
      toast.error(errorMessage(err))
    },
    onSettled: (_d, _e, v) => {
      // Contacts can move the status (open → in progress, customer replied → in progress)
      void qc.invalidateQueries({ queryKey: qk.events(v.case_id) })
      void qc.invalidateQueries({ queryKey: qk.case(v.case_id) })
      void qc.invalidateQueries({ queryKey: qk.cases })
      void qc.invalidateQueries({ queryKey: qk.counts })
    },
  })
}

/** Resize + re-encode in the browser so photos are ~100–300 KB instead of 3–6 MB. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality))
  if (blob && blob.type === 'image/webp') return blob
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not process image'))), 'image/jpeg', quality))
}

export function useUploadAttachments() {
  const qc = useQueryClient()
  const { member } = useAuth()
  return useMutation({
    mutationFn: async ({ caseId, files }: { caseId: number; files: File[] }) => {
      assertOnline()
      for (const file of files.slice(0, 8)) {
        if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`)
        const blob = await compressImage(file)
        const ext = blob.type === 'image/webp' ? 'webp' : 'jpg'
        const path = `cases/${caseId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const up = await supabase.storage.from('crm-attachments').upload(path, blob, { contentType: blob.type, upsert: false })
        if (up.error) throw new Error(errorMessage(up.error))
        await run(
          supabase.from('crm_attachments').insert({ case_id: caseId, path, mime: blob.type, size_bytes: blob.size, created_by: member?.user_id }),
        )
      }
      await run(
        supabase.from('crm_case_events').insert({
          case_id: caseId,
          kind: 'attachment',
          body: `${files.length} photo${files.length > 1 ? 's' : ''} added`,
          actor: member?.user_id,
        }),
      )
    },
    onSuccess: (_d, { caseId }) => {
      void qc.invalidateQueries({ queryKey: qk.attachments(caseId) })
      void qc.invalidateQueries({ queryKey: qk.events(caseId) })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useDeleteAttachment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, path }: { id: number; path: string; caseId: number }) => {
      assertOnline()
      await supabase.storage.from('crm-attachments').remove([path])
      await run(supabase.from('crm_attachments').delete().eq('id', id))
    },
    onSuccess: (_d, { caseId }) => void qc.invalidateQueries({ queryKey: qk.attachments(caseId) }),
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useSaveProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: Pick<CustomerProfile, 'phone_key' | 'flag' | 'tags' | 'note'>) => {
      assertOnline()
      return run<CustomerProfile>(supabase.from('crm_customer_profiles').upsert(p).select('*').single())
    },
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: qk.customer(p.phone_key) })
      toast.success('Customer profile saved')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useLogDelivery() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { shipment_id: number; outcome: WatchOutcome; note?: string | null }) => {
      assertOnline()
      return rpc<void>('crm_log_delivery_contact', { p_shipment_id: v.shipment_id, p_outcome: v.outcome, p_note: v.note ?? null })
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.watch })
      void qc.invalidateQueries({ queryKey: qk.counts })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

// ---------------------------------------------------------------- admin
export function useSaveRow(table: 'crm_complaint_types' | 'crm_templates', key: readonly unknown[]) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      assertOnline()
      const { id, ...rest } = row
      if (id) return run(supabase.from(table).update(rest).eq('id', id as number))
      return run(supabase.from(table).insert(rest))
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key })
      toast.success('Saved')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useSaveSetting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: unknown }) => {
      assertOnline()
      return run(supabase.from('crm_settings').update({ value }).eq('key', key))
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.settings }),
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useUpdateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ user_id, ...patch }: Partial<Member> & { user_id: string }) => {
      assertOnline()
      return run(supabase.from('crm_members').update(patch).eq('user_id', user_id))
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.members }),
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useCreateMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { email: string; full_name: string; role: Role; password: string }) => {
      assertOnline()
      return edge<{ user_id: string; existing: boolean }>('crm-admin', { action: 'create_user', ...v })
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.members }),
  })
}

export function useSetPassword() {
  return useMutation({
    mutationFn: (v: { user_id: string; password: string }) => {
      assertOnline()
      return edge<{ ok: true }>('crm-admin', { action: 'set_password', ...v })
    },
  })
}

export function useImportCases() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ rows, onProgress }: { rows: ImportedCase[]; onProgress?: (done: number) => void }) => {
      assertOnline()
      let done = 0
      for (let i = 0; i < rows.length; i += 200) {
        await run(supabase.from('crm_cases').insert(rows.slice(i, i + 200)))
        done = Math.min(rows.length, i + 200)
        onProgress?.(done)
      }
      return done
    },
    onSuccess: () => afterCaseChange(qc),
  })
}
