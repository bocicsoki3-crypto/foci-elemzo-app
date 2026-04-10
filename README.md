# FociElemző AI ⚽🤖

Ez egy modern webalkalmazás, amely a mai és holnapi futballmérkőzéseket listázza, és a Google Gemini AI segítségével részletes elemzést és fogadási tippeket ad.

## Funkciók

- **Mai és holnapi meccsek:** Naprakész lista a legfontosabb bajnokságokból.
- **Gemini AI Elemzés:** Egyetlen kattintással profi elemzést kapsz a kiválasztott meccsről.
- **Modern UI:** Tailwind CSS-szel készült, reszponzív és sötét mód barát felület.
- **Saját használatra:** Letisztult, reklámmentes felület.

## Telepítés és Beállítás

1. **API Kulcsok:**
   - Szerezz egy kulcsot a [football-data.org](https://www.football-data.org/)-tól.
   - Szerezz egy Gemini API kulcsot a [Google AI Studio](https://aistudio.google.com/)-tól.

2. **Környezeti változók:**
   Hozz létre egy `.env.local` fájlt a gyökérkönyvtárban:
   ```env
   FOOTBALL_API_KEY=a_te_kulcsod
   GEMINI_API_KEY=a_te_gemini_kulcsod
   ```

3. **Futtatás:**
   ```bash
   npm install
   npm run dev
   ```

## Feltöltés Vercelre

1. Menj a [Vercel](https://vercel.com/) oldalára.
2. Kattints az **"Add New"** -> **"Project"** gombra.
3. Importáld ezt a GitHub repót: `https://github.com/bocicsoki3-crypto/foci-elemzo-app.git`.
4. A **Environment Variables** résznél add meg a `FOOTBALL_API_KEY` és `GEMINI_API_KEY` kulcsokat.
5. Kattints a **Deploy** gombra.

## Technológiák

- **Next.js 14** (App Router)
- **Tailwind CSS**
- **Google Gemini AI**
- **Framer Motion** (Animációk)
- **Lucide React** (Ikonok)
