import puppeteer from "puppeteer";
import { load as cheerioLoad } from "cheerio";

export default async function bieniciScraper(rawUrl) {
    const cleanUrl = rawUrl.split("?")[0].replace(/\/q\/.*/, "");

    try {
        console.log("Scraping BienIci →", cleanUrl);

        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });

        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
        await page.goto(cleanUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

        await Promise.race([
            page.waitForSelector("[data-testid='price'], .price", { timeout: 15000 }).catch(() => {}),
            page.waitForSelector("h1", { timeout: 10000 }).catch(() => {}),
        ]);

        await new Promise(r => setTimeout(r, 3000));

        const html = await page.content();
        await browser.close();

        const $ = cheerioLoad(html);
        const clean = (t) => t?.replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim() || "";

        const fullText = clean($("body").text());

        const title = clean($("h1").first().text() || $("title").text().split("- Bien'ici")[0]);

        const priceMatch = fullText.match(/(\d{1,3}(?:\s\d{3})*)\s*€/);
        const price = priceMatch ? priceMatch[1].replace(/\s/g, " ") + " €" : "";

        const image = $("meta[property='og:image']").attr("content") || "";

        const cityMatch = fullText.match(/(?:à|À)\s+([A-Za-zÀ-ÿ\s-]+?)(?:\s+\(|\s+37|$)/i);
        const city = cityMatch ? cityMatch[1].trim() : "Tours";

        const surfaceHouseMatch = fullText.match(/(\d{2,4})\s*m²(?:\s*habitable|\s*hab|\s*de\s*surface)?/i);
        const surfaceHouse = surfaceHouseMatch ? surfaceHouseMatch[1] + " m²" : "";

        const surfaceLandMatch = fullText.match(/terrain\s+de\s+(\d{3,5})\s*m²/i) || fullText.match(/(\d{3,5})\s*m²\s+de\s*terrain/i);
        const surfaceLand = surfaceLandMatch ? surfaceLandMatch[1] + " m²" : "";

        let pricePerM2 = "";
        if (price && surfaceHouse) {
            const p = parseInt(price.replace(/\D/g, ""), 10);
            const s = parseFloat(surfaceHouse.replace(/\D/g, ""));
            if (p && s > 0) pricePerM2 = Math.round(p / s).toLocaleString("fr-FR") + " €/m²";
        }

        const result = { title, price, image, city, pricePerM2, surfaceHouse, surfaceLand, description: "" };

        console.log("BIENICI — CHAMPS SCRAPPÉS :");
        console.log("→ Titre          :", `"${result.title}"`);
        console.log("→ Prix           :", `"${result.price}"`);
        console.log("→ Ville          :", `"${result.city}"`);
        console.log("→ Surface maison :", `"${result.surfaceHouse}"`);
        console.log("→ Surface terrain:", `"${result.surfaceLand}"`);
        console.log("→ Prix/m²        :", `"${result.pricePerM2}"`);
        console.log("→ Image          :", image ? "OK" : "KO");

        return result;

    } catch (error) {
        console.error("Erreur BienIci :", error.message);
        return { title: "Erreur", price: "", image: "", city: "", pricePerM2: "", surfaceHouse: "", surfaceLand: "", description: "" };
    }
}