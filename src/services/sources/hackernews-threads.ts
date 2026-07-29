import axios from 'axios';
import { config } from '../../config';
import { stripHtml } from '../../utils/html';
import type { HackerNewsHit, HackerNewsSearchResponse, LeadSource, NormalizedLead } from '../../types';

/** The account HN's automated monthly hiring/freelancer threads are always posted under. */
const THREAD_AUTHOR = 'whoishiring';

/**
 * Only these two monthly threads — never "Who wants to be hired?" (candidates
 * advertising themselves, not buyers) or anything else the account posts.
 */
const THREAD_MATCHERS: readonly { readonly label: string; readonly titlePattern: RegExp }[] = [
  { label: 'HN: Who is hiring?', titlePattern: /who is hiring/i },
  { label: 'HN: Freelancer? Seeking freelancer?', titlePattern: /freelancer/i },
];

async function findLatestThreadId(titlePattern: RegExp): Promise<string | null> {
  const response = await axios.get<HackerNewsSearchResponse>(`${config.hackerNews.apiBaseUrl}/search_by_date`, {
    params: { tags: `story,author_${THREAD_AUTHOR}`, hitsPerPage: 10 },
    headers: { 'User-Agent': config.userAgent },
    timeout: 8_000,
  });

  const match = response.data.hits.find((hit) => hit.title && titlePattern.test(hit.title));
  return match?.objectID ?? null;
}

function normalizeComment(channel: string, hit: HackerNewsHit): NormalizedLead | null {
  if (!hit.comment_text) {
    return null;
  }

  const body = stripHtml(hit.comment_text);
  if (body.length === 0) {
    return null;
  }

  return {
    leadId: `hackernews:${hit.objectID}`,
    platform: 'hackernews',
    channel,
    title: body.slice(0, 100),
    body,
    author: hit.author ?? '[unknown]',
    url: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    createdUtc: hit.created_at_i,
    filterMode: 'stack-relevance',
  };
}

/** Fetches only top-level comments (direct replies to the thread itself) — nested replies are back-and-forth noise. */
async function fetchThreadTopLevelComments(threadId: string, channel: string): Promise<readonly NormalizedLead[]> {
  const response = await axios.get<HackerNewsSearchResponse>(`${config.hackerNews.apiBaseUrl}/search_by_date`, {
    params: { tags: `comment,story_${threadId}`, hitsPerPage: config.hackerNews.threadHitsPerPage },
    headers: { 'User-Agent': config.userAgent },
    timeout: 10_000,
  });

  return response.data.hits
    .filter((hit) => String(hit.parent_id) === threadId)
    .map((hit) => normalizeComment(channel, hit))
    .filter((lead): lead is NormalizedLead => lead !== null);
}

/**
 * Every month HN's "whoishiring" bot posts fresh "Who is hiring?" and
 * "Freelancer? Seeking freelancer?" threads. Top-level comments in the
 * freelancer thread are, by construction, buyers seeking a contractor — very
 * high-signal for this use case. Thread IDs are discovered dynamically each
 * run rather than hardcoded, since a new thread posts every month.
 */
async function fetchLatest(): Promise<readonly NormalizedLead[]> {
  const results: NormalizedLead[] = [];

  for (const { label, titlePattern } of THREAD_MATCHERS) {
    try {
      const threadId = await findLatestThreadId(titlePattern);
      if (!threadId) {
        console.warn(`[hackernews-threads] Could not find a current thread matching "${label}"`);
        continue;
      }
      const comments = await fetchThreadTopLevelComments(threadId, label);
      results.push(...comments);
    } catch (error) {
      console.error(`[hackernews-threads] Failed to fetch "${label}": ${(error as Error).message}`);
    }
  }

  return results;
}

export const hackerNewsThreadsSource: LeadSource = {
  platform: 'hackernews',
  fetchLatest,
};
