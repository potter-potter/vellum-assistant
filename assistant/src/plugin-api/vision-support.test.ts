import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { ModelProfileInfo } from "./types.js";

// ─── Mock config ────────────────────────────────────────────────────────────

interface MockProfileEntry {
  provider?: string;
  model?: string;
  status?: string;
  mix?: Array<{ profile: string; weight: number }>;
}

let mockProfiles: Record<string, MockProfileEntry> = {};

const realConfigLoader = await import("../config/loader.js");

mock.module("../config/loader.js", () => ({
  ...realConfigLoader,
  getConfig: () => ({
    llm: {
      profiles: mockProfiles,
    },
  }),
  getConfigReadOnly: () => ({
    llm: {
      profiles: mockProfiles,
    },
  }),
}));

// Real model catalog — don't mock it, the test exercises real catalog lookups.
const { doesSupportVision } = await import("./vision-support.js");

// ─── Helpers ────────────────────────────────────────────────────────────────

function profile(key: string): ModelProfileInfo {
  return {
    key,
    label: key,
    description: null,
    isActive: false,
    isDisabled: false,
    isMix: false,
  };
}

function setMockConfig(profiles: Record<string, MockProfileEntry>) {
  mockProfiles = profiles;
}

beforeEach(() => {
  mockProfiles = {};
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("doesSupportVision", () => {
  test("returns true for a known vision-capable model", () => {
    setMockConfig({
      "vision-profile": { provider: "anthropic", model: "claude-opus-4-6" },
    });
    expect(doesSupportVision(profile("vision-profile"))).toBe(true);
  });

  test("returns false for a known text-only model", () => {
    setMockConfig({
      "text-profile": {
        provider: "fireworks",
        model: "accounts/fireworks/models/glm-5p2",
      },
    });
    expect(doesSupportVision(profile("text-profile"))).toBe(false);
  });

  test("returns false for an unknown profile key not in config", () => {
    setMockConfig({});
    expect(doesSupportVision(profile("nonexistent"))).toBe(false);
  });

  test("returns false for an unknown provider/model pair", () => {
    setMockConfig({
      "unknown-model": { provider: "unknown-provider", model: "unknown-model" },
    });
    expect(doesSupportVision(profile("unknown-model"))).toBe(false);
  });

  test("implies the provider from the catalog when profile only sets model", () => {
    setMockConfig({ "model-only": { model: "claude-opus-4-6" } });
    expect(doesSupportVision(profile("model-only"))).toBe(true);
  });

  test("fails safe to false for a profile without a model", () => {
    // A model-less entry is not a usable resolution target, so vision
    // resolution treats it as "can't show images" (caption instead).
    setMockConfig({ "provider-only": { provider: "anthropic" } });
    expect(doesSupportVision(profile("provider-only"))).toBe(false);
  });

  test("mix profile returns true when any arm supports vision", () => {
    setMockConfig({
      "mix-profile": {
        mix: [
          { profile: "text-arm", weight: 0.5 },
          { profile: "vision-arm", weight: 0.5 },
        ],
      },
      "text-arm": {
        provider: "fireworks",
        model: "accounts/fireworks/models/glm-5p2",
      },
      "vision-arm": { provider: "anthropic", model: "claude-opus-4-6" },
    });
    expect(doesSupportVision(profile("mix-profile"))).toBe(true);
  });

  test("mix profile returns false when all arms are text-only", () => {
    setMockConfig({
      "mix-profile": {
        mix: [
          { profile: "text-arm-1", weight: 0.5 },
          { profile: "text-arm-2", weight: 0.5 },
        ],
      },
      "text-arm-1": {
        provider: "fireworks",
        model: "accounts/fireworks/models/glm-5p2",
      },
      "text-arm-2": {
        provider: "fireworks",
        model: "accounts/fireworks/models/glm-5p2",
      },
    });
    expect(doesSupportVision(profile("mix-profile"))).toBe(false);
  });
});

describe("doesSupportVision with a bare string", () => {
  test("returns true for a known vision-capable model id", () => {
    expect(doesSupportVision("claude-opus-4-6")).toBe(true);
  });

  test("returns false for a known text-only model id", () => {
    expect(doesSupportVision("accounts/fireworks/models/glm-5p2")).toBe(false);
  });

  test("falls back to resolving the string as a profile key", () => {
    // "vision-profile" is not a catalog model id, so it resolves as a profile
    // key → anthropic/claude-opus-4-6 (vision-capable).
    setMockConfig({
      "vision-profile": { provider: "anthropic", model: "claude-opus-4-6" },
    });
    expect(doesSupportVision("vision-profile")).toBe(true);
  });

  test("returns false for a string that is neither a model nor a profile", () => {
    setMockConfig({});
    expect(doesSupportVision("some-unknown-string")).toBe(false);
  });
});
