import axios from 'axios';
import { config } from '../../config';
import { stripHtml } from '../../utils/html';
import type { ArbeitnowJob, ArbeitnowSearchResponse, LeadSource, NormalizedLead } from '../../types';

/**
 * Arbeitnow is a mixed on-site/remote EU job board — its `remote` flag is
 * the only reliable signal, so non-remote listings (the bulk of it, mostly
 * Berlin/London/etc. on-site roles) are excluded right here at the source
 * rather than relying on text heuristics downstream.
 */
function isRealRemoteJob(job: ArbeitnowJob): job is ArbeitnowJob & { slug: string; url: string } {
  return typeof job.slug === 'string' && job.slug.length > 0 && typeof job.url === 'string' && job.url.length > 0 && job.remote === true;
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

    return response.data.data.filter(isRealRemoteJob).map(normalizeJob);
  } catch (error) {
    console.error(`[arbeitnow] Failed to fetch job feed: ${(error as Error).message}`);
    return [];
  }
}

export const arbeitnowSource: LeadSource = {
  platform: 'arbeitnow',
  fetchLatest,
};
