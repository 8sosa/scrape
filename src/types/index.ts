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

/** Shape of a single hit from the Hacker News Algolia search API — covers both stories and comments. */
export interface HackerNewsHit {
  readonly objectID: string;
  readonly title: string | null;
  readonly url: string | null;
  readonly author: string | null;
  readonly story_text: string | null;
  readonly comment_text?: string | null;
  readonly parent_id?: number | null;
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

/** Shape of a single job listing from the Remotive JSON API. */
export interface RemotiveJob {
  readonly id?: number;
  readonly url?: string;
  readonly title?: string;
  readonly company_name?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly publication_date?: string;
  readonly description?: string;
}

export interface RemotiveSearchResponse {
  readonly jobs: readonly RemotiveJob[];
}

/** Shape of a single job listing from the Arbeitnow JSON API. */
export interface ArbeitnowJob {
  readonly slug?: string;
  readonly company_name?: string;
  readonly title?: string;
  readonly description?: string;
  readonly url?: string;
  readonly tags?: readonly string[];
  readonly job_types?: readonly string[];
  readonly remote?: boolean;
  /** Unix seconds. */
  readonly created_at?: number;
}

export interface ArbeitnowSearchResponse {
  readonly data: readonly ArbeitnowJob[];
}

/** Platforms this system polls for leads. */
export type LeadPlatform = 'reddit' | 'hackernews' | 'remoteok' | 'weworkremotely' | 'remotive' | 'arbeitnow';

/**
 * How a lead should be evaluated for high-intent matching, chosen by the
 * source adapter that produced it (it knows best whether its content is a
 * discussion post that needs intent-phrase detection, a strictly-tagged
 * meta subreddit, or an inherently-already-a-job-posting listing).
 */
export type LeadFilterMode = 'strict-hiring-tag' | 'intent-phrase' | 'stack-relevance';

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
  readonly filterMode: LeadFilterMode;
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
  readonly tenant: string;
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
  readonly deferred: number;
}

/** Result of scoring one lead's mentioned tech stack against the resume skill list. */
export interface LeadMatch {
  /** 0-10: what fraction of the lead's mentioned skills are ones on the resume. 0 if the lead mentions no recognized skill at all. */
  readonly score: number;
  readonly matchedSkills: readonly string[];
  readonly mentionedSkills: readonly string[];
}
