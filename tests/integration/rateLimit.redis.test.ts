import { afterAll, beforeAll } from "vitest";
import { GenericContainer, Network, Wait, type StartedNetwork, type StartedTestContainer } from "testcontainers";
import { Redis } from "@upstash/redis";
import { createRedisRateLimiter } from "@/lib/redisRateLimit";
import { rateLimiterContract } from "../support/rateLimitContract";

/**
 * D16: the Upstash Redis store against a real Redis. @upstash/redis speaks Upstash's
 * REST API, so a Serverless Redis HTTP (SRH) proxy sits in front of Redis 7, the
 * local setup Upstash documents for CI and offline testing.
 */
const TOKEN = "integration-test-token";
let network: StartedNetwork;
let redisContainer: StartedTestContainer;
let srh: StartedTestContainer;
let redis: Redis;

beforeAll(async () => {
  network = await new Network().start();
  redisContainer = await new GenericContainer("redis:7-alpine")
    .withNetwork(network)
    .withNetworkAliases("redis")
    .withWaitStrategy(Wait.forLogMessage("Ready to accept connections"))
    .start();
  srh = await new GenericContainer("hiett/serverless-redis-http:latest")
    .withNetwork(network)
    .withEnvironment({ SRH_MODE: "env", SRH_TOKEN: TOKEN, SRH_CONNECTION_STRING: "redis://redis:6379" })
    .withExposedPorts(80)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();
  redis = new Redis({ url: `http://${srh.getHost()}:${srh.getMappedPort(80)}`, token: TOKEN });
  // SRH can accept TCP before it has connected to Redis; wait for a real round trip.
  for (let attempt = 0; ; attempt++) {
    try {
      await redis.ping();
      break;
    } catch (error) {
      if (attempt > 30) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
});

afterAll(async () => {
  await srh?.stop();
  await redisContainer?.stop();
  await network?.stop();
});

rateLimiterContract("redis", (options) =>
  createRedisRateLimiter({ redis, prefix: "loancalc-test", ...options, onError: (error) => {
    throw error;
  } }),
);
