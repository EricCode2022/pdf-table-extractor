import type { Metadata } from 'next';
import { SeoPage } from '@/components/seo/SeoPage';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Convert PDF Table to Excel',
  description: 'Turn a table inside a PDF document into an Excel worksheet with preserved columns, data order, and number formats.',
  path: '/convert-pdf-table-to-excel',
  keywords: ['convert PDF table to Excel', 'PDF worksheet', 'PDF table to xlsx'],
});

export default function Page() {
  return (
    <SeoPage
      currentPath="/convert-pdf-table-to-excel"
      title="Convert PDF Table to Excel"
      lead="Turn a PDF table into a real Excel worksheet. Column names, row order, and numeric values are preserved so you can sort, filter, and calculate immediately."
      steps={[
        { title: 'Choose your PDF', desc: 'Upload the document containing the table you need. Files are handled temporarily and removed after processing.' },
        { title: 'Select the right table', desc: 'If a page has several tables, pick the one you want from the detected list and verify it in the preview.' },
        { title: 'Export as .xlsx', desc: 'Download a workbook where each table is a separate sheet, formatted and ready to use.' },
      ]}
      example={[{
        caption: 'An inventory table converted into an Excel worksheet.',
        headers: ['SKU', 'Item', 'Stock', 'Unit Price'],
        rows: [
          ['A-100', 'Notebook', '240', '3.50'],
          ['A-101', 'Pen', '1,500', '0.99'],
          ['B-200', 'Folder', '88', '2.75'],
        ],
      }]}
      goodFor={[
        'Inventory and product lists',
        'Financial tables with numbers and dates',
        'Reports that need further calculation in Excel',
        'Reusing PDF data in spreadsheets',
      ]}
      limits={[
        'Scanned or image-only tables need OCR first',
        'Merged header cells may be split into separate columns',
        'Very wide tables are easier to review on a larger screen',
      ]}
    />
  );
}
