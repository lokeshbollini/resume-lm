import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";

/**
 * Unified Redis client interface that works with both local Redis (ioredis)
 * and cloud Redis (Upstash). Set USE_LOCAL_REDIS=true to use local Redis.
 */
interface RedisClient {
  hgetall(key: string): Promise<Record<string, string> | null>;
  hset(key: string, data: Record<string, string>): Promise<number | "OK">;
  expire(key: string, seconds: number): Promise<number | boolean>;
}

const useLocalRedis = process.env.USE_LOCAL_REDIS === "true";

function createRedisClient(): RedisClient {
  if (useLocalRedis && process.env.REDIS_URL) {
    const client = new IORedis(process.env.REDIS_URL, {
      // Without a bound on retries, a Redis that is configured but not running
      // (REDIS_URL copied from .env.example with no server on :6379) reconnects
      // forever and every command hangs until it does.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      retryStrategy(times) {
        if (times > 3) return null; // stop reconnecting
        return Math.min(times * 200, 1000);
      },
    });

    // ioredis emits 'error' on every failed connection attempt. With no
    // listener attached, Node logs "[ioredis] Unhandled error event" for each
    // one and an EventEmitter 'error' with no handler can take down the
    // process. Log the first, then stay quiet.
    let loggedConnectionError = false;
    client.on("error", (error: Error) => {
      if (!loggedConnectionError) {
        loggedConnectionError = true;
        console.warn(
          `[redis] unavailable at ${process.env.REDIS_URL} (${error.message}). ` +
            "Rate limiting is disabled until it comes back. Set USE_LOCAL_REDIS=false " +
            "if you did not mean to run a local Redis.",
        );
      }
    });

    return {
      hgetall: (key) => client.hgetall(key).then(r => Object.keys(r).length ? r : null),
      hset: (key, data) => client.hset(key, data),
      expire: (key, seconds) => client.expire(key, seconds).then(r => r === 1),
    };
  }

  const client = new UpstashRedis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return client as unknown as RedisClient;
}

/**
 * Built on first use rather than at import time. A deployment with no Redis
 * configured (the common self-hosted case) would otherwise fail at module load
 * inside the Upstash constructor, taking down routes that never touch Redis.
 */
let cachedClient: RedisClient | null = null;

function getRedisClient(): RedisClient {
  if (!cachedClient) {
    cachedClient = createRedisClient();
  }
  return cachedClient;
}

export function isRedisConfigured(): boolean {
  if (useLocalRedis) return Boolean(process.env.REDIS_URL);
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

const redis: RedisClient = {
  hgetall: (key) => getRedisClient().hgetall(key),
  hset: (key, data) => getRedisClient().hset(key, data),
  expire: (key, seconds) => getRedisClient().expire(key, seconds),
};

export default redis;
