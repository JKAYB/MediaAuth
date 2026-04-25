import type { Scan } from "@/lib/mock-data";

export type AggregatedVerdict = "authentic" | "suspicious" | "manipulated" | "inconclusive";
export type AggregatedAgreement = "strong" | "mixed" | "weak";

export type AggregatedSignal = {
  label: string;
  score: number;
  providerId: string;
  severity: "low" | "medium" | "high";
};

export type ProviderFinding = {
  providerId: string;
  providerName: string;
  aiScore: number;
  authenticScore: number;
  verdict: Exclude<AggregatedVerdict, "inconclusive">;
  reasons: string[];
  signals: AggregatedSignal[];
};

export type AggregatedScanResult = {
  verdict: AggregatedVerdict;
  aiScore: number;
  authenticScore: number;
  confidence: number;
  agreement: AggregatedAgreement;
  title: string;
  summary: string;
  reasons: string[];
  providerFindings: ProviderFinding[];
  topSignals: AggregatedSignal[];
};

type ProviderNormalization = {
  providerId: string;
  providerName: string;
  aiScore: number;
  reasons: string[];
  signals: AggregatedSignal[];
};

const PROVIDER_LABELS: Record<string, string> = {
  rd_img_ensemble: "Combined Detection",
  rd_context_img: "Context Analysis",
  rd_full_elm_img: "Image Authenticity Model A",
  rd_full_cedar_img: "Image Authenticity Model B",
  rd_full_oak_img: "Image Authenticity Model C",
  rd_full_pine_img: "Image Authenticity Model D",
  other_image_generators: "Other Image Generators",
  stablediffusion: "Stable Diffusion",
  midjourney: "Midjourney",
  dalle: "DALL·E",
  adobefirefly: "Adobe Firefly",
};

const HIVE_IGNORED_CLASSES = new Set([
  "none",
  "inconclusive",
  "inconclusive_video",
  "not_ai_generated_audio",
  "ai_generated_audio",
]);

const NOISE_THRESHOLD_PERCENT = 1;

function clamp(num: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function probabilityToPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(value * 100, 0, 100);
}

function scoreToPercent(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clamp(value, 0, 100);
}

function normalizeLabel(raw: string): string {
  const cleaned = String(raw || "").trim().toLowerCase().replace(/[-\s]+/g, "_");
  return cleaned;
}

