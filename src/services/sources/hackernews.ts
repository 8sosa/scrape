import axios from 'axios';
import { config } from '../../config';
import type { HackerNewsHit, HackerNewsSearchResponse, LeadSource, NormalizedLead } from '../../types';

function normalizeHit(hit: HackerNewsHit): NormalizedLead {
  return {
    leadId: `hackernews:${hit.objectID}`,
    platform: 'hackernews',
    channel: 'Hacker News',
    title: hit.title ?? '(untitled)',
    body: hit.story_text ?? '',
    author: hit.author ?? '[unknown]',
    url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
    createdUtc: hit.created_at_i,
  };
}

/**
 * Polls recent HN stories via the Algolia search API, bounded to a lookback
 * window slightly larger than the cron cadence so a slow/delayed run never
 * creates a gap in coverage.
 */
async function fetchLatest(): Promise<readonly NormalizedLead[]> {
  const cutoff = Math.floor(Date.now() / 1000) - config.hackerNews.lookbackSeconds;
  const url = `${config.hackerNews.apiBaseUrl}/search_by_date`;

  try {
    const response = await axios.get<HackerNewsSearchResponse>(url, {
      params: {
        tags: 'story',
        hitsPerPage: config.hackerNews.hitsPerPage,
        numericFilters: `created_at_i>${cutoff}`,
      },
      headers: { 'User-Agent': config.userAgent },
      timeout: 8_000,
    });

    return response.data.hits.map(normalizeHit);
  } catch (error) {
    console.error(`[hackernews] Failed to fetch recent stories: ${(error as Error).message}`);
    return [];
  }
}

export const hackerNewsSource: LeadSource = {
  platform: 'hackernews',
  fetchLatest,
};
