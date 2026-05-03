import React from 'react'
import { Download, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import type { ResultData } from '../store'
import { api } from '../lib/ipc'

interface Props {
  result: ResultData
  onReset: () => void
}

export default function DownloadCard({ result, onReset }: Props) {
  const { filename, buffer, validationMismatches } = result
  const sizeKb = Math.round(buffer.byteLength / 1024)

  const handleSave = async () => {
    await api.saveExcel(filename, buffer)
  }

  return (
    <div className="bg-slate-800/50 rounded-2xl border border-slate-600 p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="bg-green-500/10 rounded-full p-3">
          <CheckCircle size={28} className="text-green-400" />
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-100">{filename}</p>
          <p className="text-sm text-slate-400">{sizeKb} KB &middot; 3 tabs</p>
        </div>
      </div>

      <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${validationMismatches === 0 ? 'bg-green-900/30 text-green-300' : 'bg-amber-900/30 text-amber-300'}`}>
        {validationMismatches === 0 ? (
          <>
            <CheckCircle size={16} />
            All validation checks passed
          </>
        ) : (
          <>
            <AlertTriangle size={16} />
            {validationMismatches} mismatch{validationMismatches !== 1 ? 'es' : ''} found — see Validation tab
          </>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-6 rounded-xl transition-colors"
        >
          <Download size={18} />
          Save Excel File
        </button>
        <button
          onClick={onReset}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium py-3 px-4 rounded-xl transition-colors"
          title="Process another PDF"
        >
          <RefreshCw size={18} />
        </button>
      </div>
    </div>
  )
}
