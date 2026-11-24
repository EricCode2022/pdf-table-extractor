import type { Metadata } from 'next';
import { SeoPage } from '@/components/seo/SeoPage';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Extract Tables from PDF',
  description: 'Automatically detect and extract tables from digital PDFs with an editable preview before you export to Excel or CSV.',
  path: '/extract-tables-from-pdf',
  keywords: ['extract tables from PDF', 'PDF table detection', 'PDF table extraction online'],
});

export default function Page() {
  return (
    <SeoPage
      currentPath="/extract-tables-from-pdf"
      title="Extract Tables from PDF"
      lead="Find tables hidden inside PDF pages and turn them into structured rows and columns. Preview and edit every result before exporting, so you stay in control of the data."
      steps={[
        { title: 'Automatic detection', desc: 'Each page is scanned for text alignment, spacing, and table structure. Detected tables are listed with page numbers and sizes.' },
        { title: 'Preview and edit', desc: 'Open any table to see its cells. Fix headers, remove empty rows or columns, and review warnings about uncertain values.' },
        { title: 'Export or copy', desc: 'Download the tables as Excel or CSV, or copy cells directly into your own spreadsheet.' },
      ]}
      example={[
        {
          caption: 'Table 1 — detected on page 2 of a report.',
          headers: ['Region', 'Q1', 'Q2', 'Total'],
          rows: [
            ['East', '120', '95', '215'],
            ['West', '80', '110', '190'],
          ],
        },
        {
          caption: 'Table 2 — detected on page 4.',
          headers: ['Product', 'Units', 'Price'],
          rows: [
            ['Widget', '12', '10.00'],
            ['Gadget', '8', '20.00'],
          ],
        },
      ]}
      goodFor={[
        'Reports and research papers with data tables',
        'Multi-table documents',
        'Comparing figures across pages',
        'Anyone who needs to verify data before export',
      ]}
      limits={[
        'AI-assisted extraction sends uncertain pages to a third-party service',
        'Tables drawn as images cannot be read without OCR',
        'Very dense or overlapping layouts may need manual editing',
      ]}
    />
  );
}
