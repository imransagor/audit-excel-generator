import React, { useEffect, useRef } from 'react'
import type { LogEntry } from '../store'

interface Props {
  logs: LogEntry[]
}

export default function LogTerminal({ logs }: Props) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  return (
    <div className="bg-[#0d1117] rounded-xl border border-slate-700 p-4 h-56 overflow-y-auto font-mono text-xs leading-relaxed text-slate-300 select-text">
      {logs.length === 0 ? (
        <span className="text-slate-600">Waiting for pipeline to start...</span>
      ) : (
        logs.map((entry) => (
          <div key={entry.id} className="whitespace-pre-wrap break-all">
            <span className="text-slate-600">[{entry.stage}] </span>
            {entry.message}
          </div>
        ))
      )}
      <div ref={endRef} />
    </div>
  )
}
