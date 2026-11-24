'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, FileText, Loader2 } from 'lucide-react';

export function Dropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  async function handleFile(selected: File) {
    setError('');
    if (selected.type !== 'application/pdf' && !selected.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are allowed');
      setStatus('error');
      return;
    }
    if (selected.size > 20 * 1024 * 1024) {
      setError('File exceeds 20 MB limit');
      setStatus('error');
      return;
    }
    setFile(selected);
    setStatus('uploading');
    try {
      const configRes = await fetch('/api/config');
      const config = await configRes.json();

      let key: string, url: string, fileName: string, totalPages: number;
      if (config.uploadMode === 'blob') {
        const { upload } = await import('@vercel/blob/client');
        const blob = await upload(selected.name, selected, {
          access: 'public',
          handleUploadUrl: '/api/upload/token',
          contentType: 'application/pdf',
        });
        key = blob.pathname;
        url = blob.url;
        fileName = selected.name;
        totalPages = 0;
      } else {
        const formData = new FormData();
        formData.append('file', selected);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Upload failed');
        key = data.key;
        url = data.url;
        fileName = data.fileName;
        totalPages = data.totalPages ?? 0;
      }

      const params = new URLSearchParams({ name: fileName, pages: String(totalPages) });
      if (config.uploadMode === 'blob') params.set('url', url);
      else params.set('key', key);
      router.push(`/extract?${params.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setStatus('error');
    }
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl text-center px-6 py-10 transition-colors ${
        dragging ? 'border-primary bg-blue-50' : 'border-slate-300 bg-[#FBFCFF]'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) void handleFile(dropped);
      }}
    >
      <div className="mx-auto w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-primary mb-4">
        {status === 'uploading' ? <Loader2 size={34} className="animate-spin" /> : <UploadCloud size={34} />}
      </div>
      <div className="text-[15px]">Drag &amp; drop your PDF here</div>
      <div className="text-[13px] text-muted mt-1">or choose a file from your computer</div>
      <button className="btn-primary mt-5" onClick={() => inputRef.current?.click()} disabled={status === 'uploading'}>
        Choose PDF File
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (selected) void handleFile(selected);
        }}
      />
      {status === 'uploading' && file && (
        <div className="mt-4 text-[12px] text-muted flex items-center justify-center gap-2">
          <FileText size={14} /> Processing {file.name}...
        </div>
      )}
      {status === 'error' && <div className="mt-4 text-[12px] text-red-600">{error}</div>}
      <div className="text-[11px] text-slate-400 mt-4">PDF only · Up to 20 MB · Max 50 pages</div>
    </div>
  );
}
