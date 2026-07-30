import axios from 'axios';
import { config } from '../../config';
import { stripHtml } from '../../utils/html';
import type { LeadSource, NormalizedLead, RemoteOkJob } from '../../types';

function isRealJob(job: RemoteOkJob): job is RemoteOkJob & { id: string } {
  // The API's first array element is always a legal/API notice with no `id` — filter it out.
  return typeof job.id === 'string' && job.id.length > 0;
}

function normalizeJob(job: RemoteOkJob & { id: string }): NormalizedLead {
  const createdUtc = job.date ? Math.floor(new Date(job.date).getTime() / 1000) : Math.floor(Date.now() / 1000);

  return {
    leadId: `remoteok:${job.id}`,
    platform: 'remoteok',
    channel: job.tags && job.tags.length > 0 ? job.tags.slice(0, 3).join(', ') : 'RemoteOK',
    title: job.position ?? '(untitled)',
    body: job.description ? stripHtml(job.description) : '',
    author: job.company ?? '[unknown]',
    url: job.url ?? `https://remoteok.com/remote-jobs/${job.id}`,
    createdUtc,
    filterMode: 'stack-relevance',
  };
}

/**
 * Fetches the RemoteOK public job feed, unfiltered by tag — RemoteOK's tag
 * taxonomy skews toward engineering roles and doesn't reliably cover
 * BI/data/CRM/onboarding roles, so relevance is enforced entirely by the
 * 'stack-relevance' filter mode downstream instead. Requires a descriptive
 * User-Agent — the default axios UA gets blocked.
 */
async function fetchLatest(): Promise<readonly NormalizedLead[]> {
  try {
    const response = await axios.get<readonly RemoteOkJob[]>(config.remoteOk.apiUrl, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      timeout: 8_000,
    });

    return response.data.filter(isRealJob).map(normalizeJob);
  } catch (error) {
    console.error(`[remoteok] Failed to fetch job feed: ${(error as Error).message}`);
    return [];
  }
}

export const remoteOkSource: LeadSource = {
  platform: 'remoteok',
  fetchLatest,
};
