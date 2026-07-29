import axios from 'axios';
import { config } from '../../config';
import { stripHtml } from '../../utils/html';
import type { LeadSource, NormalizedLead, RemotiveJob, RemotiveSearchResponse } from '../../types';

function isRealJob(job: RemotiveJob): job is RemotiveJob & { id: number; url: string } {
  return typeof job.id === 'number' && typeof job.url === 'string' && job.url.length > 0;
}

function normalizeJob(job: RemotiveJob & { id: number; url: string }): NormalizedLead {
  const createdUtc = job.publication_date
    ? Math.floor(new Date(job.publication_date).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  return {
    leadId: `remotive:${job.id}`,
    platform: 'remotive',
    channel: job.category ?? 'Remotive',
    title: job.title ?? '(untitled)',
    body: job.description ? stripHtml(job.description) : '',
    author: job.company_name ?? '[unknown]',
    url: job.url,
    createdUtc,
    filterMode: 'stack-relevance',
  };
}

/** Fetches the Remotive public job feed, scoped to the software-dev category. Free, no API key required. */
async function fetchLatest(): Promise<readonly NormalizedLead[]> {
  try {
    const response = await axios.get<RemotiveSearchResponse>(config.remotive.apiUrl, {
      params: { category: 'software-dev' },
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      timeout: 8_000,
    });

    return response.data.jobs.filter(isRealJob).map(normalizeJob);
  } catch (error) {
    console.error(`[remotive] Failed to fetch job feed: ${(error as Error).message}`);
    return [];
  }
}

export const remotiveSource: LeadSource = {
  platform: 'remotive',
  fetchLatest,
};
