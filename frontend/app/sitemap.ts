/**
 * sitemap.xml generation via Next.js metadata route.
 * Lists all public routes for crawler discovery.
 */

import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentislux.io';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/scan`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/benchmark`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
  ];
}
