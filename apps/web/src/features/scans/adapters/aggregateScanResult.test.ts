import { describe, expect, it } from "vitest";
import type { Scan } from "@/lib/mock-data";
import { aggregateScanResult } from "./aggregateScanResult";

function makeScan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: "scan_1",
    title: "scan",
    source: "upload",
    kind: "image",
    status: "safe",
    confidence: 0,
    createdAt: new Date().toISOString(),
    detections: [],
    metadata: [],
    timeline: [],
    ...overrides,
  };
}

function hivePayload(aiGenerated: number, notAiGenerated = 100 - aiGenerated) {
  return {
    upstream: {
      output: [
        {
          classes: [
            { class: "ai_generated", value: aiGenerated },
            { class: "not_ai_generated", value: notAiGenerated },
            { class: "none", value: 50 },
            { class: "inconclusive", value: 10 },
          ],
        },
      ],
    },
  };
}

function hivePayloadWithSignals(aiGenerated: number, notAiGenerated = 100 - aiGenerated) {
  return {
    upstream: {
      output: [
        {
          classes: [
            { class: "ai_generated", value: aiGenerated },
            { class: "not_ai_generated", value: notAiGenerated },
            { class: "none", value: 99 },
            { class: "ai_generated_audio", value: 90 },
            { class: "stablediffusion", value: 0.008 },
            { class: "midjourney", value: 12 },
          ],
        },
      ],
    },
  };
}

function rdPayload(score: number) {
  return {
    ensemble: { score },
    models: [
      { id: "rd-img-ensemble", score, status: "DONE" },
      { id: "rd-context-img", score: Math.max(score - 10, 0), status: "DONE" },
      { id: "rd-audio-model", score: 75, status: "DONE" },
      { id: "rd-analyzing", score: 99, status: "ANALYZING" },
      { id: "rd-noise", score: 0.002, status: "DONE" },
    ],
  };
}

function rdPayloadWithModelInsights(score: number) {
  return {
    ensemble: { score },
    modelInsights: [
      { id: "rd-img-ensemble", score, status: "DONE" },
      { id: "rd-context-img", score: Math.max(score - 10, 0), status: "DONE" },
      { id: "rd-analyzing", score: 99, status: "ANALYZING" },
    ],
  };
}

