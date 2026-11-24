import type { Metadata } from 'next';
import Link from 'next/link';
import { Header } from '@/components/layout/Header';
import { pageMetadata } from '@/lib/seo';
import { SEO_PAGES } from '@/lib/seo-pages';
import { ArrowRight, Info } from 'lucide-react';

export const metadata: Metadata = pageMetadata({
  title: 'Extract Table from Scanned PDF',
  description: 'Learn why scanned PDFs need OCR for table extraction, what accuracy to expect, and how to prepare scans for better results.',
  path: '/extract-table-from-scanned-pdf',
  keywords: ['extract table from scanned PDF', 'OCR PDF table', 'scanned PDF to Excel'],
});

export default function Page() {
  const related = SEO_PAGES.filter((p) => p.path !== '/extract-table-from-scanned-pdf');
  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto"><Header /></div>
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-[32px] tracking-tight">Extract Table from Scanned PDF</h1>
        <p className="text-[15px] text-muted mt-3">
          Scanned PDFs are images, not text. To extract a table from one, the page must first be read with OCR
          (Optical Character Recognition). This tool currently works on digital PDFs with selectable text;
          this page explains what that means and how to get the best results.
        </p>

        <div className="mt-8 flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
          <Info size={20} className="text-primary mt-0.5 shrink-0" />
          <p className="text-[13px] text-muted">
            Not sure if your PDF is scanned? Try selecting text in a viewer. If you can highlight and copy words,
            it is a digital PDF and works with this tool. If nothing is selectable, it is a scan.
          </p>
        </div>

        <div className="mt-12">
          <h2 className="text-[22px] tracking-tight">Why scanned PDFs are different</h2>
          <div className="space-y-4 mt-4 text-[14px] text-muted">
            <p>A digital PDF stores each character with its position on the page, so a table can be reconstructed by reading text coordinates directly.</p>
            <p>A scanned PDF stores only a picture of the page. OCR must first guess the characters, then a layout step must guess where rows and columns are. Every guess can introduce errors, especially with small fonts, low contrast, or handwritten notes.</p>
          </div>
        </div>

        <div className="mt-12">
          <h2 className="text-[22px] tracking-tight">How to improve scanned table extraction</h2>
          <ol className="list-decimal pl-6 mt-4 space-y-2 text-[14px] text-muted">
            <li>Scan at 300 DPI or higher with good contrast.</li>
            <li>Keep the page straight — skewed scans break row alignment.</li>
            <li>Use a flatbed scanner rather than a phone camera when possible.</li>
            <li>Avoid screenshots of scans; export directly to PDF.</li>
            <li>After OCR with another tool, re-save as a digital PDF and upload it here.</li>
          </ol>
        </div>

        <div className="mt-12">
          <h2 className="text-[22px] tracking-tight">What to expect</h2>
          <p className="text-[14px] text-muted mt-2">
            Even with good scans, OCR-based table extraction needs review. Check numbers, dates, and column boundaries
            before exporting. If accuracy matters, keeping the original source spreadsheet is always better.
          </p>
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

        <Link href="/how-it-works" className="inline-block btn-primary mt-10">See how digital PDF extraction works</Link>
      </section>
    </main>
  );
}
