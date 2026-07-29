import type { LeadSource } from '../../types';
import { redditSource } from './reddit';
import { hackerNewsSource } from './hackernews';
import { remoteOkSource } from './remoteok';
import { weWorkRemotelySource } from './weworkremotely';

export const leadSources: readonly LeadSource[] = [redditSource, hackerNewsSource, remoteOkSource, weWorkRemotelySource];
