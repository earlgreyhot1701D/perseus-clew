/**
 * Perseus Clew: Benchmark site manifest.
 *
 * The 50 sites, 5 verticals, frozen as an execution-ready data structure.
 * Source of truth for humans: docs/BENCHMARK-SITES.md (committed pre-scan).
 * Source of truth for code: this file.
 *
 * SaaS sites carry referenceSpecUrl (resolved raw GitHub URLs).
 * Non-SaaS sites have referenceSpecUrl: null.
 *
 * See docs/BENCHMARK-SITES.md, docs/BENCHMARK-HYPOTHESES.md.
 */

export const VERTICALS = {
  ECOMMERCE: 'ecommerce',
  SAAS: 'saas',
  CONTENT: 'content',
  GOVERNMENT: 'government',
  INDIE: 'indie'
};

/**
 * @typedef {object} BenchmarkSite
 * @property {string} siteId - Unique identifier (kebab-case)
 * @property {string} name - Display name
 * @property {string} url - Website URL to scan (door scan target)
 * @property {string} vertical - One of VERTICALS values
 * @property {string} size - Size/build label
 * @property {string|null} referenceSpecUrl - Resolved raw spec URL for reference scan (SaaS only)
 */

/** @type {BenchmarkSite[]} */
export const BENCHMARK_SITES = [
  // --- E-commerce (10) ---
  { siteId: 'amazon', name: 'Amazon', url: 'https://www.amazon.com', vertical: VERTICALS.ECOMMERCE, size: 'large/custom', referenceSpecUrl: null },
  { siteId: 'walmart', name: 'Walmart', url: 'https://www.walmart.com', vertical: VERTICALS.ECOMMERCE, size: 'large/custom', referenceSpecUrl: null },
  { siteId: 'mcmaster-carr', name: 'McMaster-Carr', url: 'https://www.mcmaster.com', vertical: VERTICALS.ECOMMERCE, size: 'large/custom-server-rendered', referenceSpecUrl: null },
  { siteId: 'bombas', name: 'Bombas', url: 'https://bombas.com', vertical: VERTICALS.ECOMMERCE, size: 'mid/shopify', referenceSpecUrl: null },
  { siteId: 'allbirds', name: 'Allbirds', url: 'https://www.allbirds.com', vertical: VERTICALS.ECOMMERCE, size: 'mid/shopify', referenceSpecUrl: null },
  { siteId: 'olipop', name: 'Olipop', url: 'https://drinkolipop.com', vertical: VERTICALS.ECOMMERCE, size: 'mid/shopify', referenceSpecUrl: null },
  { siteId: 'brooklinen', name: 'Brooklinen', url: 'https://www.brooklinen.com', vertical: VERTICALS.ECOMMERCE, size: 'mid/shopify', referenceSpecUrl: null },
  { siteId: 'vermont-country-store', name: 'Vermont Country Store', url: 'https://www.vermontcountrystore.com', vertical: VERTICALS.ECOMMERCE, size: 'small/custom-legacy', referenceSpecUrl: null },
  { siteId: 'misen', name: 'Misen', url: 'https://misen.com', vertical: VERTICALS.ECOMMERCE, size: 'small/shopify', referenceSpecUrl: null },
  { siteId: 'topo-designs', name: 'Topo Designs', url: 'https://topodesigns.com', vertical: VERTICALS.ECOMMERCE, size: 'small/shopify', referenceSpecUrl: null },

  // --- SaaS / developer tools (10) ---
  { siteId: 'stripe', name: 'Stripe', url: 'https://stripe.com', vertical: VERTICALS.SAAS, size: 'large', referenceSpecUrl: 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json' },
  { siteId: 'github', name: 'GitHub', url: 'https://github.com', vertical: VERTICALS.SAAS, size: 'large', referenceSpecUrl: 'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json' },
  { siteId: 'twilio', name: 'Twilio', url: 'https://www.twilio.com', vertical: VERTICALS.SAAS, size: 'large', referenceSpecUrl: 'https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_api_v2010.json' },
  { siteId: 'slack', name: 'Slack', url: 'https://slack.com', vertical: VERTICALS.SAAS, size: 'large', referenceSpecUrl: 'https://raw.githubusercontent.com/slackapi/slack-api-specs/master/web-api/slack_web_openapi_v2.json' },
  { siteId: 'square', name: 'Square', url: 'https://squareup.com', vertical: VERTICALS.SAAS, size: 'large', referenceSpecUrl: 'https://raw.githubusercontent.com/square/connect-api-specification/master/square_connect_api.json' },
  { siteId: 'openai', name: 'OpenAI', url: 'https://openai.com', vertical: VERTICALS.SAAS, size: 'large', referenceSpecUrl: 'https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml' },
  { siteId: 'box', name: 'Box', url: 'https://www.box.com', vertical: VERTICALS.SAAS, size: 'mid-large', referenceSpecUrl: 'https://raw.githubusercontent.com/box/box-openapi/main/openapi.json' },
  { siteId: 'pagerduty', name: 'PagerDuty', url: 'https://www.pagerduty.com', vertical: VERTICALS.SAAS, size: 'mid', referenceSpecUrl: 'https://raw.githubusercontent.com/PagerDuty/api-schema/main/reference/REST/openapiv3.json' },
  { siteId: 'asana', name: 'Asana', url: 'https://asana.com', vertical: VERTICALS.SAAS, size: 'mid-large', referenceSpecUrl: 'https://raw.githubusercontent.com/Asana/openapi/main/defs/asana_oas.yaml' },
  { siteId: 'vercel', name: 'Vercel', url: 'https://vercel.com', vertical: VERTICALS.SAAS, size: 'mid-large', referenceSpecUrl: 'https://openapi.vercel.sh' },

  // --- Content / media (10) ---
  { siteId: 'npr', name: 'NPR', url: 'https://www.npr.org', vertical: VERTICALS.CONTENT, size: 'large/server-rendered', referenceSpecUrl: null },
  { siteId: 'nyt', name: 'NYT', url: 'https://www.nytimes.com', vertical: VERTICALS.CONTENT, size: 'large/paywall', referenceSpecUrl: null },
  { siteId: 'bbc', name: 'BBC', url: 'https://www.bbc.com', vertical: VERTICALS.CONTENT, size: 'large/server-rendered', referenceSpecUrl: null },
  { siteId: 'propublica', name: 'ProPublica', url: 'https://www.propublica.org', vertical: VERTICALS.CONTENT, size: 'mid/nonprofit', referenceSpecUrl: null },
  { siteId: 'defector', name: 'Defector', url: 'https://defector.com', vertical: VERTICALS.CONTENT, size: 'small/worker-owned', referenceSpecUrl: null },
  { siteId: 'techcrunch', name: 'TechCrunch', url: 'https://techcrunch.com', vertical: VERTICALS.CONTENT, size: 'mid/wordpress', referenceSpecUrl: null },
  { siteId: 'the-verge', name: 'The Verge', url: 'https://www.theverge.com', vertical: VERTICALS.CONTENT, size: 'mid/custom-cms', referenceSpecUrl: null },
  { siteId: 'dev-to', name: 'Dev.to', url: 'https://dev.to', vertical: VERTICALS.CONTENT, size: 'mid/platform', referenceSpecUrl: null },
  { siteId: 'devpost', name: 'Devpost', url: 'https://devpost.com', vertical: VERTICALS.CONTENT, size: 'mid/platform', referenceSpecUrl: null },
  { siteId: 'daring-fireball', name: 'Daring Fireball', url: 'https://daringfireball.net', vertical: VERTICALS.CONTENT, size: 'small/minimal', referenceSpecUrl: null },

  // --- Government / civic (10) — US only ---
  { siteId: 'usa-gov', name: 'USA.gov', url: 'https://www.usa.gov', vertical: VERTICALS.GOVERNMENT, size: 'federal/portal', referenceSpecUrl: null },
  { siteId: 'irs', name: 'IRS', url: 'https://www.irs.gov', vertical: VERTICALS.GOVERNMENT, size: 'federal/forms', referenceSpecUrl: null },
  { siteId: 'census', name: 'Census', url: 'https://www.census.gov', vertical: VERTICALS.GOVERNMENT, size: 'federal/data', referenceSpecUrl: null },
  { siteId: 'congress-gov', name: 'Congress.gov', url: 'https://www.congress.gov', vertical: VERTICALS.GOVERNMENT, size: 'federal/legislative', referenceSpecUrl: null },
  { siteId: 'recreation-gov', name: 'Recreation.gov', url: 'https://www.recreation.gov', vertical: VERTICALS.GOVERNMENT, size: 'federal-service/react', referenceSpecUrl: null },
  { siteId: 'federal-register', name: 'Federal Register', url: 'https://www.federalregister.gov', vertical: VERTICALS.GOVERNMENT, size: 'federal-service/structured', referenceSpecUrl: null },
  { siteId: 'california', name: 'California (ca.gov)', url: 'https://www.ca.gov', vertical: VERTICALS.GOVERNMENT, size: 'state/portal', referenceSpecUrl: null },
  { siteId: 'michigan', name: 'Michigan (michigan.gov)', url: 'https://www.michigan.gov', vertical: VERTICALS.GOVERNMENT, size: 'state/portal', referenceSpecUrl: null },
  { siteId: 'boston', name: 'Boston.gov', url: 'https://www.boston.gov', vertical: VERTICALS.GOVERNMENT, size: 'city/modern', referenceSpecUrl: null },
  { siteId: 'nyc', name: 'NYC.gov', url: 'https://www.nyc.gov', vertical: VERTICALS.GOVERNMENT, size: 'city/large', referenceSpecUrl: null },

  // --- Indie / builder (10) ---
  { siteId: 'dan-luu', name: 'Dan Luu', url: 'https://danluu.com', vertical: VERTICALS.INDIE, size: 'dev-built/minimal', referenceSpecUrl: null },
  { siteId: 'julia-evans', name: 'Julia Evans', url: 'https://jvns.ca', vertical: VERTICALS.INDIE, size: 'dev-built/static', referenceSpecUrl: null },
  { siteId: 'simon-willison', name: 'Simon Willison', url: 'https://simonwillison.net', vertical: VERTICALS.INDIE, size: 'dev-built/django', referenceSpecUrl: null },
  { siteId: 'xe-iaso', name: 'Xe Iaso', url: 'https://xeiaso.net', vertical: VERTICALS.INDIE, size: 'dev-built/custom', referenceSpecUrl: null },
  { siteId: 'brittany-chiang', name: 'Brittany Chiang', url: 'https://brittanychiang.com', vertical: VERTICALS.INDIE, size: 'design-built/react-gatsby', referenceSpecUrl: null },
  { siteId: 'josh-comeau', name: 'Josh Comeau', url: 'https://www.joshwcomeau.com', vertical: VERTICALS.INDIE, size: 'design-built/nextjs', referenceSpecUrl: null },
  { siteId: 'lynn-fisher', name: 'Lynn Fisher', url: 'https://lynnandtonic.com', vertical: VERTICALS.INDIE, size: 'design-built/animation', referenceSpecUrl: null },
  { siteId: 'maggie-appleton', name: 'Maggie Appleton', url: 'https://maggieappleton.com', vertical: VERTICALS.INDIE, size: 'design-built/digital-garden', referenceSpecUrl: null },
  { siteId: 'gwern', name: 'Gwern', url: 'https://gwern.net', vertical: VERTICALS.INDIE, size: 'mixed/dense-custom', referenceSpecUrl: null },
  { siteId: 'are-na', name: 'Are.na', url: 'https://www.are.na', vertical: VERTICALS.INDIE, size: 'design-built/tool', referenceSpecUrl: null }
];

/**
 * Get sites that have a reference spec URL (SaaS sites with confirmed specs).
 */
export function getSaaSWithSpec() {
  return BENCHMARK_SITES.filter(s => s.referenceSpecUrl !== null);
}

/**
 * Get sites by vertical.
 */
export function getSitesByVertical(vertical) {
  return BENCHMARK_SITES.filter(s => s.vertical === vertical);
}
