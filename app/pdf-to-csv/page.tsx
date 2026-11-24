import type { Metadata } from 'next';
import { SeoPage } from '@/components/seo/SeoPage';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'PDF to CSV',
  description: 'Extract tables from PDF files and export them as clean UTF-8 CSV spreadsheets. No signup, no software install.',
  path: '/pdf-to-csv',
  keywords: ['PDF to CSV', 'extract table to CSV', 'PDF CSV exporter'],
});

export default function Page() {
  return (
    <SeoPage
      currentPath="/pdf-to-csv"
      title="PDF to CSV Converter"
      lead="Pull tables out of PDF documents and download them as UTF-8 CSV files. CSV works with almost every spreadsheet tool, database, and data pipeline."
      steps={[
        { title: 'Upload a PDF', desc: 'Select or drop a digital PDF. Only the file you choose is processed, and it is deleted automatically afterward.' },
        { title: 'Pick and check tables', desc: 'See every detected table with its page number, row count, and column count. Edit any cell before exporting.' },
        { title: 'Download CSV', desc: 'Get a UTF-8 CSV with correct quoting for commas, quotes, and line breaks — safe for Excel and data tools.' },
      ]}
      example={[{
        caption: 'A contact table exported from a PDF into CSV format.',
        headers: ['Name', 'Department', 'Email'],
        rows: [
          ['Alice Chen', 'Finance', 'alice@example.com'],
          ['Bob Martin', 'Engineering', 'bob@example.com'],
          ['Carol Diaz', 'Sales', 'carol@example.com'],
        ],
      }]}
      goodFor={[
        'Importing PDF data into databases and CRMs',
        'Spreadsheets that need plain-text exchange',
        'Data pipelines and scripts',
        'Users who do not have Excel installed',
      ]}
      limits={[
        'Multiple tables are separated into blocks in one CSV file',
        'Scanned PDFs are not supported without OCR',
        'Complex merged cells may need review',
      ]}
    />
  );
}
