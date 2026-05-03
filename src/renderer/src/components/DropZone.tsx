import React, { useCallback, useState } from 'react'
import { Upload, FileText } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/ipc'
import { useStore } from '../store'

export default function DropZone() {
  const [dragging, setDragging] = useState(false)
  const { setPdfPath, stage } = useStore()
  const disabled = stage !== 'idle' && stage !== 'ready' && stage !== 'error'

  const handleFile = useCallback(
    (path: string) => {
      if (!path.toLowerCase().endsWith('.pdf')) {
        alert('Please select a PDF file.')
        return
      }
      setPdfPath(path)
    },
    [setPdfPath]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      if (disabled) return
      const file = e.dataTransfer.files[0]
      if (file) {
        // In Electron, dropped files have a path property
        const path = (file as File & { path?: string }).path ?? file.name
        handleFile(path)
      }
    },
    [disabled, handleFile]
  )

  const handleBrowse = useCallback(async () => {
    if (disabled) return
    const path = await api.openPdfDialog()
    if (path) handleFile(path)
  }, [disabled, handleFile])

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-2xl transition-all cursor-pointer select-none',
        dragging ? 'border-blue-400 bg-blue-900/20' : 'border-slate-600 hover:border-slate-400 bg-slate-800/30',
        disabled && 'opacity-40 pointer-events-none'
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={handleBrowse}
    >
      <div className="flex flex-col items-center gap-3 text-slate-400">
        {dragging ? (
          <FileText size={48} className="text-blue-400" />
        ) : (
          <Upload size={48} />
        )}
        <p className="text-lg font-medium text-slate-300">
          {dragging ? 'Drop PDF here' : 'Drop your PDF or click to browse'}
        </p>
        <p className="text-sm text-slate-500">Audited financial statements (Bangladesh IFRS)</p>
      </div>
    </div>
  )
}
