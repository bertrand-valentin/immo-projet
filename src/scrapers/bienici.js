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
        await page.goto(cleanUrl, { waitUntil: "networkidle2", timeout: 20000 });

        await page.waitForFunction(() => document.querySelector("[data-testid='price']") || document.querySelector(".price-amount") || document.querySelector(".ad-price"), { timeout: 15000 });

        const html = await page.content();
        await browser.close();

        const $ = cheerioLoad(html);
        const clean = (t) => t?.replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim() || "";

        const title = clean($("h1[data-testid='ad-title'], h1, title").first().text());

        const priceSelectors = "[data-testid='price'], .price-amount, .ad-price, [data-qa='price'], span:contains('€') + span, .price";
        const priceElement = $(priceSelectors).first().contents().filter(function() { return this.type === 'text'; }).text() || $(priceSelectors).first().text();
        const price = clean(priceElement).replace(/^€/, "").trim() || "";

        const image = $("meta[property='og:image']").attr("content") || $("[data-testid='main-image'] img, .hero-image img").first().attr("src") || "";

        const cityRaw = clean($("[data-testid='location'], .location, .ad-location").text());
        const city = cityRaw.replace(/\d{5}/g, "").replace(/[,()]/g, "").trim().split(" - ")[0] || "";

        const details = {};
        $("[data-testid*='detail'], [data-qa*='detail'], .detail-row, .feature-item, dl dt").each((_, el) => {
            const fullText = clean($(el).text());
            if (fullText.includes(":")) {
                const [key, value] = fullText.split(":");
                const k = clean(key).toLowerCase();
                const v = clean(value);
                if (k && v) details[k] = v;
            }
        });

        const surfaceHouse = details["surface"] || details["surface habitable"] || details["surf. habitable"] || details["surface (m²)"] || "";
        const surfaceLand = details["terrain"] || details["surface terrain"] || details["surface du terrain"] || details["parcelle"] || "";

        let pricePerM2 = "";
        if (price && surfaceHouse) {
            const p = parseInt(price.replace(/\D/g, ""), 10);
            const s = parseFloat(surfaceHouse.replace(/[^\d,]/g, "").replace(",", "."));
            if (p && s > 0) pricePerM2 = Math.round(p / s).toLocaleString("fr-FR") + " €/m²";
        }

        const result = { title, price, image, city, pricePerM2, surfaceHouse, surfaceLand, description: "" };

        console.log("BIENICI — CHAMPS SCRAPPÉS (16 nov 2025) :");
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