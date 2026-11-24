'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import {
  CheckCircle2, Table2, LockKeyhole, FileText, RefreshCw, Pencil,
  Download, ChevronDown, ShieldCheck, AlertTriangle, Sparkles, Loader2, ArrowRight,
} from 'lucide-react';
import type { ExtractResult, TableData } from '@/types/table';

type Props = { fileKey: string; fileUrl?: string; fileName: string; totalPages: number };

const steps = [
  { label: 'Upload', icon: CheckCircle2, done: true },
  { label: 'Detect', icon: CheckCircle2, done: true },
  { label: 'Preview', icon: null, done: false, active: true },
  { label: 'Download', icon: LockKeyhole, done: false },
];

export function ExtractWorkspace({ fileKey, fileUrl, fileName, totalPages }: Props) {
  const [pageCount, setPageCount] = useState(totalPages);
  const [llmActive, setLlmActive] = useState<boolean | null>(null);
  const [tables, setTables] = useState<TableData[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [llmErrors, setLlmErrors] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TableData | null>(null);
  const [enableLlm, setEnableLlm] = useState(true);
  const [exporting, setExporting] = useState('');

  async function runExtract(useLlm: boolean) {
    setLoading(true);
    setError('');
    setLlmErrors([]);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: fileKey || undefined, url: fileUrl, fileName, enableLlm: useLlm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Extraction failed');
      const result = data as ExtractResult;
      setTables(result.tables);
      setSelectedId(result.tables[0]?.id ?? '');
      setLlmErrors(result.llmErrors ?? []);
      if (result.totalPages > 0) setPageCount(result.totalPages);
      setLlmActive((result.tables ?? []).some((t) => t.source !== 'rules') || !!result.llmUsage?.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void runExtract(true); }, []);

  const selected = tables.find((t) => t.id === selectedId) ?? null;
  const active = editing && draft ? draft : selected;

  function startEdit() {
    if (!selected) return;
    setDraft(structuredClone(selected));
    setEditing(true);
  }

  function saveEdit() {
    if (!draft) return;
    setTables((prev) => prev.map((t) => (t.id === draft.id ? draft : t)));
    setEditing(false);
    setDraft(null);
  }

  function updateCell(r: number, c: number, value: string) {
    if (!draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((row, ri) =>
        ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row
      );
      return { ...prev, rows };
    });
  }

  function deleteEmptyRows() {
    if (!draft) return;
    setDraft((prev) => prev ? { ...prev, rows: prev.rows.filter((row) => row.some((v) => v.trim())) } : prev);
  }

  function deleteEmptyColumns() {
    if (!draft) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const colCount = Math.max(prev.headers.length, ...prev.rows.map((r) => r.length));
      const keep = Array.from({ length: colCount }, (_, c) =>
        prev.headers[c]?.trim() || prev.rows.some((row) => row[c]?.trim())
      );
      return {
        ...prev,
        headers: prev.headers.filter((_, c) => keep[c]),
        rows: prev.rows.map((row) => row.filter((_, c) => keep[c])),
      };
    });
  }

  async function exportFile(format: 'xlsx' | 'csv') {
    if (!tables.length) return;
    setExporting(format);
    setError('');
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, tables, fileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Export failed');
      const a = document.createElement('a');
      a.href = data.url;
      a.download = data.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting('');
    }
  }

  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto"><Header secure /></div>

      <section className="max-w-6xl mx-auto px-6 py-6">
        <div className="card p-6">
          <div className="flex items-center justify-between border-b border-line pb-5">
            <div className="flex items-center gap-3">
              {steps.map((step, i) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] ${
                      step.done ? 'bg-primary text-white' : step.active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {step.icon ? <step.icon size={15} /> : 3}
                    </span>
                    <span className={`text-[13px] ${step.active ? 'text-primary' : step.done ? 'text-ink' : 'text-slate-400'}`}>{step.label}</span>
                  </div>
                  {i < steps.length - 1 && <div className="w-10 h-px bg-line" />}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 py-5 border-b border-line">
            <span className="w-11 h-11 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
              <FileText size={22} />
            </span>
            <div>
              <div className="text-[15px]">{fileName}</div>
              <div className="text-[12px] text-muted flex items-center gap-2">
                <span>{pageCount || '?'} pages · {tables.length} {tables.length === 1 ? 'table' : 'tables'} detected</span>
                {!loading && llmActive === false && (
                  <span className="text-amber bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                    Rule-only · AI not configured
                  </span>
                )}
                {!loading && llmActive === true && (
                  <span className="text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5">
                    AI assisted
                  </span>
                )}
              </div>
            </div>
            <a href="/" className="ml-auto text-[12px] text-primary flex items-center gap-1 hover:underline">
              <RefreshCw size={13} /> Change File
            </a>
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 text-[13px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertTriangle size={16} /> {error}
            </div>
          )}

          {llmErrors.length > 0 && (
            <div className="mt-4 text-[12px] text-warning bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2"><AlertTriangle size={14} /> AI assisted extraction had issues; showing rule-based results where available.</div>
              <ul className="list-disc pl-5 mt-1.5 space-y-0.5">
                {llmErrors.map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            </div>
          )}

          {loading ? (
            <div className="py-20 flex flex-col items-center gap-3 text-muted">
              <Loader2 size={30} className="animate-spin text-primary" />
              <span className="text-[13px]">Detecting tables from your PDF...</span>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-[240px_minmax(0,1fr)] gap-6 py-5">
                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[14px]">Detected Tables</h3>
                    <span className="text-[11px] text-muted">{tables.length} tables found</span>
                  </div>
                  <div className="space-y-2">
                    {tables.map((table) => (
                      <button
                        key={table.id}
                        onClick={() => { setSelectedId(table.id); setEditing(false); setDraft(null); }}
                        className={`w-full text-left border rounded-lg p-3 flex items-start gap-2.5 transition-colors ${
                          table.id === selectedId ? 'border-primary bg-blue-50' : 'border-line hover:border-slate-300'
                        }`}
                      >
                        <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center ${
                          table.id === selectedId ? 'bg-primary border-primary text-white' : 'border-slate-300'
                        }`}>
                          {table.id === selectedId && <CheckCircle2 size={12} />}
                        </span>
                        <Table2 size={16} className="mt-0.5 text-primary" />
                        <span>
                          <span className="block text-[13px]">{table.id.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                          <span className="block text-[11px] text-muted">Page {table.page} · {table.rowCount} rows · {table.columnCount} columns</span>
                          {table.source !== 'rules' && (
                            <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-violet-600">
                              <Sparkles size={10} /> AI assisted
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                    {!tables.length && !loading && (
                      <div className="text-[12px] text-muted space-y-2">
                        <p>No tables detected.</p>
                        {llmActive === false && (
                          <p className="text-warning text-[11px]">
                            AI assisted is not configured on the server. Enable LLM_API_KEY to detect tables in complex PDFs.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[14px]">Table Preview</h3>
                    {active && <span className="text-[11px] text-muted">Page {active.page}</span>}
                  </div>
                  {active ? (
                    <div className="overflow-x-auto border border-line rounded-lg max-w-full">
                      <table className="min-w-full w-max text-[12px] border-collapse">
                        <thead>
                          <tr className="bg-slate-50">
                            {(editing ? draft!.headers : active.headers).map((h, c) => (
                              <th key={c} className="border-b border-line text-left px-3 py-2.5 font-normal whitespace-nowrap">
                                {editing ? (
                                  <input
                                    value={draft!.headers[c]}
                                    onChange={(e) => setDraft((prev) => prev ? { ...prev, headers: prev.headers.map((v, i) => i === c ? e.target.value : v) } : prev)}
                                    className="w-full border border-line rounded px-1 py-0.5 bg-white"
                                  />
                                ) : h || `Column ${c + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(editing ? draft!.rows : active.rows).map((row, r) => (
                            <tr key={r} className="border-b border-line last:border-0">
                              {row.map((cell, c) => (
                                <td key={c} className="px-3 py-2 whitespace-nowrap">
                                  {editing ? (
                                    <input
                                      value={cell}
                                      onChange={(e) => updateCell(r, c, e.target.value)}
                                      className="w-full border border-transparent hover:border-line focus:border-primary rounded px-1 py-0.5"
                                    />
                                  ) : cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="border border-line rounded-lg h-40 flex items-center justify-center text-[12px] text-muted">Select a table to preview</div>
                  )}

                  {active?.warnings.length ? (
                    <div className="mt-3 space-y-1.5">
                      {active.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 text-[12px] text-warning bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 flex items-start gap-2 text-[12px] text-warning bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle size={14} className="mt-0.5" /> Please review the extracted data before exporting.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-line pt-5">
                {editing ? (
                  <>
                    <button className="btn-primary" onClick={saveEdit}>Save Changes</button>
                    <button className="btn-outline" onClick={deleteEmptyRows}>Delete Empty Rows</button>
                    <button className="btn-outline" onClick={deleteEmptyColumns}>Delete Empty Columns</button>
                    <button className="btn-outline" onClick={() => { setEditing(false); setDraft(null); }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn-outline" onClick={startEdit} disabled={!selected}><Pencil size={14} /> Edit Table</button>
                    <button className="btn-outline" onClick={() => void runExtract(enableLlm)}>
                      <RefreshCw size={14} /> Re-extract
                    </button>
                    <label className="flex items-center gap-1.5 text-[12px] text-muted ml-1 cursor-pointer">
                      <input type="checkbox" checked={enableLlm} onChange={(e) => setEnableLlm(e.target.checked)} className="accent-primary" />
                      AI assisted
                    </label>
                    <div className="ml-auto flex gap-3">
                      <button className="btn-primary" onClick={() => void exportFile('xlsx')} disabled={!!exporting}>
                        {exporting === 'xlsx' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export Excel <ChevronDown size={14} />
                      </button>
                      <button className="btn-outline" onClick={() => void exportFile('csv')} disabled={!!exporting}>
                        {exporting === 'csv' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export CSV
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
          <ShieldCheck size={20} className="text-primary mt-0.5 shrink-0" />
          <div className="flex-1">
            <div className="text-[13px]">Your Privacy Matters</div>
            <div className="text-[12px] text-muted">
              We don&apos;t store your files permanently. All files are automatically deleted after processing.
              When AI assisted is on, text items with page coordinates from uncertain pages are sent to DeepSeek for extraction.
            </div>
          </div>
          <a href="/privacy" className="text-[12px] text-primary flex items-center gap-1 shrink-0 hover:underline">Learn more <ArrowRight size={13} /></a>
        </div>
      </section>
    </main>
  );
}
