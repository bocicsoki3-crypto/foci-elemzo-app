import { GoogleGenerativeAI } from "@google/generative-ai";
import type { MatchAnalysisContext } from "./football";

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn("GEMINI_API_KEY is not defined in environment variables");
}

const genAI = new GoogleGenerativeAI(API_KEY || "");
const MODEL_CANDIDATES = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-latest"];

let cachedModelNames: string[] | null = null;

export type RiskProfile = "konzervativ" | "kiegyensulyozott" | "agressziv";

export interface AnalyzeOptions {
  riskProfile?: RiskProfile;
  bankroll?: number;
}

export interface StructuredAnalysis {
  matchSummary: string[];
  probabilities: { home: number; draw: number; away: number };
  tacticalNotes: string[];
  goalMarkets: {
    overUnder25: { pick: string; reason: string };
    btts: { pick: string; reason: string };
  };
  tipsByRisk: {
    konzervativ: { tip: string; reason: string; stakePercent?: number };
    kiegyensulyozott: { tip: string; reason: string; stakePercent?: number };
    agressziv: { tip: string; reason: string; stakePercent?: number };
  };
  correctScore: { prediction: string; confidence: number; keyRisks: string[] };
  explainability: { factor: string; weight: number; note: string }[];
  dataQuality: {
    confidenceLabel: "alacsony" | "kozepes" | "magas";
    sourceCoverage: string[];
    sampleInfo: string;
    freshness: string;
  };
}

function normalize1X2Probabilities(analysis: string) {
  const homeMatch = analysis.match(/Hazai:\s*(\d+(?:[.,]\d+)?)%/i);
  const drawMatch = analysis.match(/D[oö]ntetlen:\s*(\d+(?:[.,]\d+)?)%/i);
  const awayMatch = analysis.match(/Vend[eé]g:\s*(\d+(?:[.,]\d+)?)%/i);
  if (!homeMatch || !drawMatch || !awayMatch) return analysis;

  const toNumber = (value: string) => Number.parseFloat(value.replace(',', '.'));
  const home = toNumber(homeMatch[1]);
  const draw = toNumber(drawMatch[1]);
  const away = toNumber(awayMatch[1]);
  const total = home + draw + away;
  if (!Number.isFinite(total) || total <= 0 || total === 100) return analysis;

  const scale = 100 / total;
  let homeNorm = Math.round(home * scale);
  let drawNorm = Math.round(draw * scale);
  let awayNorm = Math.round(away * scale);

  const diff = 100 - (homeNorm + drawNorm + awayNorm);
  awayNorm += diff;

  return analysis
    .replace(homeMatch[0], `Hazai: ${homeNorm}%`)
    .replace(drawMatch[0], `Döntetlen: ${drawNorm}%`)
    .replace(awayMatch[0], `Vendeg: ${awayNorm}%`);
}

function toPercentNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const parsed = Number.parseFloat(value.replace('%', '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function getContextProbabilities(context?: MatchAnalysisContext) {
  const ready = context?.probabilities;
  if (ready && Number.isFinite(ready.home) && Number.isFinite(ready.draw) && Number.isFinite(ready.away)) {
    return ready;
  }

  const percent = context?.prediction?.predictions?.percent;
  if (!percent) return null;

  const home = toPercentNumber(percent.home);
  const draw = toPercentNumber(percent.draw);
  const away = toPercentNumber(percent.away);

  if (home === null || draw === null || away === null) return null;
  const total = home + draw + away;
  if (total <= 0) return null;

  const scale = 100 / total;
  let homeNorm = Math.round(home * scale);
  let drawNorm = Math.round(draw * scale);
  let awayNorm = Math.round(away * scale);
  const diff = 100 - (homeNorm + drawNorm + awayNorm);
  awayNorm += diff;

  return { home: homeNorm, draw: drawNorm, away: awayNorm };
}

function applyContextProbabilities(analysis: string, context?: MatchAnalysisContext) {
  const probs = getContextProbabilities(context);
  if (!probs) return analysis;

  let updated = analysis;
  const homeRegex = /Hazai:\s*\d+(?:[.,]\d+)?%/i;
  const drawRegex = /D[oö]ntetlen:\s*\d+(?:[.,]\d+)?%/i;
  const awayRegex = /Vend[eé]g:\s*\d+(?:[.,]\d+)?%/i;

  if (homeRegex.test(updated)) {
    updated = updated.replace(homeRegex, `Hazai: ${probs.home}%`);
  } else {
    updated = updated.replace(/##\s*2\)\s*Eselyek\s*\(1X2\)/i, `## 2) Eselyek (1X2)\n- Hazai: ${probs.home}%`);
  }

  if (drawRegex.test(updated)) {
    updated = updated.replace(drawRegex, `Döntetlen: ${probs.draw}%`);
  } else {
    updated = updated.replace(/Hazai:\s*\d+(?:[.,]\d+)?%/i, (m) => `${m}\n- Döntetlen: ${probs.draw}%`);
  }

  if (awayRegex.test(updated)) {
    updated = updated.replace(awayRegex, `Vendeg: ${probs.away}%`);
  } else {
    updated = updated.replace(/D[oö]ntetlen:\s*\d+(?:[.,]\d+)?%/i, (m) => `${m}\n- Vendeg: ${probs.away}%`);
  }

  return updated;
}

function ensureSourceReminder(analysis: string) {
  if (/Forr[aá]s:/i.test(analysis)) return analysis;
  return `${analysis.trim()}\n\n_Forrás: prediction, h2h, injuries, lineups, recentForm, xG/xGA (ami nem érhető el: nem megerősített)._`;
}

function extractJson(raw: string) {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  return objectMatch?.[0]?.trim() || raw.trim();
}

function buildMarkdownFromStructured(structured: StructuredAnalysis) {
  const lines: string[] = [];
  lines.push("## 1) Gyors osszkep");
  structured.matchSummary.forEach((item) => lines.push(`- ${item}`));
  lines.push(`- Forras: ${structured.dataQuality.sourceCoverage.join(", ") || "nem megerositett"}`);
  lines.push("");
  lines.push("## 2) Eselyek (1X2)");
  lines.push(`- Hazai: ${structured.probabilities.home}%`);
  lines.push(`- Döntetlen: ${structured.probabilities.draw}%`);
  lines.push(`- Vendeg: ${structured.probabilities.away}%`);
  lines.push(`- Forras: ${structured.dataQuality.sourceCoverage.join(", ") || "nem megerositett"}`);
  lines.push("");
  lines.push("## 3) Taktikai kep es kulcspontok");
  structured.tacticalNotes.forEach((item) => lines.push(`- ${item}`));
  lines.push("- Forras: lineups, recentForm, h2h");
  lines.push("");
  lines.push("## 4) Golpiaci varakozas");
  lines.push(`- Over/Under 2.5: ${structured.goalMarkets.overUnder25.pick} - ${structured.goalMarkets.overUnder25.reason}`);
  lines.push(`- BTTS: ${structured.goalMarkets.btts.pick} - ${structured.goalMarkets.btts.reason}`);
  lines.push("- Forras: xG/xGA, recentForm");
  lines.push("");
  lines.push("## 5) Tippjavaslatok (kockazat szerint)");
  lines.push(`- Konzervativ: ${structured.tipsByRisk.konzervativ.tip} (${structured.tipsByRisk.konzervativ.reason})`);
  lines.push(`- Kiegyensulyozott: ${structured.tipsByRisk.kiegyensulyozott.tip} (${structured.tipsByRisk.kiegyensulyozott.reason})`);
  lines.push(`- Agressziv: ${structured.tipsByRisk.agressziv.tip} (${structured.tipsByRisk.agressziv.reason})`);
  lines.push("");
  lines.push("## 6) Pontos tipp es bizalom");
  lines.push(`- Varhato vegeredmeny: ${structured.correctScore.prediction}`);
  lines.push(`- Bizalmi szint (1-10): ${structured.correctScore.confidence}`);
  structured.correctScore.keyRisks.forEach((risk) => lines.push(`- Kockazat: ${risk}`));
  lines.push("");
  lines.push("## 7) Adatbizalom es magyarazat");
  lines.push(`- Bizalom: ${structured.dataQuality.confidenceLabel}`);
  lines.push(`- Mintaszam: ${structured.dataQuality.sampleInfo}`);
  lines.push(`- Frissesseg: ${structured.dataQuality.freshness}`);
  structured.explainability.forEach((driver) => lines.push(`- ${driver.factor} (${driver.weight}%): ${driver.note}`));
  return lines.join("\n");
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(10, Math.round(value)));
}

function coerceStructured(parsed: any, context?: MatchAnalysisContext): StructuredAnalysis {
  const fromContext = getContextProbabilities(context) || { home: 33, draw: 34, away: 33 };
  const base: StructuredAnalysis = {
    matchSummary: Array.isArray(parsed?.matchSummary) ? parsed.matchSummary.slice(0, 6) : [],
    probabilities: {
      home: fromContext.home,
      draw: fromContext.draw,
      away: fromContext.away,
    },
    tacticalNotes: Array.isArray(parsed?.tacticalNotes) ? parsed.tacticalNotes.slice(0, 6) : [],
    goalMarkets: {
      overUnder25: {
        pick: parsed?.goalMarkets?.overUnder25?.pick || "Nincs eleg adat",
        reason: parsed?.goalMarkets?.overUnder25?.reason || "nem megerositett",
      },
      btts: {
        pick: parsed?.goalMarkets?.btts?.pick || "Nincs eleg adat",
        reason: parsed?.goalMarkets?.btts?.reason || "nem megerositett",
      },
    },
    tipsByRisk: {
      konzervativ: {
        tip: parsed?.tipsByRisk?.konzervativ?.tip || "No bet",
        reason: parsed?.tipsByRisk?.konzervativ?.reason || "nem megerositett",
        stakePercent: parsed?.tipsByRisk?.konzervativ?.stakePercent,
      },
      kiegyensulyozott: {
        tip: parsed?.tipsByRisk?.kiegyensulyozott?.tip || "No bet",
        reason: parsed?.tipsByRisk?.kiegyensulyozott?.reason || "nem megerositett",
        stakePercent: parsed?.tipsByRisk?.kiegyensulyozott?.stakePercent,
      },
      agressziv: {
        tip: parsed?.tipsByRisk?.agressziv?.tip || "No bet",
        reason: parsed?.tipsByRisk?.agressziv?.reason || "nem megerositett",
        stakePercent: parsed?.tipsByRisk?.agressziv?.stakePercent,
      },
    },
    correctScore: {
      prediction: parsed?.correctScore?.prediction || "N/A",
      confidence: clampConfidence(Number(parsed?.correctScore?.confidence)),
      keyRisks: Array.isArray(parsed?.correctScore?.keyRisks) ? parsed.correctScore.keyRisks.slice(0, 4) : [],
    },
    explainability: Array.isArray(parsed?.explainability) ? parsed.explainability.slice(0, 5) : [],
    dataQuality: {
      confidenceLabel: parsed?.dataQuality?.confidenceLabel === "magas" || parsed?.dataQuality?.confidenceLabel === "alacsony"
        ? parsed.dataQuality.confidenceLabel
        : "kozepes",
      sourceCoverage: Array.isArray(parsed?.dataQuality?.sourceCoverage) ? parsed.dataQuality.sourceCoverage : [],
      sampleInfo: parsed?.dataQuality?.sampleInfo || "nem megerositett",
      freshness: parsed?.dataQuality?.freshness || "nem megerositett",
    },
  };

  base.probabilities = normalize1X2Probabilities(
    `Hazai: ${base.probabilities.home}%\nDöntetlen: ${base.probabilities.draw}%\nVendeg: ${base.probabilities.away}%`
  )
    .split("\n")
    .reduce(
      (acc, line) => {
        const hm = line.match(/Hazai:\s*(\d+)%/i);
        const dm = line.match(/D[oö]ntetlen:\s*(\d+)%/i);
        const am = line.match(/Vend[eé]g:\s*(\d+)%/i);
        if (hm) acc.home = Number(hm[1]);
        if (dm) acc.draw = Number(dm[1]);
        if (am) acc.away = Number(am[1]);
        return acc;
      },
      { home: fromContext.home, draw: fromContext.draw, away: fromContext.away }
    );

  return base;
}

async function getAvailableModelNames() {
  if (!API_KEY) return MODEL_CANDIDATES;
  if (cachedModelNames) return cachedModelNames;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`,
      { method: "GET" }
    );

    if (!response.ok) {
      throw new Error(`Model list HTTP ${response.status}`);
    }

    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];

    const discovered = models
      .filter((model: any) => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes("generateContent"))
      .map((model: any) => String(model?.name || "").replace(/^models\//, ""))
      .filter(Boolean);

    // Keep preferred order first, then append any additional discovered models.
    const ordered = [
      ...MODEL_CANDIDATES.filter((name) => discovered.includes(name)),
      ...discovered.filter((name: string) => !MODEL_CANDIDATES.includes(name)),
    ];

    cachedModelNames = ordered.length > 0 ? ordered : MODEL_CANDIDATES;
    return cachedModelNames;
  } catch (error) {
    console.error("Failed to list Gemini models, using static fallback list:", error);
    return MODEL_CANDIDATES;
  }
}

export async function analyzeMatch(matchDetails: any, context?: MatchAnalysisContext, options?: AnalyzeOptions) {
  const competitionName = matchDetails?.competition?.name || "Ismeretlen bajnokság";
  const homeTeamName = matchDetails?.homeTeam?.name || "Ismeretlen hazai csapat";
  const awayTeamName = matchDetails?.awayTeam?.name || "Ismeretlen vendég csapat";
  const kickoff = matchDetails?.utcDate || "Ismeretlen időpont";
  const matchday = matchDetails?.matchday || "Ismeretlen forduló";
  const riskProfile = options?.riskProfile || "kiegyensulyozott";
  const bankroll = Number.isFinite(options?.bankroll) ? Number(options?.bankroll) : 100;

  const prompt = `
Te egy profi futballelemzo es kockazatkezelo fogadasi szakerto vagy.
Feladatod: adj hasznalhato, rovid, de szakmai meccselemzest magyar nyelven, valos adatokra tamaszkodva.
Profil: ${riskProfile}
Bankroll: ${bankroll}

MERKOZES ADATOK
- Bajnoksag: ${competitionName}
- Fordulo: ${matchday}
- Hazai: ${homeTeamName}
- Vendeg: ${awayTeamName}
- Kezdes (UTC): ${kickoff}
- Elemzesi adatcsomag (JSON): ${JSON.stringify(context || {}, null, 2)}

MUKODESI SZABALYOK
1) Ha egy adat nem biztos (pl. serulesek, varhato kezdok), jelezd egyertelmuen: "nem megerositett".
2) Ne allits tenykent olyat, amit nem tudsz ellenorizni.
3) Keruld a tulhypeolt, clickbait mondatokat.
4) Prioritas: prediction, h2h, serulesek, lineup, forma, xG/xGA adatok.
5) Adj gyakorlati, indokolt tippeket (nem csak vegeredmenyt).
6) Ha xG/xGA nincs, ezt kulon jelold.
7) Legyen tomor: max 2200 karakter.
8) Az 1X2 szazalekok OSSZEGE legyen pontosan 100%.
9) Minden szekcio vegen legyen egy rovid "Forras:" sor.
10) Ha van prediction.percent adat, az 1X2 szazalekok azt kovessek.
11) Hasznald kotelezoen a teamIntel mezot: PPG, GF/GA per meccs, clean sheet rate, failed-to-score rate, likely formation, missingPlayers.
12) A missingPlayers alapjan konkretan jelezd a hianyzo kulcsembereket, ha vannak nevek.

