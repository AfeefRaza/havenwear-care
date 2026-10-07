import { useState } from 'react'
import { useAddEvent, useUpdateCase } from '../../data/mutations'
import { useTemplates } from '../../data/queries'
import { COSTLY_RESOLUTIONS, RESOLUTION_LABEL, RESOLUTIONS } from '../../domain/labels'
import { renderTemplate } from '../../domain/templates'
import type { Case, Resolution } from '../../domain/types'
import { cn } from '../../lib/utils'
import { Button, Field, Input, Modal, Switch, Textarea } from '../ui'
import { openWhatsApp, useTemplateVars } from './Composer'

/** Suggests a resolution from the complaint type so most cases need one click. */
function suggest(typeLabel: string): Resolution {
  const t = typeLabel.toLowerCase()
  if (t.includes('size') || t.includes('wrong') || t.includes('exchange')) return 'exchange'
  if (t.includes('damaged') || t.includes('print') || t.includes('missing')) return 'reship'
  if (t.includes('late') || t.includes('courier')) return 'info_provided'
  return 'info_provided'
}

export function ResolveDialog({ c, typeLabel, open, onOpenChange }: { c: Case; typeLabel: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [resolution, setResolution] = useState<Resolution>(suggest(typeLabel))
  const [cost, setCost] = useState('')
  const [notes, setNotes] = useState('')
  const [thank, setThank] = useState(true)
  const update = useUpdateCase()
  const addEvent = useAddEvent()
  const thanks = (useTemplates().data ?? []).find((t) => t.active && t.category === 'resolution' && /thank/i.test(t.title))
  const vars = useTemplateVars(c)

  const save = async () => {
    try {
      await update.mutateAsync({
        id: c.id,
        patch: {
          status: 'resolved',
          resolution,
          resolution_cost: COSTLY_RESOLUTIONS.includes(resolution) ? Math.max(0, Number(cost) || 0) : 0,
          resolution_notes: notes.trim() || null,
        },
      })
      if (thank && thanks && c.phone) {
        const text = renderTemplate(thanks.body, vars)
        if (openWhatsApp(c.phone, text)) {
          addEvent.mutate({ case_id: c.id, kind: 'contact', body: text, meta: { channel: 'whatsapp', direction: 'out', template: thanks.title } })
        }
      }
      onOpenChange(false)
    } catch {
      /* toast from mutation */
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Resolve ${c.ref}`}
      description="How was it resolved? This feeds the resolution and cost reports."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={update.isPending}>
            Resolve case
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Resolution">
        {RESOLUTIONS.filter((r) => r !== 'no_response').map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={resolution === r}
            onClick={() => setResolution(r)}
            className={cn(
              'h-9 rounded-lg border px-3 text-left text-[13px] font-medium transition-colors',
              resolution === r ? 'border-accent bg-accent-bg text-accent' : 'border-border hover:bg-hover',
            )}
          >
            {RESOLUTION_LABEL[r]}
          </button>
        ))}
      </div>
      {COSTLY_RESOLUTIONS.includes(resolution) ? (
        <Field label="Cost to Havenwear (Rs)" hint="Refund amount, reshipping + courier, voucher value… Used in Insights." className="mt-4">
          <Input inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0" />
        </Field>
      ) : null}
      <Field label="Resolution notes" className="mt-4">
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What was done (e.g. exchange booked, new tracking 2…)" />
      </Field>
      {thanks && c.phone ? (
        <label className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px]">
          <span>
            Send “{thanks.title}” on WhatsApp
            <span className="block text-xs text-faint">Opens WhatsApp with the message ready and logs it.</span>
          </span>
          <Switch checked={thank} onChange={setThank} label="Send thank-you message" />
        </label>
      ) : null}
    </Modal>
  )
}
