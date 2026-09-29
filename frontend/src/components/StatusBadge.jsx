import React from 'react'
import { CheckCircle, AlertTriangle, XCircle, MinusCircle } from 'lucide-react'

const config = {
  VERIFIED: {
    label: 'Verified',
    icon: CheckCircle,
    className: 'status-verified',
  },
  REVIEW: {
    label: 'Needs Review',
    icon: AlertTriangle,
    className: 'status-review',
  },
  NON_COMPLIANT: {
    label: 'Non-Compliant',
    icon: XCircle,
    className: 'status-noncompliant',
  },
  MISSING: {
    label: 'Missing',
    icon: MinusCircle,
    className: 'status-missing',
  },
}

export default function StatusBadge({ status, size = 'sm' }) {
  const cfg = config[status] || config.MISSING
  const Icon = cfg.icon
  const iconSize = size === 'lg' ? 14 : 12

  return (
    <span className={`status-badge ${cfg.className}`}>
      <Icon size={iconSize} />
      {cfg.label}
    </span>
  )
}

export function RiskBadge({ risk }) {
  const map = {
    LOW: 'bg-green-50 text-green-700 border border-green-200',
    MEDIUM: 'bg-amber-50 text-amber-700 border border-amber-200',
    HIGH: 'bg-red-50 text-red-700 border border-red-200',
  }
  return (
    <span className={`status-badge ${map[risk] || 'bg-gray-100 text-gray-500'}`}>
      {risk} RISK
    </span>
  )
}
