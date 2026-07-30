import axios from 'axios';
import { config } from '../../config';
import { stripHtml } from '../../utils/html';
import type { HimalayasJob, HimalayasSearchResponse, LeadSource, NormalizedLead } from '../../types';

/** Himalayas caps at 20 results per page and doesn't support a category filter on the browse endpoint. */
const PAGE_LIMIT = 20;

function isRealJob(job: HimalayasJob): job is HimalayasJob & { guid: string } {
  return typeof job.guid === 'string' && job.guid.length > 0;
}

function normalizeJob(job: HimalayasJob & { guid: string }): NormalizedLead {
  return {
    leadId: `himalayas:${job.guid}`,
    platform: 'himalayas',
    channel: job.categories && job.categories.length > 0 ? job.categories.slice(0, 3).join(', ') : 'Himalayas',
    title: job.title ?? '(untitled)',
    body: job.description ? stripHtml(job.description) : (job.excerpt ?? ''),
    author: job.companyName ?? '[unknown]',
    url: job.applicationLink ?? job.guid,
    createdUtc: job.pubDate ?? Math.floor(Date.now() / 1000),
    filterMode: 'stack-relevance',
  };
}

/**
 * Fetches the Himalayas public job feed. Himalayas's underlying data only
 * refreshes once every 24h and enforces an undisclosed rate limit, so this
 * only actually hits the API once per hour (at the top of the hour) rather
 * than every 10-minute poll — polling more often than the source itself
 * updates would just burn through that limit for no new data.
 */
async function fetchLatest(): Promise<readonly NormalizedLead[]> {
  if (new Date().getUTCMinutes() >= 10) {
    console.log('[himalayas] Skipping this run — only polls once/hour since the underlying data refreshes daily.');
    return [];
  }

  try {
    const response = await axios.get<HimalayasSearchResponse>(config.himalayas.apiUrl, {
      params: { offset: 0, limit: PAGE_LIMIT },
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      timeout: 8_000,
    });

    return response.data.jobs.filter(isRealJob).map(normalizeJob);
  } catch (error) {
    console.error(`[himalayas] Failed to fetch job feed: ${(error as Error).message}`);
    return [];
  }
}

export const himalayasSource: LeadSource = {
  platform: 'himalayas',
  fetchLatest,
};
