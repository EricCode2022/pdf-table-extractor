export const SEO_PAGES = [
  { path: '/pdf-to-excel', title: 'PDF to Excel', description: 'Convert PDF tables to editable Excel spreadsheets online. Free, fast, no signup required.' },
  { path: '/pdf-to-csv', title: 'PDF to CSV', description: 'Extract tables from PDF files and export them as clean UTF-8 CSV spreadsheets.' },
  { path: '/extract-tables-from-pdf', title: 'Extract Tables from PDF', description: 'Automatically detect and extract tables from digital PDFs with editable preview before export.' },
  { path: '/convert-pdf-table-to-excel', title: 'Convert PDF Table to Excel', description: 'Turn tables inside PDF documents into Excel worksheets with one sheet per detected table.' },
  { path: '/extract-table-from-scanned-pdf', title: 'Extract Table from Scanned PDF', description: 'Learn about extracting tables from scanned PDFs and when OCR is needed for accurate results.' },
] as const;

export const INDEXABLE_PAGES = [
  '/',
  '/how-it-works',
  '/privacy',
  '/terms',
  ...SEO_PAGES.map((p) => p.path),
];
