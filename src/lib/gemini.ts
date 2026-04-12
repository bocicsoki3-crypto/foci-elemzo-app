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
    overUnder35: { pick: string; reason: string };
    btts: { pick: string; reason: string };
    firstHalf: { pick: string; reason: string };
    corners: { line: string; pick: string };
    cards: { line: string; pick: string };
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
  committee: {
    statistician: { findings: string[]; confidence: number };
    tacticalCoach: { findings: string[]; confidence: number };
    newsroomScout: { findings: string[]; confidence: number };
    devilsAdvocate: { findings: string[]; confidence: number };
    oddsQuant: { findings: string[]; confidence: number; valueAngles?: string[] };
    chairman: { finalVerdict: string; rationale: string[]; confidence: number };
  };
  keyMetrics: {
    xg: { home: number | null; away: number | null; xgaHome: number | null; xgaAway: number | null };
    ppg: { home: number | null; away: number | null };
    goalsPerMatch: { homeFor: number | null; awayFor: number | null; homeAgainst: number | null; awayAgainst: number | null };
    cornersCards: { homeCorners: number | null; awayCorners: number | null; homeYellow: number | null; awayYellow: number | null };
    availability: { homeMissing: number; awayMissing: number };
    formations: { home: string | null; away: string | null };
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
  lines.push("");
  lines.push("## 8) AI Bizottsag (6 tag)");
  lines.push(`- Adatgyujto (bizalom ${structured.committee.statistician.confidence}/10): ${structured.committee.statistician.findings.join(" | ") || "nincs megbizhato adat"}`);
  lines.push(`- Taktikai elemzo (bizalom ${structured.committee.tacticalCoach.confidence}/10): ${structured.committee.tacticalCoach.findings.join(" | ") || "nincs megbizhato adat"}`);
  lines.push(`- Hirszerzo (bizalom ${structured.committee.newsroomScout.confidence}/10): ${structured.committee.newsroomScout.findings.join(" | ") || "nincs megbizhato adat"}`);
  lines.push(`- Ordog ugyvedje (bizalom ${structured.committee.devilsAdvocate.confidence}/10): ${structured.committee.devilsAdvocate.findings.join(" | ") || "nincs megbizhato adat"}`);
  lines.push(`- Matekos (bizalom ${structured.committee.oddsQuant.confidence}/10): ${structured.committee.oddsQuant.findings.join(" | ") || "nincs megbizhato adat"}`);
  if ((structured.committee.oddsQuant.valueAngles || []).length > 0) {
    lines.push(`- Value szogek: ${structured.committee.oddsQuant.valueAngles?.join(" | ")}`);
  }
  lines.push(`- Elnok (bizalom ${structured.committee.chairman.confidence}/10): ${structured.committee.chairman.finalVerdict}`);
  structured.committee.chairman.rationale.forEach((item) => lines.push(`- Elnok indok: ${item}`));
  return lines.join("\n");
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(10, Math.round(value)));
}