function titleCaseLabel(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function userFacingLabel(raw: string): string {
  const key = normalizeLabel(raw);
  return PROVIDER_LABELS[key] || titleCaseLabel(raw);
}

function isSignalRelevantToKind(label: string, kind: Scan["kind"]): boolean {
  const normalized = normalizeLabel(label);
  if ((kind === "image" || kind === "video" || kind === "url") && normalized.includes("audio")) {
    return false;
  }
  if (kind === "audio" && (normalized.includes("image") || normalized.includes("video"))) {
    return false;
  }
  return true;
}

function providerVerdict(aiScore: number): Exclude<AggregatedVerdict, "inconclusive"> {
  if (aiScore >= 75) return "manipulated";
  if (aiScore >= 20) return "suspicious";
  return "authentic";
}

function getSeverity(score: number): "low" | "medium" | "high" {
  if (score >= 75) return "high";
  if (score >= 20) return "medium";
  return "low";
}

function normalizeHive(scan: Scan, hivePayload: unknown): ProviderNormalization | null {
  const root = asRecord(hivePayload);
  if (!root) return null;
  const upstream = asRecord(root.upstream);
  const output = Array.isArray(upstream?.output) ? upstream?.output : [];
  const classes = output.flatMap((entry) => {
    const row = asRecord(entry);
    return Array.isArray(row?.classes) ? row.classes : [];
  });

  let aiScore = 0;
  let hasPrimaryScore = false;
  const signals: AggregatedSignal[] = [];

  for (const klass of classes) {
    const row = asRecord(klass);
    const className = String(row?.class || "").trim();
    if (!className) continue;
    const normalizedClass = normalizeLabel(className);
    if (normalizedClass === "ai_generated") {
      const percent = probabilityToPercent(row?.value);
      if (percent != null) {
        aiScore = percent;
        hasPrimaryScore = true;
      }
      continue;
    }
    if (normalizedClass === "not_ai_generated") {
      const percent = probabilityToPercent(row?.value);
      if (percent != null) {
        hasPrimaryScore = true;
      }
      continue;
    }
    if (HIVE_IGNORED_CLASSES.has(normalizedClass)) continue;
    if (!isSignalRelevantToKind(normalizedClass, scan.kind)) continue;

    const percent = probabilityToPercent(row?.value);
    if (percent == null || percent < NOISE_THRESHOLD_PERCENT) continue;

    signals.push({
      label: userFacingLabel(className),
      score: percent,
      providerId: "hive",
      severity: getSeverity(percent),
    });
  }

  if (!hasPrimaryScore && signals.length === 0) return null;

  const reasons: string[] = [];
  if (aiScore < 5) {
    reasons.push("Hive found almost no evidence of AI generation.");
  } else if (aiScore < 20) {
    reasons.push("Hive detected minor AI-related patterns, but not enough to be suspicious.");
  } else {
    reasons.push("Hive detected noticeable AI-generation signals.");
  }

  return {
    providerId: "hive",
    providerName: "Hive",
    aiScore,
    reasons,
    signals: signals.sort((a, b) => b.score - a.score),
  };
}

function readEnsembleScore(rdPayload: Record<string, unknown>): number | null {
  const ensemble = asRecord(rdPayload.ensemble);
  return (
    scoreToPercent(ensemble?.normalizedScore) ??
    scoreToPercent(ensemble?.finalScore) ??
    probabilityToPercent(ensemble?.score) ??
    scoreToPercent(rdPayload.normalizedScore) ??
    scoreToPercent(rdPayload.finalScore) ??
    probabilityToPercent(rdPayload.score) ??
    null
  );
}

function normalizeRdModelScore(value: Record<string, unknown>): number | null {
  return (
    scoreToPercent(value.normalizedScore) ??
    scoreToPercent(value.finalScore) ??
    probabilityToPercent(value.score) ??
    null
  );
}

function normalizeRealityDefender(scan: Scan, rdPayload: unknown): ProviderNormalization | null {
  const root = asRecord(rdPayload);
  if (!root) return null;

  const ensembleScore = readEnsembleScore(root);
  const signals: AggregatedSignal[] = [];
  const modelCandidates = Array.isArray(root.modelInsights)
    ? root.modelInsights
    : Array.isArray(root.models)
      ? root.models
      : Array.isArray(root.modelOutputs)
        ? root.modelOutputs
        : [];

  if (ensembleScore == null) return null;

  for (const candidate of modelCandidates) {
    const model = asRecord(candidate);
    if (!model) continue;
    const status = String(model.status || "").toUpperCase();
    if (status === "ANALYZING") continue;

    const score = normalizeRdModelScore(model);
    if (score == null || score < NOISE_THRESHOLD_PERCENT) continue;

    const rawName = String(model.name || model.model || model.id || "").trim();
    if (!rawName) continue;
    if (!isSignalRelevantToKind(rawName, scan.kind)) continue;

    signals.push({
      label: userFacingLabel(rawName),
      score,
      providerId: "reality_defender",
      severity: getSeverity(score),
    });
  }

  const aiScore = ensembleScore;
  const reasons =
    aiScore < 5
      ? ["Reality Defender found almost no evidence of manipulation."]
      : aiScore < 20
        ? ["Reality Defender detected minor manipulation signals, but they remain low."]
        : ["Reality Defender detected noticeable manipulation signals."];

  return {
    providerId: "reality_defender",
    providerName: "Reality Defender",
    aiScore,
    reasons,
    signals: signals.sort((a, b) => b.score - a.score),
  };
}

function dedupeReasons(reasons: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const reason of reasons) {
    const key = reason.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(reason.trim());
  }
  return out;
}

