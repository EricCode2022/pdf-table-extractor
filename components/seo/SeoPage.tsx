import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { SEO_PAGES } from '@/lib/seo-pages';

export type SeoPageProps = {
  title: string;
  lead: string;
  steps: { title: string; desc: string }[];
  example: { caption: string; headers: string[]; rows: string[][] }[];
  goodFor: string[];
  limits: string[];
  currentPath: string;
};

export function SeoPage({ title, lead, steps, example, goodFor, limits, currentPath }: SeoPageProps) {
  const related = SEO_PAGES.filter((p) => p.path !== currentPath);

  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto"><Header /></div>
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-[32px] tracking-tight">{title}</h1>
        <p className="text-[15px] text-muted mt-3">{lead}</p>
        <Link href="/" className="btn-primary mt-6">Try it free — no signup</Link>

        <div className="mt-12">
          <h2 className="text-[22px] tracking-tight">How it works</h2>
          <div className="space-y-3 mt-4">
            {steps.map((step, i) => (
              <div key={step.title} className="card p-5 flex gap-4">
                <span className="w-8 h-8 rounded-full bg-blue-50 text-primary flex items-center justify-center text-[13px] shrink-0">{i + 1}</span>
                <div>
                  <div className="text-[15px]">{step.title}</div>
                  <p className="text-[13px] text-muted mt-1">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-[22px] tracking-tight">Example</h2>
          <p className="text-[13px] text-muted mt-1">A table extracted from a PDF and shown in the editable preview.</p>
          <div className="space-y-6 mt-4">
            {example.map((table, i) => (
              <div key={i} className="card p-4 overflow-x-auto">
                <div className="text-[12px] text-muted mb-2">{table.caption}</div>
                <table className="w-full text-[12px] border-collapse min-w-[420px]">
                  <thead>
                    <tr className="bg-slate-50">
                      {table.headers.map((h, c) => <th key={c} className="border-b border-line text-left px-3 py-2 font-normal">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, r) => (
                      <tr key={r} className="border-b border-line last:border-0">
                        {row.map((cell, c) => <td key={c} className="px-3 py-2">{cell}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 grid sm:grid-cols-2 gap-6">
          <div>
            <h2 className="text-[18px] flex items-center gap-2"><CheckCircle2 size={18} className="text-success" /> Works well for</h2>
            <ul className="mt-3 space-y-2 text-[13px] text-muted">
              {goodFor.map((item) => <li key={item}>· {item}</li>)}
            </ul>
          </div>
          <div>
            <h2 className="text-[18px] flex items-center gap-2"><XCircle size={18} className="text-warning" /> Limitations</h2>
            <ul className="mt-3 space-y-2 text-[13px] text-muted">
              {limits.map((item) => <li key={item}>· {item}</li>)}
            </ul>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-[20px] tracking-tight">Related tools</h2>
          <div className="grid sm:grid-cols-2 gap-3 mt-4">
            {related.map((page) => (
              <Link key={page.path} href={page.path} className="card p-4 flex items-center justify-between hover:border-primary transition-colors">
                <span className="text-[14px]">{page.title}</span>
                <ArrowRight size={16} className="text-primary" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
