import type { LeadSource } from '../../types';
import { redditSource } from './reddit';
import { hackerNewsSource } from './hackernews';
import { hackerNewsThreadsSource } from './hackernews-threads';
import { remoteOkSource } from './remoteok';
import { weWorkRemotelySource } from './weworkremotely';
import { remotiveSource } from './remotive';
import { arbeitnowSource } from './arbeitnow';

export const leadSources: readonly LeadSource[] = [
  redditSource,
  hackerNewsSource,
  hackerNewsThreadsSource,
  remoteOkSource,
  weWorkRemotelySource,
  remotiveSource,
  arbeitnowSource,
];