function mapTitle(verdict: AggregatedVerdict): string {
  if (verdict === "authentic") return "Likely Authentic";
  if (verdict === "suspicious") return "Suspicious";
  if (verdict === "manipulated") return "Likely AI-Generated or Manipulated";
  return "Unable to Verify";
}

function mapSummary(verdict: AggregatedVerdict): string {
  if (verdict === "authentic") {
    return "This media appears authentic. Detection systems found only low-level AI signals.";
  }
  if (verdict === "suspicious") {
    return "This media contains some AI-related signals but not enough to confirm manipulation.";
  }
  if (verdict === "manipulated") {
    return "This media shows strong signs of AI generation or manipulation.";
  }
  return "There is not enough data to determine the authenticity of this media.";
}

export function aggregateScanResult(scan: Scan): AggregatedScanResult {
  const payload = asRecord(scan.resultPayload);
  const processors = asRecord(payload?.processors);

  const providerInputs: ProviderNormalization[] = [];
  if (processors) {
    const hive = normalizeHive(scan, processors.hive);
    if (hive) providerInputs.push(hive);

    const rd = normalizeRealityDefender(
      scan,
      processors.reality_defender ?? processors.real ?? processors.rd ?? null,
    );
    if (rd) providerInputs.push(rd);
  }

  if (providerInputs.length === 0) {
    return {
      verdict: "inconclusive",
      aiScore: 0,
      authenticScore: 0,
      confidence: 0,
      agreement: "weak",
      title: mapTitle("inconclusive"),
      summary: mapSummary("inconclusive"),
      reasons: ["No provider outputs were available for aggregation."],
      providerFindings: [],
      topSignals: [],
    };
  }

  // Future: replace equal weighting with provider-specific weights if confidence calibration differs by vendor.
  const totalWeight = providerInputs.length;
  const aiScore = clamp(
    providerInputs.reduce((acc, provider) => acc + provider.aiScore, 0) / totalWeight,
    0,
    100,
  );
  const authenticScore = clamp(100 - aiScore, 0, 100);
  const verdict = providerVerdict(aiScore);
  const verdicts = providerInputs.map((provider) => providerVerdict(provider.aiScore));
  let agreement: AggregatedAgreement;
  if (providerInputs.length === 1) {
    agreement = "weak";
  } else if (verdicts.every((v) => v === verdicts[0])) {
    agreement = "strong";
  } else {
    agreement = "mixed";
  }

  let confidence = verdict === "authentic" ? authenticScore : aiScore;
  if (agreement === "strong") confidence += 5;
  if (agreement === "mixed") confidence -= 10;
  if (providerInputs.length > 1 && agreement !== "mixed") confidence += 2;
  confidence = clamp(Math.round(confidence), 0, 99);

  const providerFindings: ProviderFinding[] = providerInputs.map((provider) => {
    const providerAiScore = clamp(provider.aiScore, 0, 100);
    return {
      providerId: provider.providerId,
      providerName: provider.providerName,
      aiScore: Math.round(providerAiScore),
      authenticScore: Math.round(100 - providerAiScore),
      verdict: providerVerdict(providerAiScore),
      reasons: provider.reasons,
      signals: provider.signals,
    };
  });

  const reasons = dedupeReasons([
    ...providerInputs.flatMap((provider) => provider.reasons),
    agreement === "strong"
      ? "Detection providers agree on the result."
      : agreement === "mixed"
        ? "Detection providers returned conflicting results."
        : "Only one detection provider returned usable results.",
  ]);
  const topSignals = providerInputs
    .flatMap((provider) => provider.signals)
    .filter((signal) => signal.score >= NOISE_THRESHOLD_PERCENT)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    verdict,
    aiScore: Math.round(aiScore),
    authenticScore: Math.round(authenticScore),
    confidence,
    agreement,
    title: mapTitle(verdict),
    summary: mapSummary(verdict),
    reasons,
    providerFindings,
    topSignals,
  };
}
