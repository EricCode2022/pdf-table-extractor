'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import type { FeedbackEntry, FeedbackSummary, FeedbackTable } from '@/types/feedback';

export default function FeedbackAdminPage() {
  const [entries, setEntries] = useState<FeedbackSummary[]>([]);
  const [selected, setSelected] = useState<FeedbackEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/feedback');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load');
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally { setLoading(false); }
  }

  async function open(id: string) {
    const res = await fetch(`/api/feedback/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (res.ok) setSelected(data as FeedbackEntry);
  }

  useEffect(() => { void load(); }, []);

  return (
    <main className="min-h-screen bg-background">
      <Header />
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Customer Feedback</h1>
            <p className="text-[12px] text-muted mt-1">Human-reviewed tables submitted from the extractor.</p>
          </div>
          <Link href="/" className="btn-outline">← Home</Link>
        </div>

        {error && <div className="text-[12px] text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</div>}

        <div className="border border-line rounded-lg overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-muted">
              <tr>
                <th className="text-left px-3 py-2 font-normal">Submitted</th>
                <th className="text-left px-3 py-2 font-normal">File</th>
                <th className="text-left px-3 py-2 font-normal">Client</th>
                <th className="text-right px-3 py-2 font-normal">Tables</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} onClick={() => void open(e.id)}
                  className={`border-t border-line cursor-pointer hover:bg-blue-50 ${selected?.id === e.id ? 'bg-blue-50' : ''}`}>
                  <td className="px-3 py-2">{new Date(e.submittedAt).toLocaleString()}</td>
                  <td className="px-3 py-2 font-medium">{e.sourceFile}</td>
                  <td className="px-3 py-2">{e.clientId ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{e.tableCount}</td>
                </tr>
              ))}
              {!loading && !entries.length && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">No feedback submitted yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && (
          <div className="border border-line rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[14px] font-semibold">{selected.sourceFile} — {selected.tableCount} tables</h2>
              <button className="text-[12px] text-muted hover:text-foreground" onClick={() => setSelected(null)}>Close</button>
            </div>
            {selected.tables.map((t, i) => <FeedbackTableCard key={i} table={t} index={i} />)}
          </div>
        )}
      </div>
    </main>
  );
}

function FeedbackTableCard({ table, index }: { table: FeedbackTable; index: number }) {
  const cols = table.columnCount;
  const rows = [
    ...(table.headerRows ?? (table.headers ? [table.headers] : [])),
    ...(table.rows ?? []),
  ];
  return (
    <div className="border border-line rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50">
        <span className="text-[12px] font-medium">Table {index + 1} · {cols} columns · {table.rows?.length ?? 0} rows</span>
        {table.review && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            table.review.level === 'low' ? 'bg-rose-50 text-rose-700'
            : table.review.level === 'medium' ? 'bg-amber-50 text-amber-700'
            : 'bg-emerald-50 text-emerald-700'
          }`}>
            {table.review.level} · {table.review.reasons?.join(', ') || 'no issues'}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <tbody>
            {rows.slice(0, 12).map((row, ri) => (
              <tr key={ri} className="border-t border-line">
                {Array.from({ length: cols }, (_, c) => (
                  <td key={c} className="px-2 py-1 border-r border-line last:border-0 whitespace-nowrap">
                    {row?.[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
