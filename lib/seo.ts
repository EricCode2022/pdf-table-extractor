import type { Metadata } from 'next';
import { SITE_NAME } from './site';

export function pageMetadata({
  title,
  description,
  path,
  keywords,
}: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    keywords,
    openGraph: {
      type: 'article',
      url: path,
      title: `${title} | ${SITE_NAME}`,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}
