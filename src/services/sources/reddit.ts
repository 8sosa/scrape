import axios, { AxiosError } from 'axios';
import { config } from '../../config';
import { sleep } from '../../utils/sleep';
import type { LeadSource, NormalizedLead, RedditListingResponse, RedditPostData } from '../../types';

const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 1000;

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
  };
}

/**
 * Fetches the newest posts for a single subreddit, retrying with exponential
 * backoff on HTTP 429 (rate limited) responses per Reddit API guidelines.
 * Retries are capped low to stay within a serverless function's time budget —
 * a subreddit skipped this run is picked up again on the next scheduled poll.
 */
async function fetchSubredditNew(subreddit: string, attempt = 1): Promise<readonly NormalizedLead[]> {
  const url = `${config.reddit.baseUrl}/r/${subreddit}/new.json`;

  try {
    const response = await axios.get<RedditListingResponse>(url, {
      params: { limit: config.reddit.postsPerSubreddit },
      headers: {
        'User-Agent': config.userAgent,
        Accept: 'application/json',
      },
      timeout: 8_000,
    });

    return response.data.data.children
      .filter((child) => !child.data.stickied)
      .map((child) => normalizePost(subreddit, child.data));
  } catch (error) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;

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
  const results = await Promise.all(config.reddit.subreddits.map((subreddit) => fetchSubredditNew(subreddit)));
  return results.flat();
}

export const redditSource: LeadSource = {
  platform: 'reddit',
  fetchLatest,
};