describe("aggregateScanResult", () => {
  it("interprets Reality Defender finalScore=1 as 1%, not 100%", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            reality_defender: {
              ensemble: { finalScore: 1 },
              modelInsights: [{ id: "rd-img-ensemble", finalScore: 1, status: "DONE" }],
            },
          },
        },
      }),
    );

    expect(result.providerFindings).toHaveLength(1);
    expect(result.providerFindings[0].aiScore).toBe(1);
  });

  it("interprets Reality Defender normalizedScore=6 as 6%", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            reality_defender: {
              ensemble: { normalizedScore: 6 },
              modelInsights: [{ id: "rd-img-ensemble", normalizedScore: 6, status: "DONE" }],
            },
          },
        },
      }),
    );

    expect(result.providerFindings).toHaveLength(1);
    expect(result.providerFindings[0].aiScore).toBe(6);
  });

  it("interprets Hive probability 0.998 as about 99%", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: hivePayload(0.998, 0.002),
          },
        },
      }),
    );

    expect(result.providerFindings).toHaveLength(1);
    expect(result.providerFindings[0].aiScore).toBeGreaterThanOrEqual(99);
    expect(result.providerFindings[0].aiScore).toBeLessThanOrEqual(100);
  });

  it("ignores Reality Defender when model signals exist but ensemble score is missing", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            reality_defender: {
              modelInsights: [{ id: "rd-img-ensemble", score: 0.9, status: "DONE" }],
            },
          },
        },
      }),
    );

    expect(result.verdict).toBe("inconclusive");
    expect(result.providerFindings).toHaveLength(0);
  });

  it("includes Reality Defender when ensemble and model signals exist", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            reality_defender: {
              ensemble: { normalizedScore: 65 },
              modelInsights: [{ id: "rd-img-ensemble", score: 0.7, status: "DONE" }],
            },
          },
        },
      }),
    );

    expect(result.providerFindings).toHaveLength(1);
    expect(result.providerFindings[0].providerId).toBe("reality_defender");
    expect(result.providerFindings[0].aiScore).toBe(65);
  });

  it("keeps Hive usable when not_ai_generated exists but ai_generated is missing", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: {
              upstream: {
                output: [{ classes: [{ class: "not_ai_generated", value: 0.93 }] }],
              },
            },
          },
        },
      }),
    );

    expect(result.providerFindings).toHaveLength(1);
    expect(result.providerFindings[0].providerId).toBe("hive");
    expect(result.providerFindings[0].aiScore).toBe(0);
  });

  it("maps rd-full-elm-img to a user-facing label", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            reality_defender: {
              ensemble: { normalizedScore: 0.4 },
              modelInsights: [{ id: "rd-full-elm-img", score: 0.43, status: "DONE" }],
            },
          },
        },
      }),
    );

    expect(result.providerFindings).toHaveLength(1);
    expect(result.providerFindings[0].signals[0]?.label).toBe("Image Authenticity Model A");
  });

  it("maps other_image_generators to a user-facing label", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: {
              upstream: {
                output: [{ classes: [{ class: "other_image_generators", value: 22 }] }],
              },
            },
          },
        },
      }),
    );

    expect(result.providerFindings).toHaveLength(1);
    expect(result.providerFindings[0].signals[0]?.label).toBe("Other Image Generators");
  });

  it("reads Hive primary score even when ai_generated is below 1%", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: hivePayload(0.003, 0.997),
          },
        },
      }),
    );

    expect(result.providerFindings).toHaveLength(1);
    expect(result.providerFindings[0].aiScore).toBe(0);
    expect(result.verdict).toBe("authentic");
  });

  it("filters Hive noise/irrelevant classes while keeping significant generator signals", () => {
    const result = aggregateScanResult(
      makeScan({
        kind: "image",
        resultPayload: {
          processors: {
            hive: hivePayloadWithSignals(0.24, 0.76),
          },
        },
      }),
    );

    const hiveSignals = result.providerFindings[0]?.signals ?? [];
    expect(hiveSignals.some((s) => s.label.toLowerCase().includes("none"))).toBe(false);
    expect(hiveSignals.some((s) => s.label.toLowerCase().includes("audio"))).toBe(false);
    expect(hiveSignals.some((s) => s.label === "Stable Diffusion")).toBe(false);
    expect(hiveSignals.some((s) => s.label === "Midjourney")).toBe(true);
  });

  it("reads Reality Defender modelInsights when present", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            reality_defender: rdPayloadWithModelInsights(0.4),
          },
        },
      }),
    );

    expect(result.providerFindings).toHaveLength(1);
    expect(result.providerFindings[0].signals.length).toBeGreaterThan(0);
    expect(result.providerFindings[0].signals[0].label).toMatch(/Combined Detection|Context Analysis/);
  });

  it("includes severity on returned signals", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: hivePayloadWithSignals(0.8, 0.2),
            reality_defender: rdPayload(0.85),
          },
        },
      }),
    );

    expect(result.topSignals.length).toBeGreaterThan(0);
    for (const signal of result.topSignals) {
      expect(["low", "medium", "high"]).toContain(signal.severity);
    }
  });

  it("returns authentic for low AI scores", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: hivePayload(0.08),
            reality_defender: rdPayload(0.05),
          },
        },
      }),
    );

    expect(result.verdict).toBe("authentic");
    expect(result.aiScore).toBeLessThan(20);
    expect(result.title).toBe("Likely Authentic");
  });

  it("returns suspicious for medium AI scores", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: hivePayload(0.35),
            reality_defender: rdPayload(0.42),
          },
        },
      }),
    );

    expect(result.verdict).toBe("suspicious");
    expect(result.aiScore).toBeGreaterThanOrEqual(20);
    expect(result.aiScore).toBeLessThan(75);
  });

  it("returns manipulated for high AI scores", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: hivePayload(0.91),
            reality_defender: rdPayload(0.86),
          },
        },
      }),
    );

    expect(result.verdict).toBe("manipulated");
    expect(result.aiScore).toBeGreaterThanOrEqual(75);
    expect(result.title).toBe("Likely AI-Generated or Manipulated");
  });

  it("marks agreement mixed when provider verdicts differ", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: hivePayload(0.02),
            reality_defender: rdPayload(0.82),
          },
        },
      }),
    );

    expect(result.agreement).toBe("mixed");
    expect(result.providerFindings).toHaveLength(2);
    expect(result.reasons).toContain("Detection providers returned conflicting results.");
  });

  it("marks agreement weak with single provider", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: hivePayload(0.44),
          },
        },
      }),
    );

    expect(result.agreement).toBe("weak");
    expect(result.providerFindings).toHaveLength(1);
    expect(result.reasons).toContain("Only one detection provider returned usable results.");
  });

  it("uses updated confidence adjustment rules", () => {
    const strong = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: hivePayload(0.8, 0.2),
            reality_defender: rdPayload(0.82),
          },
        },
      }),
    );
    const mixed = aggregateScanResult(
      makeScan({
        resultPayload: {
          processors: {
            hive: hivePayload(0.02, 0.98),
            reality_defender: rdPayload(0.8),
          },
        },
      }),
    );

    expect(strong.agreement).toBe("strong");
    expect(strong.confidence).toBe(88);
    expect(mixed.agreement).toBe("mixed");
    expect(mixed.confidence).toBe(31);
  });

  it("returns inconclusive when processors are missing", () => {
    const result = aggregateScanResult(
      makeScan({
        resultPayload: {},
      }),
    );

    expect(result.verdict).toBe("inconclusive");
    expect(result.providerFindings).toHaveLength(0);
    expect(result.summary).toContain("not enough data");
  });
});
