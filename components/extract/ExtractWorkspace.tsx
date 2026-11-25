'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import { RichCell } from './RichCell';
import { TableHeader } from './TableHeader';
import {
  CheckCircle2, Table2, LockKeyhole, FileText, RefreshCw, Pencil,
  Download, ChevronDown, ShieldCheck, AlertTriangle, Sparkles, Loader2, ArrowRight,
} from 'lucide-react';
import type { ExtractResult, TableData } from '@/types/table';
import { assessTable } from '@/lib/review/confidence';

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
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  function markReviewed(id: string) {
    setReviewedIds((prev) => new Set(prev).add(id));
  }

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
      setReviewedIds(new Set());
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

  // Review queue: tables most likely to be wrong first, reviewed ones last.
  const sortedTables = [...tables].sort((a, b) => {
    const ar = reviewedIds.has(a.id) ? 1 : 0;
    const br = reviewedIds.has(b.id) ? 1 : 0;
    if (ar !== br) return ar - br;
    return assessTable(a).score - assessTable(b).score;
  });
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
    markReviewed(draft.id);
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

  function buildReviewPayload() {
    return {
      sourceFile: fileName,
      exportedAt: new Date().toISOString(),
      tables: tables.filter((t) => reviewedIds.has(t.id)).map((t) => ({
        ...t,
        review: { ...assessTable(t), reviewedAt: new Date().toISOString() },
      })),
    };
  }

  function exportReviewSet() {
    const payload = buildReviewPayload();
    if (!payload.tables.length) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName.replace(/\.pdf$/i, '')}-reviewed.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function submitReviewSet() {
    const payload = buildReviewPayload();
    if (!payload.tables.length) return;
    setExporting('feedback');
    setError('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceFile: payload.sourceFile, tables: payload.tables }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit feedback');
      setReviewedIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit feedback');
    } finally { setExporting(''); }
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
                    {sortedTables.map((table) => {
                      const review = assessTable(table);
                      const isReviewed = reviewedIds.has(table.id);
                      return (
                      <button
                        key={table.id}
                        onClick={() => { setSelectedId(table.id); setEditing(false); setDraft(null); }}
                        className={`w-full text-left border rounded-lg p-3 flex items-start gap-2.5 transition-colors ${
                          table.id === selectedId ? 'border-primary bg-blue-50' : 'border-line hover:border-slate-300'
                        } ${review.level === 'low' && !isReviewed ? 'border-l-2 border-l-rose-400' : ''}`}
                      >
                        <span className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center ${
                          isReviewed ? 'bg-emerald-500 border-emerald-500 text-white'
                          : table.id === selectedId ? 'bg-primary border-primary text-white' : 'border-slate-300'
                        }`}>
                          {(isReviewed || table.id === selectedId) && <CheckCircle2 size={12} />}
                        </span>
                        <Table2 size={16} className="mt-0.5 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px]">{table.id.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</span>
                          <span className="block text-[11px] text-muted">Page {table.page} · {table.rowCount} rows · {table.columnCount} columns</span>
                          <span className="flex flex-wrap items-center gap-1 mt-1">
                            {review.level === 'low' && !isReviewed && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 text-rose-700">Needs review</span>
                            )}
                            {review.level === 'medium' && !isReviewed && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">Check</span>
                            )}
                            {isReviewed && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">Reviewed</span>
                            )}
                            {table.source !== 'rules' && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-violet-600">
                                <Sparkles size={10} /> AI assisted
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                      );
                    })}
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
                          <TableHeader
                            headerRows={active.headerRows}
                            headerRowsRich={active.headerRowsRich}
                            headers={active.headers}
                            headersRich={active.headersRich}
                            columnCount={active.columnCount}
                            editing={editing}
                            draftHeaders={draft?.headers}
                            onEdit={(c, value) => setDraft((prev) =>
                              prev ? { ...prev, headers: prev.headers.map((v, i) => i === c ? value : v) } : prev
                            )}
                          />
                        </thead>
                        <tbody>
                          {(editing ? draft!.rows : active.rows).map((row, r) => {
                            const isGroupTitle = !editing && row[0]?.trim() &&
                              row.slice(1).every((v) => !v?.trim()) &&
                              /[+()]|no |Reduction/i.test(row[0].trim()) &&
                              /[A-Za-z]/.test(row[0].trim());
                            if (isGroupTitle) {
                              return (
                                <tr key={r} className="border-b border-line">
                                  <td colSpan={active.columnCount} className="px-3 py-2 text-center font-normal text-muted">
                                    <RichCell text={active.rowsRich?.[r]?.[0] ?? row[0]} />
                                  </td>
                                </tr>
                              );
                            }
                            return (
                            <tr key={r} className="border-b border-line last:border-0">
                              {row.map((cell, c) => {
                                if (!editing && c === 0 && cell && !/^[\d.,%+\-]+$/.test(cell)) {
                                  // A cell is covered when any row above (in the
                                  // same run of equal values) already started the
                                  // rowSpan — not only the immediately previous row.
                                  let coveredAbove = false;
                                  for (let i = r - 1; i >= 0 && active.rows[i][0] === cell; i--) {
                                    coveredAbove = true;
                                  }
                                  if (coveredAbove) return null;
                                  let span = 1;
                                  while (
                                    r + span < active.rows.length &&
                                    active.rows[r + span][0] === cell
                                  ) span++;
                                  if (span > 1) {
                                    return (
                                      <td key={c} rowSpan={span} className="px-3 py-2 whitespace-nowrap text-center align-middle">
                                        <RichCell text={active.rowsRich?.[r]?.[c] ?? cell} />
                                      </td>
                                    );
                                  }
                                }
                                return (
                                  <td key={c} className="px-3 py-2 whitespace-nowrap text-center">
                                    {editing ? (
                                      <input
                                        value={cell}
                                        onChange={(e) => updateCell(r, c, e.target.value)}
                                        className="w-full border border-transparent hover:border-line focus:border-primary rounded px-1 py-0.5"
                                      />
                                    ) : cell ? <RichCell text={active.rowsRich?.[r]?.[c] ?? cell} /> : ''}
                                  </td>
                                );
                              })}
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="border border-line rounded-lg h-40 flex items-center justify-center text-[12px] text-muted">Select a table to preview</div>
                  )}

                  {active && (() => {
                    const rv = assessTable(active);
                    if (rv.level === 'high' || reviewedIds.has(active.id)) return null;
                    return (
                      <div className={`mt-3 flex items-start gap-2 text-[12px] rounded-lg px-3 py-2 border ${
                        rv.level === 'low' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>
                          <strong>{rv.level === 'low' ? 'Review priority: high' : 'Review priority: medium'}</strong>
                          {rv.reasons.length > 0 && ` — ${rv.reasons.join('; ')}`}
                        </span>
                      </div>
                    );
                  })()}

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
                    <button
                      className="btn-outline"
                      onClick={() => { if (selected) markReviewed(selected.id); }}
                      disabled={!selected || (selected ? reviewedIds.has(selected.id) : false)}
                    >
                      <CheckCircle2 size={14} /> Mark Reviewed
                    </button>
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
                      <button
                        className="btn-outline"
                        onClick={exportReviewSet}
                        disabled={reviewedIds.size === 0}
                        title="Export reviewed tables as JSON for few-shot / evaluation"
                      >
                        <Download size={14} /> Review Set {reviewedIds.size > 0 ? `(${reviewedIds.size})` : ''}
                      </button>
                      <button
                        className="btn-primary"
                        onClick={() => void submitReviewSet()}
                        disabled={reviewedIds.size === 0 || !!exporting}
                        title="Submit reviewed tables to the feedback inbox"
                      >
                        {exporting === 'feedback' ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                        Submit Feedback {reviewedIds.size > 0 ? `(${reviewedIds.size})` : ''}
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
