import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ExtractWorkspace } from '@/components/extract/ExtractWorkspace';
import { Loader2 } from 'lucide-react';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ExtractPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; url?: string; name?: string; pages?: string }>;
}) {
  const params = await searchParams;
  if ((!params.key && !params.url) || !params.name) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted">No file selected.</p>
          <a href="/" className="text-primary text-sm hover:underline">Go back to upload</a>
        </div>
      </main>
    );
  }

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>}>
      <ExtractWorkspace
        fileKey={params.key ?? ''}
        fileUrl={params.url}
        fileName={params.name}
        totalPages={Number(params.pages ?? 0)}
      />
    </Suspense>
  );
}
