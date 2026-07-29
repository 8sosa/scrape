import cron from 'node-cron';
import { config } from './config';
import { runPipeline } from './pipeline';

/**
 * Standalone entrypoint for running this as a long-lived process (local dev,
 * or a self-hosted VPS) with its own in-process scheduler. Not used when
 * deployed to Netlify — there, `netlify/functions/poll-leads.ts` is invoked
 * directly on Netlify's own cron schedule instead.
 */
function main(): void {
  console.log('[startup] Reddit/job-board lead scraper initializing...');
  console.log(`[startup] Cron schedule: ${config.cronSchedule}`);

  if (!cron.validate(config.cronSchedule)) {
    throw new Error(`Invalid CRON_SCHEDULE: "${config.cronSchedule}"`);
  }

  // Run once immediately on startup, then on the configured cron schedule.
  void runPipeline();

  cron.schedule(config.cronSchedule, () => {
    void runPipeline();
  });

  console.log('[startup] Scheduler active. Waiting for next scheduled run...');
}

main();
