import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { INDEXABLE_PAGES } from '@/lib/seo-pages';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return INDEXABLE_PAGES.map((path) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path.startsWith('/pdf-to') || path.startsWith('/extract') ? 0.8 : 0.5,
  }));
}
