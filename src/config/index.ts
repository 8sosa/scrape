import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  readonly triggerKeywords: readonly string[];
  readonly stackRelevanceKeywords: readonly string[];
  readonly exclusionTerms: readonly string[];
  readonly nonRemoteExclusionTerms: readonly string[];
  readonly userAgent: string;
  readonly reddit: {
    readonly subreddits: readonly string[];
    readonly hiringOnlySubreddits: readonly string[];
    readonly postsPerSubreddit: number;
    /**
     * Null when REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET aren't set. Reddit's
     * API self-service registration is currently locked down (see the
     * Responsible Builder Policy), so approval can take weeks or be denied —
     * this must stay optional rather than crash the whole pipeline.
     */
    readonly clientId: string | null;
    readonly clientSecret: string | null;
    readonly tokenUrl: string;
    readonly oauthBaseUrl: string;
  };
  readonly hackerNews: {
    readonly apiBaseUrl: string;
    readonly hitsPerPage: number;
    /** Only consider stories newer than this many seconds, to bound each poll to the current cron window. */
    readonly lookbackSeconds: number;
    /** How many top-level comments to pull from each monthly hiring/freelancer thread. */
    readonly threadHitsPerPage: number;
  };
  readonly remoteOk: {
    readonly apiUrl: string;
  };
  readonly weWorkRemotely: {
    readonly feedUrls: readonly string[];
  };
  readonly remotive: {
    readonly apiUrl: string;
    readonly categories: readonly string[];
  };
  readonly arbeitnow: {
    readonly apiUrl: string;
  };
  readonly supabase: {
    readonly url: string;
    readonly serviceRoleKey: string;
    readonly table: string;
  };
  readonly telegram: {
    readonly botToken: string;
    readonly chatId: string;
    readonly apiBaseUrl: string;
  };
  readonly pipeline: {
    /** Caps Telegram sends per run so a large backlog can't blow the serverless timeout or Telegram's flood limit. */
    readonly maxNotificationsPerRun: number;
    /** Telegram's real flood limit is close to 1 message/second per chat — this must stay >= 1000. */
    readonly telegramSendIntervalMs: number;
  };
  readonly cronSchedule: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : null;
}

/** Subreddits to poll for high-intent leads. */
const SUBREDDITS: readonly string[] = [
  'startups',
  'freelance_forhire',
  'forhire',
  'businessintelligence',
  'PowerBI',
  'analytics',
  'CRM',
  'ecommerce',
  'SaaS',
  'dataanalysis',
];

/**
 * Phrases that indicate genuine buying/hiring intent in free-form discussion
 * content (Reddit's general subs, HN front page) — used by 'intent-phrase' mode.
 */
const TRIGGER_KEYWORDS: readonly string[] = [
  'looking for a data analyst',
  'looking for a bi analyst',
  'need a data analyst',
  'need a business intelligence analyst',
  'looking for an onboarding specialist',
  'need a crm specialist',
  'need help with data analysis',
  'need help with reporting',
  'looking for someone to build dashboards',
  'looking for a power bi',
  'seeking a data analyst',
  'looking to hire',
  'looking for a contractor',
  'any recommendations for a data analyst',
  'recommendation for',
  'alternative to',
  'looking for agency',
];

/**
 * Broad BI/data/CRM/onboarding relevance signals used by 'stack-relevance'
 * mode — for sources that are already inherently job/gig postings (RemoteOK,
 * WWR, Remotive, Arbeitnow, HN hiring/freelancer threads). These don't phrase
 * themselves as "looking for a data analyst", they just *are* job posts, so
 * intent-phrase matching would filter out nearly everything; relevance to
 * Maro's actual skill set is the right bar here instead.
 */
const STACK_RELEVANCE_KEYWORDS: readonly string[] = [
  'data analyst',
  'data analytics',
  'business intelligence',
  'bi analyst',
  'power bi',
  'tableau',
  'looker',
  'metabase',
  'onboarding specialist',
  'client onboarding',
  'customer onboarding',
  'implementation specialist',
  'customer success',
  'account manager',
  'key account',
  'crm',
  'salesforce',
  'hubspot',
  'gohighlevel',
  'financial analyst',
  'financial analysis',
  'reporting analyst',
  'dashboard',
  'sql',
  'excel',
];

