import React from 'react'
import { Check, Loader } from 'lucide-react'
import { clsx } from 'clsx'
import type { Stage } from '../store'

const STEPS: Array<{ id: Stage; label: string }> = [
  { id: 'uploading', label: 'Upload' },
  { id: 'parsing', label: 'Parsing' },
  { id: 'ai', label: 'AI' },
  { id: 'generating', label: 'Generating' }
]

const ORDER: Stage[] = ['idle', 'uploading', 'parsing', 'ai', 'generating', 'ready']

function stageIndex(s: Stage): number {
  return ORDER.indexOf(s)
}

interface Props {
  stage: Stage
}

export default function ProgressStepper({ stage }: Props) {
  const currentIdx = stageIndex(stage)

  return (
    <div className="flex items-center gap-2 my-6">
      {STEPS.map((step, i) => {
        const stepIdx = stageIndex(step.id)
        const done = currentIdx > stepIdx || stage === 'ready'
        const active = currentIdx === stepIdx && stage !== 'ready' && stage !== 'error' && stage !== 'idle'

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={clsx(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                  done && 'bg-green-500 text-white',
                  active && 'bg-blue-500 text-white ring-4 ring-blue-500/30',
                  !done && !active && 'bg-slate-700 text-slate-400'
                )}
              >
                {done ? (
                  <Check size={16} />
                ) : active ? (
                  <Loader size={16} className="animate-spin" />
                ) : (
                  i + 1
                )}
              </div>
              <span className={clsx('text-xs', active ? 'text-blue-400' : done ? 'text-green-400' : 'text-slate-500')}>
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={clsx('flex-1 h-0.5 mb-4', done ? 'bg-green-500' : 'bg-slate-700')} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
