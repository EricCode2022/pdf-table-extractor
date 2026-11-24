import Link from 'next/link';
import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { pageMetadata } from '@/lib/seo';
import { UploadCloud, Table2, Download, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = pageMetadata({
  title: 'How It Works',
  description: 'Learn how PDF Table Extractor turns PDF tables into Excel or CSV in three simple steps: upload, detect, and export.',
  path: '/how-it-works',
});

const steps = [
  { icon: UploadCloud, title: 'Upload your PDF', desc: 'Drag and drop a digital PDF (up to 20 MB, 50 pages). No signup required.' },
  { icon: Table2, title: 'Detect and preview tables', desc: 'We scan each page, detect tables, and show you the rows and columns in an editable preview.' },
  { icon: Download, title: 'Export your data', desc: 'Download the result as Excel (one sheet per table) or UTF-8 CSV.' },
];

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto"><Header /></div>
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-[32px] tracking-tight">How it Works</h1>
        <p className="text-muted mt-2">PDF Table Extractor turns PDF tables into editable spreadsheets in three steps.</p>
        <div className="space-y-4 mt-8">
          {steps.map((step, i) => (
            <div key={step.title} className="card p-6 flex gap-4">
              <span className="w-11 h-11 rounded-lg bg-blue-50 text-primary flex items-center justify-center shrink-0">
                <step.icon size={22} />
              </span>
              <div>
                <div className="text-[16px]">{i + 1}. {step.title}</div>
                <p className="text-[13px] text-muted mt-1">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
          <ShieldCheck size={20} className="text-primary mt-0.5 shrink-0" />
          <p className="text-[13px] text-muted">
            Scanned PDFs need OCR and are not supported in this version. Files are temporarily processed and automatically deleted.
          </p>
        </div>
        <Link href="/" className="inline-block btn-primary mt-8">Try it now</Link>
      </section>
    </main>
  );
}
