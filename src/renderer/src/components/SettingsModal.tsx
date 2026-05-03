import React, { useState, useEffect } from 'react'
import { X, Check, Loader, Eye, EyeOff } from 'lucide-react'
import { api } from '../lib/ipc'

interface Props {
  onClose: () => void
}

type TestState = 'idle' | 'testing' | 'ok' | 'error'

function KeyRow({
  service,
  label
}: {
  service: 'anthropic' | 'llamaparse'
  label: string
}) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testState, setTestState] = useState<TestState>('idle')
  const [testError, setTestError] = useState('')

  useEffect(() => {
    api.secrets.get(service).then((masked) => {
      if (masked) setValue(masked)
    })
  }, [service])

  const handleSave = async () => {
    if (!value || value.startsWith('•')) return
    await api.secrets.set(service, value)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleTest = async () => {
    setTestState('testing')
    setTestError('')
    const result = await api.secrets.test(service)
    setTestState(result.ok ? 'ok' : 'error')
    if (!result.ok) setTestError(result.error ?? 'Unknown error')
    setTimeout(() => setTestState('idle'), 3000)
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-slate-300">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste your API key..."
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 pr-10 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setShow(!show)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button
          onClick={handleSave}
          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors"
        >
          {saved ? <Check size={16} className="text-green-400" /> : 'Save'}
        </button>
        <button
          onClick={handleTest}
          disabled={testState === 'testing'}
          className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-slate-300 transition-colors disabled:opacity-50"
        >
          {testState === 'testing' ? (
            <Loader size={16} className="animate-spin" />
          ) : testState === 'ok' ? (
            <Check size={16} className="text-green-400" />
          ) : (
            'Test'
          )}
        </button>
      </div>
      {testState === 'error' && (
        <p className="text-xs text-red-400">{testError}</p>
      )}
    </div>
  )
}

export default function SettingsModal({ onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-2xl border border-slate-600 p-6 w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-100">API Settings</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          <KeyRow service="anthropic" label="Anthropic API Key" />
          <KeyRow service="llamaparse" label="LlamaParse API Key" />
        </div>

        <p className="mt-5 text-xs text-slate-500">
          Keys are stored encrypted using your OS keychain. They never leave your machine.
        </p>
      </div>
    </div>
  )
}
