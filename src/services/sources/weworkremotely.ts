import Parser from 'rss-parser';
import { config } from '../../config';
import { stripHtml } from '../../utils/html';
import type { LeadSource, NormalizedLead } from '../../types';

const parser = new Parser({
  headers: { 'User-Agent': config.userAgent },
  timeout: 8_000,
});

/** WWR titles follow the convention "Company Name: Job Title" — split out the company as the author. */
function splitTitle(rawTitle: string): { readonly author: string; readonly title: string } {
  const separatorIndex = rawTitle.indexOf(':');
  if (separatorIndex === -1) {
    return { author: '[unknown]', title: rawTitle };
  }
  return {
    author: rawTitle.slice(0, separatorIndex).trim(),
    title: rawTitle.slice(separatorIndex + 1).trim(),
  };
}

async function fetchFeed(feedUrl: string): Promise<readonly NormalizedLead[]> {
  try {
    const feed = await parser.parseURL(feedUrl);
    const channel = feed.title ?? 'We Work Remotely';

    return (feed.items ?? []).flatMap((item): readonly NormalizedLead[] => {
      const link = item.link;
      const guid = item.guid ?? link;
      if (!link || !guid) {
        return [];
      }

      const { author, title } = splitTitle(item.title ?? '(untitled)');
      const rawBody = item.contentSnippet ?? (item.content ? stripHtml(item.content) : '');
      const createdUtc = item.pubDate ? Math.floor(new Date(item.pubDate).getTime() / 1000) : Math.floor(Date.now() / 1000);

      return [
        {
          leadId: `weworkremotely:${guid}`,
          platform: 'weworkremotely',
          channel,
          title,
          body: rawBody,
          author,
          url: link,
          createdUtc,
          filterMode: 'stack-relevance',
        },
      ];
    });
  } catch (error) {
    console.error(`[weworkremotely] Failed to fetch feed ${feedUrl}: ${(error as Error).message}`);
    return [];
  }
}

async function fetchLatest(): Promise<readonly NormalizedLead[]> {
  const results = await Promise.all(config.weWorkRemotely.feedUrls.map(fetchFeed));
  return results.flat();
}

export const weWorkRemotelySource: LeadSource = {
  platform: 'weworkremotely',
  fetchLatest,
};
