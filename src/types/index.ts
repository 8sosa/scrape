/** Minimal shape of a Reddit "Link" object as returned by the .json listing endpoints. */
export interface RedditPostData {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly selftext: string;
  readonly author: string;
  readonly subreddit: string;
  readonly permalink: string;
  readonly url: string;
  readonly created_utc: number;
  readonly stickied: boolean;
  readonly is_self: boolean;
}

interface RedditChild {
  readonly kind: string;
  readonly data: RedditPostData;
}

export interface RedditListingResponse {
  readonly kind: string;
  readonly data: {
    readonly children: readonly RedditChild[];
    readonly after: string | null;
    readonly before: string | null;
  };
}

/** Shape of a single hit from the Hacker News Algolia search API. */
export interface HackerNewsHit {
  readonly objectID: string;
  readonly title: string | null;
  readonly url: string | null;
  readonly author: string | null;
  readonly story_text: string | null;
  readonly created_at_i: number;
}

export interface HackerNewsSearchResponse {
  readonly hits: readonly HackerNewsHit[];
}

/** Shape of a single job listing from the RemoteOK JSON API (undocumented, treated defensively). */
export interface RemoteOkJob {
  readonly id?: string;
  readonly slug?: string;
  readonly position?: string;
  readonly company?: string;
  readonly description?: string;
  readonly url?: string;
  readonly date?: string;
  readonly tags?: readonly string[];
  /** The first array element is always a legal/API notice object with no `id`. */
  readonly legal?: string;
}

/** Platforms this system polls for leads. */
export type LeadPlatform = 'reddit' | 'hackernews' | 'remoteok' | 'weworkremotely';

/**
 * Normalized, app-internal representation of a lead, regardless of which
 * platform it originated from. `leadId` is globally unique (prefixed by
 * platform) so it can be safely deduplicated across sources in one table.
 */
export interface NormalizedLead {
  readonly leadId: string;
  readonly platform: LeadPlatform;
  /** Human-readable origin within the platform, e.g. a subreddit name or RSS category. */
  readonly channel: string;
  readonly title: string;
  readonly body: string;
  readonly author: string;
  readonly url: string;
  readonly createdUtc: number;
}

/** A source adapter knows how to fetch and normalize the latest items from one platform. */
export interface LeadSource {
  readonly platform: LeadPlatform;
  fetchLatest(): Promise<readonly NormalizedLead[]>;
}

export interface FilterResult {
  readonly isMatch: boolean;
  readonly matchedTriggers: readonly string[];
}

export interface ProcessedLeadRecord {
  readonly lead_id: string;
  readonly platform: LeadPlatform;
  readonly channel: string;
  readonly title: string;
  readonly url: string;
}

export interface PipelineRunSummary {
  readonly fetched: number;
  readonly matched: number;
  readonly new: number;
  readonly notified: number;
}