VALASZ FORMATUM:
KIZAROLAG ervenyes JSON objektumot adj vissza, semmi egyeb szoveget.
Schema:
{
  "matchSummary": ["..."],
  "probabilities": { "home": 0, "draw": 0, "away": 0 },
  "tacticalNotes": ["..."],
  "goalMarkets": {
    "overUnder25": { "pick": "...", "reason": "..." },
    "btts": { "pick": "...", "reason": "..." }
  },
  "tipsByRisk": {
    "konzervativ": { "tip": "...", "reason": "...", "stakePercent": 0 },
    "kiegyensulyozott": { "tip": "...", "reason": "...", "stakePercent": 0 },
    "agressziv": { "tip": "...", "reason": "...", "stakePercent": 0 }
  },
  "correctScore": { "prediction": "...", "confidence": 0, "keyRisks": ["..."] },
  "explainability": [{ "factor": "...", "weight": 0, "note": "..." }],
  "dataQuality": {
    "confidenceLabel": "alacsony|kozepes|magas",
    "sourceCoverage": ["prediction","h2h","injuries","lineups","recentForm","xG/xGA"],
    "sampleInfo": "...",
    "freshness": "..."
  }
}
  `;

  if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
    const fallbackStructured = coerceStructured({}, context);
    const fallbackText = buildMarkdownFromStructured(fallbackStructured);
    return { analysis: fallbackText, structuredAnalysis: fallbackStructured };
  }

  const candidateModels = await getAvailableModelNames();

  let lastError: unknown = null;
  for (const modelName of candidateModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      if (text?.trim()) {
        const jsonText = extractJson(text);
        const parsed = JSON.parse(jsonText);
        const structured = coerceStructured(parsed, context);
        const forcedFromContext = applyContextProbabilities(
          `Hazai: ${structured.probabilities.home}%\nDöntetlen: ${structured.probabilities.draw}%\nVendeg: ${structured.probabilities.away}%`,
          context
        );
        const normalized = normalize1X2Probabilities(forcedFromContext);
        const hm = normalized.match(/Hazai:\s*(\d+)%/i);
        const dm = normalized.match(/D[oö]ntetlen:\s*(\d+)%/i);
        const am = normalized.match(/Vend[eé]g:\s*(\d+)%/i);
        if (hm) structured.probabilities.home = Number(hm[1]);
        if (dm) structured.probabilities.draw = Number(dm[1]);
        if (am) structured.probabilities.away = Number(am[1]);
        const markdown = ensureSourceReminder(buildMarkdownFromStructured(structured));
        return { analysis: markdown, structuredAnalysis: structured };
      }
    } catch (error) {
      lastError = error;
      console.error(`Error with Gemini model ${modelName}:`, error);
    }
  }

  const rawMessage = lastError instanceof Error ? lastError.message : "Ismeretlen Gemini hiba";
  throw new Error(`A Gemini szolgáltatás most nem elérhető (${rawMessage}).`);
}
