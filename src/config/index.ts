import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  readonly triggerKeywords: readonly string[];
  readonly devRelevanceKeywords: readonly string[];
  readonly exclusionTerms: readonly string[];
  readonly userAgent: string;
  readonly reddit: {
    readonly subreddits: readonly string[];
    readonly hiringOnlySubreddits: readonly string[];
    readonly postsPerSubreddit: number;
    readonly clientId: string;
    readonly clientSecret: string;
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

/**
 * Phrases that indicate genuine buying/hiring intent in free-form discussion
 * content (Reddit's general subs, HN front page) — used by 'intent-phrase' mode.
 */
const TRIGGER_KEYWORDS: readonly string[] = [
  'looking for developer',
  'looking for a developer',
  'need a developer',
  'need a dev',
  'need help building',
  'seeking developer',
  'seeking a developer',
  'looking to hire',
  'looking for a contractor',
  'who can build',
  'any recommendations for a developer',
  'budget for a developer',
  'recommendation for',
  'alternative to',
  'hiring dev',
  'shopify developer',
  'next.js dev',
  'looking for agency',
];

/**
 * Broad dev/tech relevance signals used by 'stack-relevance' mode — for
 * sources that are already inherently job/gig postings (RemoteOK, WWR,
 * Remotive, Arbeitnow, HN hiring/freelancer threads). These don't phrase
 * themselves as "looking for a developer", they just *are* dev job posts, so
 * intent-phrase matching would filter out nearly everything; relevance to
 * the dev/web stack is the right bar here instead.
 */
const DEV_RELEVANCE_KEYWORDS: readonly string[] = [
  'developer',
  'engineer',
  'programmer',
  'software',
  'full stack',
  'full-stack',
  'frontend',
  'front-end',
  'front end',
  'backend',
  'back-end',
  'back end',
  'react',
  'next.js',
  'nextjs',
  'node',
  'typescript',
  'javascript',
  'shopify',
  'ecommerce',
  'e-commerce',
  'saas',
  'wordpress',
  'web dev',
  'python',
  'ruby',
  'php',
  'ios developer',
  'android developer',
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
  devRelevanceKeywords: DEV_RELEVANCE_KEYWORDS,
  exclusionTerms: EXCLUSION_TERMS,
  userAgent: process.env['SCRAPER_USER_AGENT'] ?? 'lead-scraper-bot/1.0',
  reddit: {
    subreddits: SUBREDDITS,
    hiringOnlySubreddits: HIRING_ONLY_SUBREDDITS,
    postsPerSubreddit: 25,
    clientId: requireEnv('REDDIT_CLIENT_ID'),
    clientSecret: requireEnv('REDDIT_CLIENT_SECRET'),
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
    maxNotificationsPerRun: 40,
  },
  cronSchedule: process.env['CRON_SCHEDULE'] ?? '*/10 * * * *',
};
