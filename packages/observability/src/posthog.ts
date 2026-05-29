import { env } from '@leedi/config';
import { PostHog } from 'posthog-node';

let posthogClient: PostHog | null = null;

function getPostHogClient(): PostHog {
  if (!posthogClient) {
    posthogClient = new PostHog(env.POSTHOG_KEY, {
      flushAt: 20,
      flushInterval: 10000,
    });
  }
  return posthogClient;
}

export const analytics = {
  capture(event: string, properties?: Record<string, unknown>, distinctId = 'anonymous'): void {
    const client = getPostHogClient();
    client.capture({ distinctId, event, properties: properties ?? {} });
  },
};

export async function flushAnalytics(): Promise<void> {
  if (posthogClient) {
    await posthogClient.flush();
  }
}
