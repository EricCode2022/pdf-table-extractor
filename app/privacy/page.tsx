import type { Metadata } from 'next';
import { Header } from '@/components/layout/Header';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy Policy',
  description: 'How PDF Table Extractor handles your files: no signup, temporary storage, automatic deletion, and optional AI-assisted processing.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto"><Header /></div>
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-[32px] tracking-tight">Privacy Policy</h1>
        <p className="text-[12px] text-muted mt-1">Last updated: 2026-11-23</p>

        <div className="prose-custom space-y-6 mt-8 text-[14px]">
          <div>
            <h2 className="text-[18px] mb-2">Overview</h2>
            <p className="text-muted">PDF Table Extractor does not require an account. We do not permanently store your uploaded PDFs or the extracted table data. Temporary files are automatically deleted after processing.</p>
          </div>
          <div>
            <h2 className="text-[18px] mb-2">How files are processed</h2>
            <p className="text-muted">Your PDF is uploaded over HTTPS and temporarily stored so our server can read it. We parse text and coordinates to detect tables. Temporary files are deleted automatically within 24 hours, and can be deleted sooner after processing.</p>
          </div>
          <div>
            <h2 className="text-[18px] mb-2">AI assisted recognition</h2>
            <p className="text-muted">When the &ldquo;AI assisted&rdquo; option is enabled, pages where table detection is uncertain are processed by DeepSeek, a third-party AI service (https://www.deepseek.com). What is sent is the extracted text items with their page coordinates and the rule engine&apos;s candidate tables — not the original PDF file and not page images. You can disable this option at any time to use rule-based extraction only, with no data sent to third parties.</p>
          </div>
          <div>
            <h2 className="text-[18px] mb-2">Logs</h2>
            <p className="text-muted">We do not write PDF content or table contents into application logs.</p>
          </div>
          <div>
            <h2 className="text-[18px] mb-2">Contact</h2>
            <p className="text-muted">For privacy questions, please contact the site operator through the contact method provided on the website.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
