// utils/rateLimiter.ts
import redis, { isRedisConfigured } from '@/lib/redis';

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Checks and updates the leaky bucket for a given user.
 * 
 * @param userId - The unique identifier for the Pro user.
 * @param capacity - Maximum number of allowed messages (default: 80).
 * @param duration - The duration (in seconds) over which the capacity is allowed (default: 5 hours).
 * @throws An error if the rate limit is exceeded.
 */
export async function checkRateLimit(
  userId: string,
  capacity: number = envNumber('AI_RATE_LIMIT_CAPACITY', 80),
  duration: number = envNumber('AI_RATE_LIMIT_WINDOW_SECONDS', 5 * 60 * 60)
): Promise<void> {
  // Skip rate limiting in development environment
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  // Without Redis there is nowhere to keep the bucket. Skipping is the only
  // option that keeps the app usable, but it means an unmetered instance:
  // if you share this deployment, configure Redis so one user cannot run up
  // your provider bill on their own.
  if (!isRedisConfigured()) {
    return;
  }

  const LEAK_RATE = capacity / duration; // tokens leaked per second
  const redisKey = `rate-limit:pro:${userId}`;
  const now = Date.now() / 1000; // current time in seconds

  // Get existing bucket data from Redis. A Redis that is configured but not
  // reachable must not take the AI request down with it: the limiter protects
  // your provider bill, it is not part of the request's correctness. Fail open
  // and let the request through rather than returning a 500 the user cannot act
  // on. The warning in redis.ts fires once so this stays visible.
  let bucket: Record<string, string> | null;
  try {
    bucket = await redis.hgetall(redisKey);
  } catch {
    return;
  }

  let tokens: number;
  let last: number;

  if (!bucket || !bucket.tokens || !bucket.last) {
    // No bucket exists yet—initialize it.
    tokens = 0;
    last = now;
    // Set an expiration a bit longer than the duration so that stale data is removed.
    try {
      await redis.expire(redisKey, duration + 3600);
    } catch {
      return;
    }
  } else {
    tokens = parseFloat(bucket.tokens as string);
    last = parseFloat(bucket.last as string);
  }

  // Compute the time elapsed since the last update and "leak" tokens.
  const delta = now - last;
  tokens = Math.max(0, tokens - delta * LEAK_RATE);

  // Add one token for the current request.
  const newTokens = tokens + 1;

  if (newTokens > capacity) {
    // Calculate how many seconds remain until the bucket drains enough.
    const timeLeft = Math.ceil(((newTokens - capacity) * duration) / capacity);
    throw new Error(`Rate limit exceeded. Try again in ${timeLeft} seconds.`);
  }

  // Update the bucket in Redis with the new token count and current timestamp.
  // A write failure here means this request goes unmetered; that is strictly
  // better than failing a request that was already found to be within budget.
  try {
    await redis.hset(redisKey, { tokens: newTokens.toString(), last: now.toString() });
    await redis.expire(redisKey, duration + 3600);
  } catch {
    // Intentionally ignored — see above.
  }
}
