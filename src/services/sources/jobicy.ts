import axios from 'axios';
import { config } from '../../config';
import { stripHtml } from '../../utils/html';
import type { JobicyJob, JobicySearchResponse, LeadSource, NormalizedLead } from '../../types';

function isRealJob(job: JobicyJob): job is JobicyJob & { id: number; url: string } {
  return typeof job.id === 'number' && typeof job.url === 'string' && job.url.length > 0;
}

function normalizeJob(job: JobicyJob & { id: number; url: string }): NormalizedLead {
  const createdUtc = job.pubDate ? Math.floor(new Date(job.pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000);

  return {
    leadId: `jobicy:${job.id}`,
    platform: 'jobicy',
    channel: job.jobIndustry && job.jobIndustry.length > 0 ? job.jobIndustry.join(', ') : 'Jobicy',
    title: job.jobTitle ?? '(untitled)',
    body: job.jobDescription ? stripHtml(job.jobDescription) : (job.jobExcerpt ?? ''),
    author: job.companyName ?? '[unknown]',
    url: job.url,
    createdUtc,
    filterMode: 'stack-relevance',
  };
}

/**
 * Fetches the Jobicy public job feed, unfiltered by industry — Jobicy's
 * confirmed industry values skew toward engineering/dev and don't reliably
 * cover BI/data/CRM/onboarding roles, so relevance is enforced entirely by
 * the 'stack-relevance' filter mode downstream instead. Free, no API key required.
 */
async function fetchLatest(): Promise<readonly NormalizedLead[]> {
  try {
    const response = await axios.get<JobicySearchResponse>(config.jobicy.apiUrl, {
      params: { count: 50 },
      headers: { 'User-Agent': config.userAgent, Accept: 'application/json' },
      timeout: 8_000,
    });

    return response.data.jobs.filter(isRealJob).map(normalizeJob);
  } catch (error) {
    console.error(`[jobicy] Failed to fetch job feed: ${(error as Error).message}`);
    return [];
  }
}

export const jobicySource: LeadSource = {
  platform: 'jobicy',
  fetchLatest,
};
