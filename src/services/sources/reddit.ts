import axios, { AxiosError } from 'axios';
import { config } from '../../config';
import { sleep } from '../../utils/sleep';
import type { LeadFilterMode, LeadSource, NormalizedLead, RedditListingResponse, RedditPostData } from '../../types';

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1000;
// Refresh a bit before actual expiry so a near-expiry token is never used mid-run.
const TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS = 60;

interface RedditTokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
}

interface CachedToken {
  readonly accessToken: string;
  readonly expiresAt: number;
}

/**
 * Reddit's unauthenticated `www.reddit.com/*.json` endpoints increasingly
 * return 403 for requests from cloud/serverless IP ranges (Netlify, AWS,
 * Vercel, etc.), regardless of User-Agent. OAuth traffic to oauth.reddit.com
 * is not subject to that block, so this module trades the public JSON
 * listing for a script-app client_credentials token. Cached at module scope
 * so warm serverless invocations reuse it instead of re-authenticating every run.
 */
let cachedToken: CachedToken | null = null;

async function fetchAccessToken(): Promise<string> {
  const response = await axios.post<RedditTokenResponse>(
    config.reddit.tokenUrl,
    new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
    {
      auth: { username: config.reddit.clientId, password: config.reddit.clientSecret },
      headers: {
        'User-Agent': config.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 8_000,
    },
  );

  const expiresAt = Date.now() + (response.data.expires_in - TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS) * 1000;
  cachedToken = { accessToken: response.data.access_token, expiresAt };
  return cachedToken.accessToken;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }
  return fetchAccessToken();
}

function getFilterMode(subreddit: string): LeadFilterMode {
  const isHiringOnly = config.reddit.hiringOnlySubreddits.some((s) => s.toLowerCase() === subreddit.toLowerCase());
  return isHiringOnly ? 'strict-hiring-tag' : 'intent-phrase';
}

function normalizePost(subreddit: string, data: RedditPostData): NormalizedLead {
  return {
    leadId: `reddit:${data.name}`,
    platform: 'reddit',
    channel: subreddit,
    title: data.title ?? '',
    body: data.selftext ?? '',
    author: data.author ?? '[unknown]',
    url: `https://www.reddit.com${data.permalink}`,
    createdUtc: data.created_utc,
    filterMode: getFilterMode(subreddit),
  };
}

/**
 * Fetches the newest posts for a single subreddit via the OAuth API, retrying
 * once on a stale/invalid token (401) and with backoff on rate limiting
 * (429). Retries are capped low to stay within a serverless function's time
 * budget — a subreddit skipped this run is picked up again on the next poll.
 */
async function fetchSubredditNew(subreddit: string, attempt = 1): Promise<readonly NormalizedLead[]> {
  const url = `${config.reddit.oauthBaseUrl}/r/${subreddit}/new`;

  try {
    const token = await getAccessToken();
    const response = await axios.get<RedditListingResponse>(url, {
      params: { limit: config.reddit.postsPerSubreddit },
      headers: {
        'User-Agent': config.userAgent,
        Authorization: `Bearer ${token}`,
      },
      timeout: 8_000,
    });

    return response.data.data.children
      .filter((child) => !child.data.stickied)
      .map((child) => normalizePost(subreddit, child.data));
  } catch (error) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;

    if (status === 401 && attempt <= MAX_RETRIES) {
      console.warn(`[reddit] Token rejected fetching r/${subreddit} (attempt ${attempt}/${MAX_RETRIES}). Refreshing token.`);
      cachedToken = null;
      return fetchSubredditNew(subreddit, attempt + 1);
    }

    if (status === 429 && attempt <= MAX_RETRIES) {
      const retryAfterHeader = axiosError.response?.headers['retry-after'];
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : BASE_BACKOFF_MS * 2 ** (attempt - 1);
      console.warn(
        `[reddit] Rate limited on r/${subreddit} (attempt ${attempt}/${MAX_RETRIES}). Backing off for ${retryAfterMs}ms.`,
      );
      await sleep(retryAfterMs);
      return fetchSubredditNew(subreddit, attempt + 1);
    }

    console.error(`[reddit] Failed to fetch r/${subreddit}: ${axiosError.message}`);
    return [];
  }
}

async function fetchLatest(): Promise<readonly NormalizedLead[]> {
  // Acquire the token once up front so 8 parallel subreddit fetches don't each trigger their own auth request.
  await getAccessToken();
  const results = await Promise.all(config.reddit.subreddits.map((subreddit) => fetchSubredditNew(subreddit)));
  return results.flat();
}

export const redditSource: LeadSource = {
  platform: 'reddit',
  fetchLatest,
};
