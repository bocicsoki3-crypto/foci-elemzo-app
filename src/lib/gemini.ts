import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn("GEMINI_API_KEY is not defined in environment variables");
}

const genAI = new GoogleGenerativeAI(API_KEY || "");
const MODEL_CANDIDATES = ["gemini-2.0-flash", "gemini-1.5-flash"];

export async function analyzeMatch(matchDetails: any) {
  const competitionName = matchDetails?.competition?.name || "Ismeretlen bajnokság";
  const homeTeamName = matchDetails?.homeTeam?.name || "Ismeretlen hazai csapat";
  const awayTeamName = matchDetails?.awayTeam?.name || "Ismeretlen vendég csapat";
  const kickoff = matchDetails?.utcDate || "Ismeretlen időpont";
  const matchday = matchDetails?.matchday || "Ismeretlen forduló";

  const prompt = `
Te egy profi futballelemzo es kockazatkezelo fogadasi szakerto vagy.
Feladatod: adj hasznalhato, rovid, de szakmai meccselemzest magyar nyelven.

MERKOZES ADATOK
- Bajnoksag: ${competitionName}
- Fordulo: ${matchday}
- Hazai: ${homeTeamName}
- Vendeg: ${awayTeamName}
- Kezdes (UTC): ${kickoff}

MUKODESI SZABALYOK
1) Ha egy adat nem biztos (pl. serulesek, varhato kezdok), jelezd egyertelmuen: "nem megerositett".
2) Ne allits tenykent olyat, amit nem tudsz ellenorizni.
3) Keruld a tulhypeolt, clickbait mondatokat.
4) Adj gyakorlati, indokolt tippeket (nem csak vegeredmenyt).
5) Legyen tomor: max 2200 karakter.

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

  let lastError: unknown = null;
  for (const modelName of MODEL_CANDIDATES) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      if (text?.trim()) return text;
    } catch (error) {
      lastError = error;
      console.error(`Error with Gemini model ${modelName}:`, error);
    }
  }

  const rawMessage = lastError instanceof Error ? lastError.message : "Ismeretlen Gemini hiba";
  throw new Error(`A Gemini szolgáltatás most nem elérhető (${rawMessage}).`);
}
