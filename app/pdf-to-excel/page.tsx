import type { Metadata } from 'next';
import { SeoPage } from '@/components/seo/SeoPage';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'PDF to Excel',
  description: 'Convert PDF tables to editable Excel spreadsheets online. Free, fast, no signup required.',
  path: '/pdf-to-excel',
  keywords: ['PDF to Excel', 'convert PDF table to Excel', 'PDF spreadsheet converter'],
});

export default function Page() {
  return (
    <SeoPage
      currentPath="/pdf-to-excel"
      title="PDF to Excel Converter"
      lead="Extract tables from any digital PDF and download them as an editable Excel workbook. Each detected table becomes its own worksheet, with column names and data order preserved."
      steps={[
        { title: 'Upload your PDF', desc: 'Drag and drop a PDF (up to 20 MB, 50 pages). Files are processed temporarily and deleted automatically.' },
        { title: 'Review detected tables', desc: 'We scan page text and coordinates to find tables. Preview each one and edit cells if anything looks off.' },
        { title: 'Export to Excel', desc: 'Download an .xlsx file with one sheet per table, ready to open in Excel, Google Sheets, or Numbers.' },
      ]}
      example={[{
        caption: 'A financial table extracted from a PDF report and shown in the editor preview.',
        headers: ['Date', 'Description', 'Amount', 'Status'],
        rows: [
          ['2026-01-01', 'Office supplies', '120.00', 'Paid'],
          ['2026-01-02', 'Software license', '89.00', 'Pending'],
          ['2026-01-03', 'Marketing', '250.00', 'Paid'],
        ],
      }]}
      goodFor={[
        'Digital PDFs with selectable text',
        'Financial reports, invoices, and statements',
        'Tables with clear rows and columns',
        'Product lists and price sheets',
      ]}
      limits={[
        'Scanned PDFs need OCR and are not supported in this version',
        'Merged cells and heavily fragmented layouts may need manual cleanup',
        'Encrypted PDFs cannot be processed',
      ]}
    />
  );
}
