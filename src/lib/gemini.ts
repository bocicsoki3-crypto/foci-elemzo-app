import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn("GEMINI_API_KEY is not defined in environment variables");
}

const genAI = new GoogleGenerativeAI(API_KEY || "");

export async function analyzeMatch(matchDetails: any) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const prompt = `
    Te egy profi futball elemző és fogadási szakértő vagy. 
    Elemezd a következő mérkőzést:
    
    Bajnokság: ${matchDetails.competition.name}
    Hazai csapat: ${matchDetails.homeTeam.name}
    Vendég csapat: ${matchDetails.awayTeam.name}
    Időpont: ${matchDetails.utcDate}
    
    Kérlek adj meg egy részletes elemzést az alábbi szempontok alapján:
    1. Esélylatolgatás (ki a favorit és miért)
    2. Várható taktika és kulcsjátékosok
    3. Gólszám tipp (under/over)
    4. Pontos végeredmény tipp
    5. Biztonsági tipp (pl. 1X, X2, vagy DNB)
    
    A válaszod legyen professzionális, lényegre törő és magyar nyelvű. Használj formázást (markdown).
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Error with Gemini AI:", error);
    if (!API_KEY || API_KEY === 'your_gemini_api_key_here') {
      return "Kérlek add meg a Gemini API kulcsodat az elemzéshez! Addig is, itt egy minta elemzés: Ez egy nagyon izgalmas mérkőzés lesz a két top csapat között. Mindkét fél jó formában van, így szoros küzdelemre számítunk. Tipp: Mindkét csapat szerez gólt (BTS).";
    }
    throw error;
  }
}
