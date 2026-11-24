import { SITE_URL, SITE_NAME } from '@/lib/site';

export const FAQS = [
  {
    q: 'Is PDF Table Extractor free?',
    a: 'Yes. You can upload a PDF, preview detected tables, and export to Excel or CSV without signing up.',
  },
  {
    q: 'What PDF files are supported?',
    a: 'Digital PDFs with selectable text, up to 20 MB and 50 pages. Scanned PDFs that contain only images require OCR and are not supported in this version.',
  },
  {
    q: 'Are my files stored permanently?',
    a: 'No. Uploaded files are held temporarily for processing and deleted automatically. Extracted table data is not saved.',
  },
  {
    q: 'Can I edit the extracted tables before downloading?',
    a: 'Yes. You can edit cells, rename columns, and remove empty rows or columns in the preview before exporting.',
  },
  {
    q: 'Does it use AI?',
    a: 'Rule-based extraction runs by default. When AI assisted is enabled, pages with uncertain table detection are processed by a third-party AI service to improve accuracy. You can disable it at any time.',
  },
];

export function SoftwareJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: SITE_URL,
    description: 'Extract tables from PDF files and convert them into editable Excel or CSV spreadsheets.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    featureList: ['PDF table detection', 'Editable preview', 'Excel export', 'CSV export', 'No signup required'],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export function FaqJsonLd() {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