/** Phrases that indicate self-promotion rather than buying intent — always ignored. */
const EXCLUSION_TERMS: readonly string[] = ['[for hire]', 'i am offering', 'hire me'];

/**
 * Best-effort text signal for "this isn't actually remote", used for sources
 * without a structured location field (Reddit, HN). Arbeitnow has a real
 * `remote` flag and is filtered on that directly instead; RemoteOK/WWR/
 * Remotive are remote-only job boards by construction and don't need this.
 */
const NON_REMOTE_EXCLUSION_TERMS: readonly string[] = [
  'on-site only',
  'onsite only',
  'in-office required',
  'in office required',
  'must relocate',
  'relocation required',
  'no remote work',
  'not remote friendly',
  'hybrid role',
  'hybrid position',
];

/**
 * Meta hiring subreddits where the [HIRING]/[FOR HIRE] tag convention applies.
 * Posts here are gated strictly on the [HIRING] tag rather than free-text keyword matching.
 */
const HIRING_ONLY_SUBREDDITS: readonly string[] = ['forhire', 'freelance_forhire'];

/** WWR category feeds scoped to BI/data/CRM/onboarding roles — the closest fit to Maro's background. */
const WWR_FEED_URLS: readonly string[] = [
  'https://weworkremotely.com/categories/remote-customer-support-jobs.rss',
  'https://weworkremotely.com/categories/remote-management-and-finance-jobs.rss',
];

/** Remotive category slugs scoped to BI/data/CRM/onboarding roles. */
const REMOTIVE_CATEGORIES: readonly string[] = ['data', 'business', 'customer-service'];

export const config: AppConfig = {
  triggerKeywords: TRIGGER_KEYWORDS,
  stackRelevanceKeywords: STACK_RELEVANCE_KEYWORDS,
  exclusionTerms: EXCLUSION_TERMS,
  nonRemoteExclusionTerms: NON_REMOTE_EXCLUSION_TERMS,
  userAgent: process.env['SCRAPER_USER_AGENT'] ?? 'lead-scraper-bot/1.0',
  reddit: {
    subreddits: SUBREDDITS,
    hiringOnlySubreddits: HIRING_ONLY_SUBREDDITS,
    postsPerSubreddit: 25,
    clientId: optionalEnv('REDDIT_CLIENT_ID'),
    clientSecret: optionalEnv('REDDIT_CLIENT_SECRET'),
    tokenUrl: 'https://www.reddit.com/api/v1/access_token',
    oauthBaseUrl: 'https://oauth.reddit.com',
  },
  hackerNews: {
    apiBaseUrl: 'https://hn.algolia.com/api/v1',
    hitsPerPage: 50,
    lookbackSeconds: 20 * 60,
    threadHitsPerPage: 300,
  },
  remoteOk: {
    apiUrl: 'https://remoteok.com/api',
  },
  weWorkRemotely: {
    feedUrls: WWR_FEED_URLS,
  },
  remotive: {
    apiUrl: 'https://remotive.com/api/remote-jobs',
    categories: REMOTIVE_CATEGORIES,
  },
  arbeitnow: {
    apiUrl: 'https://www.arbeitnow.com/api/job-board-api',
  },
  supabase: {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    table: 'processed_leads',
  },
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    chatId: requireEnv('TELEGRAM_CHAT_ID'),
    apiBaseUrl: 'https://api.telegram.org',
  },
  pipeline: {
    // At ~1.4s per send (1100ms spacing + network latency), 15/run stays
    // safely inside Netlify's 30s function timeout with margin for fetch/dedup.
    maxNotificationsPerRun: 15,
    telegramSendIntervalMs: 1100,
  },
  cronSchedule: process.env['CRON_SCHEDULE'] ?? '*/10 * * * *',
};
