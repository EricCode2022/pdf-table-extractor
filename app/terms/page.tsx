import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Terms of Service',
  description: 'Terms and usage rules for PDF Table Extractor, a free online tool for extracting PDF tables to Excel and CSV.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto"><Header /></div>
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-[32px] tracking-tight">Terms of Service</h1>
        <p className="text-[12px] text-muted mt-1">Last updated: 2026-11-23</p>
        <div className="space-y-6 mt-8 text-[14px]">
          <div>
            <h2 className="text-[18px] mb-2">Use of the service</h2>
            <p className="text-muted">You may use PDF Table Extractor to extract tables from PDFs you are authorized to process. Do not use the service for any unlawful purpose.</p>
          </div>
          <div>
            <h2 className="text-[18px] mb-2">Accuracy</h2>
            <p className="text-muted">Extraction results are generated automatically and may contain errors. Always review the preview and exported files before relying on the data.</p>
          </div>
          <div>
            <h2 className="text-[18px] mb-2">Limits</h2>
            <p className="text-muted">Current limits: PDF only, up to 20 MB per file, up to 50 pages. Scanned PDFs are not supported.</p>
          </div>
          <div>
            <h2 className="text-[18px] mb-2">Availability</h2>
            <p className="text-muted">The service is provided &ldquo;as is&rdquo; without guarantees of uninterrupted availability.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
