import type { Config } from '@netlify/functions';
import { runPipeline } from '../../src/pipeline';

/**
 * Netlify Scheduled Function entrypoint. Netlify invokes this on the cron
 * schedule below regardless of what's in CRON_SCHEDULE — that env var only
 * drives the standalone src/index.ts (node-cron) entrypoint for local/self-hosted runs.
 */
export default async (): Promise<Response> => {
  try {
    const summary = await runPipeline();
    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (error) {
    console.error('[poll-leads] Unhandled pipeline error:', error);
    return new Response(JSON.stringify({ error: 'Pipeline run failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};

export const config: Config = {
  schedule: '*/10 * * * *',
};
