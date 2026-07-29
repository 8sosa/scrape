import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  readonly triggerKeywords: readonly string[];
  readonly exclusionTerms: readonly string[];
  readonly userAgent: string;
  readonly reddit: {
    readonly subreddits: readonly string[];
    readonly hiringOnlySubreddits: readonly string[];
    readonly postsPerSubreddit: number;
    readonly baseUrl: string;
  };
  readonly hackerNews: {
    readonly apiBaseUrl: string;
    readonly hitsPerPage: number;
    /** Only consider stories newer than this many seconds, to bound each poll to the current cron window. */
    readonly lookbackSeconds: number;
  };
  readonly remoteOk: {
    readonly apiUrl: string;
  };
  readonly weWorkRemotely: {
    readonly feedUrls: readonly string[];
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
  readonly cronSchedule: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Subreddits to poll for high-intent leads. */
const SUBREDDITS: readonly string[] = [
  'startups',
  'freelance_forhire',
  'forhire',
  'Nextjs',
  'shopify',
  'ecommerce',
  'SaaS',
  'reactjs',
];

/** Phrases that indicate genuine buying/hiring intent, checked across all platforms. */
const TRIGGER_KEYWORDS: readonly string[] = [
  'looking for developer',
  'need a developer',
  'recommendation for',
  'alternative to',
  'hiring dev',
  'shopify developer',
  'next.js dev',
  'looking for agency',
];

/** Phrases that indicate self-promotion rather than buying intent — always ignored. */
const EXCLUSION_TERMS: readonly string[] = ['[for hire]', 'i am offering', 'hire me'];

/**
 * Meta hiring subreddits where the [HIRING]/[FOR HIRE] tag convention applies.
 * Posts here are gated strictly on the [HIRING] tag rather than free-text keyword matching.
 */
const HIRING_ONLY_SUBREDDITS: readonly string[] = ['forhire', 'freelance_forhire'];

/** WWR category feeds scoped to software roles — the closest fit to the dev-lead use case. */
const WWR_FEED_URLS: readonly string[] = [
  'https://weworkremotely.com/categories/remote-full-stack-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-front-end-programming-jobs.rss',
  'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
];

export const config: AppConfig = {
  triggerKeywords: TRIGGER_KEYWORDS,
  exclusionTerms: EXCLUSION_TERMS,
  userAgent: process.env['SCRAPER_USER_AGENT'] ?? 'lead-scraper-bot/1.0',
  reddit: {
    subreddits: SUBREDDITS,
    hiringOnlySubreddits: HIRING_ONLY_SUBREDDITS,
    postsPerSubreddit: 25,
    baseUrl: 'https://www.reddit.com',
  },
  hackerNews: {
    apiBaseUrl: 'https://hn.algolia.com/api/v1',
    hitsPerPage: 50,
    lookbackSeconds: 20 * 60,
  },
  remoteOk: {
    apiUrl: 'https://remoteok.com/api',
  },
  weWorkRemotely: {
    feedUrls: WWR_FEED_URLS,
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
  cronSchedule: process.env['CRON_SCHEDULE'] ?? '*/10 * * * *',
};
