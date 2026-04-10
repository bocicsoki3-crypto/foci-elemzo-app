import { GoogleGenerativeAI } from "@google/generative-ai";
import type { MatchAnalysisContext } from "./football";

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn("GEMINI_API_KEY is not defined in environment variables");
}

const genAI = new GoogleGenerativeAI(API_KEY || "");
const MODEL_CANDIDATES = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-latest"];

let cachedModelNames: string[] | null = null;

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

export async function analyzeMatch(matchDetails: any, context?: MatchAnalysisContext) {
  const competitionName = matchDetails?.competition?.name || "Ismeretlen bajnokság";
  const homeTeamName = matchDetails?.homeTeam?.name || "Ismeretlen hazai csapat";
  const awayTeamName = matchDetails?.awayTeam?.name || "Ismeretlen vendég csapat";
  const kickoff = matchDetails?.utcDate || "Ismeretlen időpont";
  const matchday = matchDetails?.matchday || "Ismeretlen forduló";

  const prompt = `
Te egy profi futballelemzo es kockazatkezelo fogadasi szakerto vagy.
Feladatod: adj hasznalhato, rovid, de szakmai meccselemzest magyar nyelven, valos adatokra tamaszkodva.

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

VALASZ FORMATUM (MARKDOWN, pontosan ezekkel a cimekkel)
## 1) Gyors osszkep
- 3-5 rovid bullet: forma, motivacio, meccskep varhato iranya

## 2) Eselyek (1X2)
- Hazai: XX%
- Döntetlen: XX%
- Vendeg: XX%
- Indoklas 3-4 rovid pontban
- Fontos: az osszeg legyen 100%

## 3) Taktikai kep es kulcspontok
- Hazai terv (tamadas/vedekezes/atmenetek)
- Vendeg terv (tamadas/vedekezes/atmenetek)
- 2-3 potencialis meccsdonto parharc vagy zona

## 4) Golpiaci varakozas
- Over/Under 2.5: melyik es miert
- BTTS (mindket csapat golt szerez): Igen/Nem + rovid indoklas

## 5) Tippjavaslatok (kockazat szerint)
- Konzervativ tipp:
- Kiegyensulyozott tipp:
- Magas kockazatu tipp:
- Minden tipphez 1 mondat indoklas

## 6) Pontos tipp es bizalom
- Varhato vegeredmeny:
- Bizalmi szint (1-10):
- 2 fo kockazati faktor, ami borithatja a tippet

A stilus legyen professzionalis, kozertheto, targyilagos.
  `;

  if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
    return "Kérlek add meg a Gemini API kulcsodat az elemzéshez! Addig is, itt egy minta elemzés: Ez egy nagyon izgalmas mérkőzés lesz a két top csapat között. Mindkét fél jó formában van, így szoros küzdelemre számítunk. Tipp: Mindkét csapat szerez gólt (BTS).";
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
        const aligned = applyContextProbabilities(text, context);
        const normalized = normalize1X2Probabilities(aligned);
        return ensureSourceReminder(normalized);
      }
    } catch (error) {
      lastError = error;
      console.error(`Error with Gemini model ${modelName}:`, error);
    }
  }

  const rawMessage = lastError instanceof Error ? lastError.message : "Ismeretlen Gemini hiba";
  throw new Error(`A Gemini szolgáltatás most nem elérhető (${rawMessage}).`);
}
