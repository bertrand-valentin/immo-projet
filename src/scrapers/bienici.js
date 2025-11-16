import puppeteer from "puppeteer";
import { load as cheerioLoad } from "cheerio";

export default async function bieniciScraper(rawUrl) {
    const cleanUrl = rawUrl.split("?")[0].replace(/\/q\/.*/, "");

    try {
        console.log("Scraping BienIci →", cleanUrl);

        const browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-blink-features=AutomationControlled",
            ],
        });

        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
        await page.goto(cleanUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

        await Promise.race([
            page.waitForSelector("[data-testid='price'], .price", { timeout: 20000 }).catch(() => {}),
            page.waitForSelector("h1", { timeout: 15000 }).catch(() => {}),
            page.waitForFunction(() => document.body.innerText.includes("€"), { timeout: 20000 }).catch(() => {}),
        ]);

        await page.waitForTimeout(3000);

        const html = await page.content();
        await browser.close();

        const $ = cheerioLoad(html);
        const clean = (t) => t?.replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim() || "";

        const title = clean($("h1").first().text() || $("title").text());

        const priceTexts = [];
        $("*").contents().filter(function () { return this.type === "text"; }).each((_, el) => {
            const txt = clean($(el).text());
            if (txt.includes("€") && /\d/.test(txt)) priceTexts.push(txt);
        });

        let price = "";
        if (priceTexts.length > 0) {
            const amounts = priceTexts
                .map(t => parseInt(t.replace(/\D/g, ""), 10))
                .filter(n => n > 50000 && n < 10_000_000);
            const maxAmount = Math.max(...amounts);
            price = maxAmount.toLocaleString("fr-FR") + " €";
        }

        const image = $("meta[property='og:image']").attr("content") || "";

        const city = clean($("[data-testid='location'], .location, h2, .breadcrumb").text())
            .replace(/\d{5}.*/g, "")
            .replace(/[-–—]/g, "")
            .split("·")[0]
            .trim();

        let surfaceHouse = "";
        let surfaceLand = "";
        $("text").each((_, el) => {
            const txt = clean($(el).text());
            if (txt.includes("m²") && /\d/.test(txt)) {
                if (txt.toLowerCase().includes("terrain") || txt.toLowerCase().includes("parcelle")) {
                    surfaceLand = txt;
                } else if (!surfaceHouse) {
                    surfaceHouse = txt;
                }
            }
        });

        let pricePerM2 = "";
        if (price && surfaceHouse) {
            const p = parseInt(price.replace(/\D/g, ""), 10);
            const s = parseFloat(surfaceHouse.replace(/[^\d,]/g, "").replace(",", "."));
            if (p && s > 0) pricePerM2 = Math.round(p / s).toLocaleString("fr-FR") + " €/m²";
        }

        const result = { title, price, image, city, pricePerM2, surfaceHouse, surfaceLand, description: "" };

        console.log("BIENICI — CHAMPS SCRAPPÉS (16 nov 2025 - FINAL FIX) :");
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