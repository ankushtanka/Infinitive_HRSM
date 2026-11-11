export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { startAutoCheckoutCronJob } = await import('@/jobs/autoCheckoutJob');
      startAutoCheckoutCronJob();
    } catch (err) {
      console.error('[Instrumentation] Error initializing auto-checkout cron job:', err);
    }
  }
}

