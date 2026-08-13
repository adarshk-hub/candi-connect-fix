'use client'

import { useState } from 'react'
import Link from 'next/link'
import { clsx } from 'clsx'
import {
  ArrowLeft,
  ListOrdered,
  Tags,
  Briefcase,
  Building2,
  FormInput,
  Users,
  ImageIcon,
  Rows3,
  Mail,
  MessageCircle,
  Radio,
} from 'lucide-react'
import LeadStagesPanel from './panels/LeadStagesPanel'
import OptionListPanel from './panels/OptionListPanel'
import LeadFormFieldsPanel from './panels/LeadFormFieldsPanel'
import CounsellorsPanel from './panels/CounsellorsPanel'
import LogoPanel from './panels/LogoPanel'
import DisplayPrefsPanel from './panels/DisplayPrefsPanel'
import EmailSettingsPanel from './panels/EmailSettingsPanel'
import WhatsAppSettingsPanel from './panels/WhatsAppSettingsPanel'
import ConversionsApiPanel from './panels/ConversionsApiPanel'

interface Institute {
  id: string
  name: string
}

const CATEGORIES = [
  { key: 'stages', label: 'Lead Stages', icon: ListOrdered },
  { key: 'lead_source', label: 'Lead Source', icon: Tags },
  { key: 'service', label: 'Services', icon: Briefcase },
  { key: 'company_type', label: 'Company Type', icon: Building2 },
  { key: 'fields', label: 'Lead Form Fields', icon: FormInput },
  { key: 'counsellors', label: 'Counsellors', icon: Users },
  { key: 'logo', label: 'Institute Logo', icon: ImageIcon },
  { key: 'email', label: 'School Email', icon: Mail },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'capi', label: 'Conversions API', icon: Radio },
  { key: 'display', label: 'Display Preferences', icon: Rows3 },
] as const

type CategoryKey = (typeof CATEGORIES)[number]['key']

export default function CustomizeShell({
  institutes,
  lockedToClientId,
}: {
  institutes: Institute[]
  lockedToClientId: string | null
}) {
  const [clientId, setClientId] = useState(lockedToClientId || institutes[0]?.id || '')
  const [active, setActive] = useState<CategoryKey>('stages')

  if (!clientId) {
    return <p className="text-muted">No institution to customize yet.</p>
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/settings" className="flex items-center gap-1.5 text-sm text-muted2 hover:text-fg">
          <ArrowLeft size={16} /> Settings
        </Link>
        <h1 className="text-2xl font-bold text-fg">Customize</h1>
      </div>

      {!lockedToClientId && institutes.length > 1 && (
        <div className="mb-6">
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Institution</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-72 rounded-md border border-border bg-card2 px-3 py-2 text-sm text-fg outline-none focus:border-blue-500"
          >
            {institutes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-6">
        <nav className="w-56 shrink-0 space-y-1">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setActive(c.key)}
              className={clsx(
                'flex w-full items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-left text-sm transition-colors',
                active === c.key
                  ? 'border-blue-500 bg-blue-500/10 font-medium text-fg'
                  : 'border-transparent text-muted2 hover:bg-card2 hover:text-fg'
              )}
            >
              <c.icon size={16} />
              {c.label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {active === 'stages' && <LeadStagesPanel clientId={clientId} />}
          {active === 'lead_source' && <OptionListPanel clientId={clientId} listKey="lead_source" title="Lead Source" />}
          {active === 'service' && <OptionListPanel clientId={clientId} listKey="service" title="Services (Requirement Options)" />}
          {active === 'company_type' && <OptionListPanel clientId={clientId} listKey="company_type" title="Company Type" />}
          {active === 'fields' && <LeadFormFieldsPanel clientId={clientId} />}
          {active === 'counsellors' && <CounsellorsPanel clientId={clientId} />}
          {active === 'logo' && <LogoPanel clientId={clientId} />}
          {active === 'email' && <EmailSettingsPanel clientId={clientId} />}
          {active === 'whatsapp' && <WhatsAppSettingsPanel clientId={clientId} />}
          {active === 'capi' && <ConversionsApiPanel clientId={clientId} />}
          {active === 'display' && <DisplayPrefsPanel clientId={clientId} />}
        </div>
      </div>
    </div>
  )
}