function coerceStructured(parsed: any, context?: MatchAnalysisContext): StructuredAnalysis {
  const fromContext = getContextProbabilities(context) || { home: 33, draw: 34, away: 33 };
  const computedCoverage = [
    context?.dataAvailability?.prediction ? 'prediction' : null,
    context?.dataAvailability?.h2h ? 'h2h' : null,
    context?.dataAvailability?.injuries ? 'injuries' : null,
    context?.dataAvailability?.lineups ? 'lineups' : null,
    context?.dataAvailability?.xg ? 'xG/xGA' : null,
    context?.dataAvailability?.teamStats ? 'teamStats' : null,
    context?.dataAvailability?.news ? 'news' : null,
    'recentForm',
  ].filter(Boolean) as string[];
  const firstHalfSignal = context?.marketSignals?.firstHalf1x2;
  const corners75Signal = context?.marketSignals?.corners75;
  const cards35Signal = context?.marketSignals?.cards35;
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
      overUnder35: {
        pick: parsed?.goalMarkets?.overUnder35?.pick || "Nincs eleg adat",
        reason: parsed?.goalMarkets?.overUnder35?.reason || "nem megerositett",
      },
      btts: {
        pick: parsed?.goalMarkets?.btts?.pick || "Nincs eleg adat",
        reason: parsed?.goalMarkets?.btts?.reason || "nem megerositett",
      },
      firstHalf: {
        pick: firstHalfSignal?.pick
          ? `Félidő ${firstHalfSignal.pick} (${firstHalfSignal.homePct ?? '-'} / ${firstHalfSignal.drawPct ?? '-'} / ${firstHalfSignal.awayPct ?? '-'}%)`
          : (parsed?.goalMarkets?.firstHalf?.pick || "Nincs eleg adat"),
        reason: firstHalfSignal?.pick
          ? "Poisson félidő-modell (hazai/döntetlen/vendég)."
          : (parsed?.goalMarkets?.firstHalf?.reason || "nem megerositett"),
      },
      corners: {
        line: String(corners75Signal?.line ?? parsed?.goalMarkets?.corners?.line ?? '7.5'),
        pick: corners75Signal?.pick || parsed?.goalMarkets?.corners?.pick || 'Nincs eleg adat',
      },
      cards: {
        line: String(cards35Signal?.line ?? parsed?.goalMarkets?.cards?.line ?? '3.5'),
        pick: cards35Signal?.pick || parsed?.goalMarkets?.cards?.pick || 'Nincs eleg adat',
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
      sourceCoverage:
        Array.isArray(parsed?.dataQuality?.sourceCoverage) && parsed.dataQuality.sourceCoverage.length > 0
          ? parsed.dataQuality.sourceCoverage
          : computedCoverage,
      sampleInfo: parsed?.dataQuality?.sampleInfo || "nem megerositett",
      freshness: parsed?.dataQuality?.freshness || "nem megerositett",
    },
    committee: {
      statistician: {
        findings: Array.isArray(parsed?.committee?.statistician?.findings)
          ? parsed.committee.statistician.findings.slice(0, 4)
          : [],
        confidence: clampConfidence(Number(parsed?.committee?.statistician?.confidence)),
      },
      tacticalCoach: {
        findings: Array.isArray(parsed?.committee?.tacticalCoach?.findings)
          ? parsed.committee.tacticalCoach.findings.slice(0, 4)
          : [],
        confidence: clampConfidence(Number(parsed?.committee?.tacticalCoach?.confidence)),
      },
      newsroomScout: {
        findings: Array.isArray(parsed?.committee?.newsroomScout?.findings)
          ? parsed.committee.newsroomScout.findings.slice(0, 4)
          : [],
        confidence: clampConfidence(Number(parsed?.committee?.newsroomScout?.confidence)),
      },
      devilsAdvocate: {
        findings: Array.isArray(parsed?.committee?.devilsAdvocate?.findings)
          ? parsed.committee.devilsAdvocate.findings.slice(0, 4)
          : [],
        confidence: clampConfidence(Number(parsed?.committee?.devilsAdvocate?.confidence)),
      },
      oddsQuant: {
        findings: Array.isArray(parsed?.committee?.oddsQuant?.findings)
          ? parsed.committee.oddsQuant.findings.slice(0, 4)
          : [],
        confidence: clampConfidence(Number(parsed?.committee?.oddsQuant?.confidence)),
        valueAngles: Array.isArray(parsed?.committee?.oddsQuant?.valueAngles)
          ? parsed.committee.oddsQuant.valueAngles.slice(0, 3)
          : [],
      },
      chairman: {
        finalVerdict: parsed?.committee?.chairman?.finalVerdict || "Nincs eleg adat",
        rationale: Array.isArray(parsed?.committee?.chairman?.rationale)
          ? parsed.committee.chairman.rationale.slice(0, 4)
          : [],
        confidence: clampConfidence(Number(parsed?.committee?.chairman?.confidence)),
      },
    },
    keyMetrics: {
      xg: {
        home: context?.xgSummary?.home?.avgXG ?? null,
        away: context?.xgSummary?.away?.avgXG ?? null,
        xgaHome: context?.xgSummary?.home?.avgXGA ?? null,
        xgaAway: context?.xgSummary?.away?.avgXGA ?? null,
      },
      ppg: {
        home: context?.teamIntel?.home?.ppg ?? null,
        away: context?.teamIntel?.away?.ppg ?? null,
      },
      goalsPerMatch: {
        homeFor: context?.teamIntel?.home?.goalsForPerMatch ?? null,
        awayFor: context?.teamIntel?.away?.goalsForPerMatch ?? null,
        homeAgainst: context?.teamIntel?.home?.goalsAgainstPerMatch ?? null,
        awayAgainst: context?.teamIntel?.away?.goalsAgainstPerMatch ?? null,
      },
      cornersCards: {
        homeCorners: context?.teamIntel?.home?.avgCorners ?? null,
        awayCorners: context?.teamIntel?.away?.avgCorners ?? null,
        homeYellow: context?.teamIntel?.home?.avgYellowCards ?? null,
        awayYellow: context?.teamIntel?.away?.avgYellowCards ?? null,
      },
      availability: {
        homeMissing: context?.teamIntel?.home?.missingPlayers?.length || 0,
        awayMissing: context?.teamIntel?.away?.missingPlayers?.length || 0,
      },
      formations: {
        home: context?.teamIntel?.home?.likelyFormation || null,
        away: context?.teamIntel?.away?.likelyFormation || null,
      },
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
Te egy vilagszinvonalu futballelemzo, matematikai modellezo es hivatasos sportfogado szakerto vagy. 
A feladatod, hogy a rendelkezesre allo adatokbol (statisztika, formamutatok, piaci szignalak, hirek) keszits egy melysegi, szakmai elemzest es adj konkret, ertekalapu (Value Bet) tippeket.

STILUS ES SZAKMAISAG:
- Hasznalj fogadasi szaknyelvet (pl. "alacsony blokk", "atmenetek", "regresszio", "szelso tulterheles", "szukitett ter").
- Keruld az altalanossagokat (pl. "mindket csapat jo"). Helyette: "A hazai csapat xG-termelese az utolso 3 meccsen 2.1 felett van, mig a vendeg vedelem sebezheto a pontrugasoknal".
- Legyel szigoruan objektiv. Ha az adatok ellentmondasosak, jelezd a bizonytalansagot.

PROFIL ES BANKROLL:
- Profil: ${riskProfile}
- Aktualis bankroll: ${bankroll} egység

MERKOZES KONTEXTUS:
- Bajnoksag: ${competitionName} (${matchday}. fordulo)
- Parositas: ${homeTeamName} vs ${awayTeamName}
- Kezdes: ${kickoff}
- ADATCSOMAG: ${JSON.stringify(context || {}, null, 2)}

ELEMZESI PRIORITÁSOK:
1. xG/xGA (Várható gólok): Ez a legfontosabb mutató a valós teljesítmény mérésére.
2. Formamutatók és PPG: Az utolsó 5 meccs tendenciái.
3. Hiányzók (missingPlayers): Kulcsjátékosok kiesésének hatása a taktikai felállásra.
4. Piaci szignálok (marketSignals): Mit mutat a Poisson-modell és a piaci várakozás.
5. H2H: Történelmi dominancia vagy "mumus" faktor.

SPECIFIKUS SZABÁLYOK:
- A goalMarkets.corners (7.5 line) és cards (3.5 line) tippeknél MINDIG indokold a csapatok stílusa alapján (pl. "szélsőjáték intenzitása", "agresszív letámadás").
- A tipsByRisk szekcióban a stakePercent (tétméret) a bankroll %-ában értendő, a Kelly-kritériumot alapul véve (max 5%).
- A committee (AI Bizottság) tagjai ne csak ismételjék egymást, hanem ütköztessék a nézőpontokat.
- Ha a Monte Carlo szimuláció (monteCarlo) jelentősen eltér a piaci esélyektől (probabilities), keresd az értéket (Value).

VALASZ FORMATUM:
KIZAROLAG ervenyes JSON objektumot adj vissza.
Schema:
{
  "matchSummary": ["3-5 szakmai megallapitas a meccsrol"],
  "probabilities": { "home": 0, "draw": 0, "away": 0 },
  "tacticalNotes": ["Konkret taktikai elemzes, felallasok hatasa"],
  "goalMarkets": {
    "overUnder25": { "pick": "Over 2.5 / Under 2.5", "reason": "Indoklas xG es forma alapjan" },
    "overUnder35": { "pick": "Over 3.5 / Under 3.5", "reason": "Indoklas" },
    "btts": { "pick": "Igen / Nem", "reason": "Indoklas" },
    "firstHalf": { "pick": "Hazai / X / Vendeg", "reason": "Felidei Poisson-modell alapjan" },
    "corners": { "line": "7.5", "pick": "Over 7.5 / Under 7.5", "reason": "Statisztikai indoklas" },
    "cards": { "line": "3.5", "pick": "Over 3.5 / Under 3.5", "reason": "Biroi es csapatszintu agresszio" }
  },
  "tipsByRisk": {
    "konzervativ": { "tip": "...", "reason": "...", "stakePercent": 0 },
    "kiegyensulyozott": { "tip": "...", "reason": "...", "stakePercent": 0 },
    "agressziv": { "tip": "...", "reason": "...", "stakePercent": 0 }
  },
  "correctScore": { "prediction": "Pontos eredmeny", "confidence": 1-10, "keyRisks": ["Fobb kockazati tenyezok"] },
  "explainability": [{ "factor": "Tenyezo neve", "weight": 0-100, "note": "Magyarazat" }],
  "dataQuality": { "confidenceLabel": "alacsony|kozepes|magas", "sourceCoverage": ["..."], "sampleInfo": "...", "freshness": "..." },
  "committee": {
    "statistician": { "findings": ["Csak szamok: xG, PPG, shots on target"], "confidence": 0 },
    "tacticalCoach": { "findings": ["Matchup elemzes, gyenge pontok"], "confidence": 0 },
    "newsroomScout": { "findings": ["Serultek hatasa a jatekra"], "confidence": 0 },
    "devilsAdvocate": { "findings": ["Miért bukhat el a favorit tipp?"], "confidence": 0 },
    "oddsQuant": { "findings": ["Value kereses, szimulacio vs odds"], "confidence": 0, "valueAngles": ["Hol van az ertek?"] },
    "chairman": { "finalVerdict": "Vegso konkluzio", "rationale": ["Osszegzo indoklas"], "confidence": 0 }
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
