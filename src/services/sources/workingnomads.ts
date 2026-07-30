import axios from 'axios';
import { config } from '../../config';
import { stripHtml } from '../../utils/html';
import type { LeadSource, NormalizedLead, WorkingNomadsJob } from '../../types';

function isRealJob(job: WorkingNomadsJob): job is WorkingNomadsJob & { url: string } {
  return typeof job.url === 'string' && job.url.length > 0;
}

function normalizeJob(job: WorkingNomadsJob & { url: string }): NormalizedLead {
  const createdUtc = job.pub_date ? Math.floor(new Date(job.pub_date).getTime() / 1000) : Math.floor(Date.now() / 1000);

  return {
    // No numeric ID field in this API — the URL is the only stable unique identifier.
    leadId: `workingnomads:${job.url}`,
    platform: 'workingnomads',
    channel: job.category_name ?? 'Working Nomads',
    title: job.title ?? '(untitled)',
    body: job.description ? stripHtml(job.description) : '',
    author: job.company_name ?? '[unknown]',
    url: job.url,
    createdUtc,
    filterMode: 'stack-relevance',
  };
}

/**
 * Fetches the Working Nomads public job feed, scoped to the "development"
 * category. Unofficial/undocumented endpoint — treated defensively, and
 * fetch failures are logged but never take down the rest of the pipeline.
 */
async function fetchLatest(): Promise<readonly NormalizedLead[]> {
  try {
    const response = await axios.get<readonly WorkingNomadsJob[]>(config.workingNomads.apiUrl, {
      params: { category: 'development' },
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      timeout: 8_000,
    });

    return response.data.filter(isRealJob).map(normalizeJob);
  } catch (error) {
    console.error(`[workingnomads] Failed to fetch job feed: ${(error as Error).message}`);
    return [];
  }
}

export const workingNomadsSource: LeadSource = {
  platform: 'workingnomads',
  fetchLatest,
};
