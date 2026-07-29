import axios from 'axios';
import { config } from '../../config';
import { stripHtml } from '../../utils/html';
import type { ArbeitnowJob, ArbeitnowSearchResponse, LeadSource, NormalizedLead } from '../../types';

function isRealJob(job: ArbeitnowJob): job is ArbeitnowJob & { slug: string; url: string } {
  return typeof job.slug === 'string' && job.slug.length > 0 && typeof job.url === 'string' && job.url.length > 0;
}

function normalizeJob(job: ArbeitnowJob & { slug: string; url: string }): NormalizedLead {
  return {
    leadId: `arbeitnow:${job.slug}`,
    platform: 'arbeitnow',
    channel: job.tags && job.tags.length > 0 ? job.tags.slice(0, 3).join(', ') : 'Arbeitnow',
    title: job.title ?? '(untitled)',
    body: job.description ? stripHtml(job.description) : '',
    author: job.company_name ?? '[unknown]',
    url: job.url,
    createdUtc: job.created_at ?? Math.floor(Date.now() / 1000),
    filterMode: 'stack-relevance',
  };
}

/**
 * Fetches the Arbeitnow public job board — a mixed-discipline EU/remote job
 * feed with no category filter param, so relevance to the dev stack is
 * enforced entirely by the 'stack-relevance' filter mode downstream.
 */
async function fetchLatest(): Promise<readonly NormalizedLead[]> {
  try {
    const response = await axios.get<ArbeitnowSearchResponse>(config.arbeitnow.apiUrl, {
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      timeout: 8_000,
    });

    return response.data.data.filter(isRealJob).map(normalizeJob);
  } catch (error) {
    console.error(`[arbeitnow] Failed to fetch job feed: ${(error as Error).message}`);
    return [];
  }
}

export const arbeitnowSource: LeadSource = {
  platform: 'arbeitnow',
  fetchLatest,
};
