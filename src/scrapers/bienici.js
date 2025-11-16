import puppeteer from "puppeteer";
import { load as cheerioLoad } from "cheerio";

export default async function bieniciScraper(rawUrl) {
    const cleanUrl = rawUrl.split("?")[0].replace(/\/q\/.*/, "");

    try {
        console.log("Scraping BienIci →", cleanUrl);

        const browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXEC_PATH || undefined,
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
        await page.setExtraHTTPHeaders({ "Accept-Language": "fr-FR,fr;q=0.9" });

        await page.goto(cleanUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

        await Promise.race([
            page.waitForSelector("[data-testid='price'], .price", { timeout: 20000 }),
            page.waitForSelector("h1", { timeout: 15000 }),
            page.waitForFunction(() => !!document.querySelector("h1") || document.body.innerText.includes("€"), { timeout: 20000 }),
        ]).catch(() => console.log("Un des sélecteurs trouvé, on continue"));

        await page.waitForTimeout(3000);

        const html = await page.content();
        await browser.close();

        const $ = cheerioLoad(html);
        const clean = (t) => t?.replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim() || "";

        const title = clean($("h1").first().text() || $("title").text());

        // Prix : on prend tout ce qui contient € et on garde le plus gros montant
        const priceTexts = [];
        $("*").contents().filter(function() { return this.type === 'text'; }).each((_, el) => {
            const txt = clean($(el).text());
            if (txt.includes("€") && txt.match(/\d/)) priceTexts.push(txt);
        });
        const price = priceTexts
            .map(t => parseInt(t.replace(/\D/g), ""), 10))
    .filter(n => n > 50000)
            .sort((a, b) => b - a)[0];
        const priceStr = price ? price.toLocaleString("fr-FR") + " €" : "";

        const image = $("meta[property='og:image']").attr("content") || "";

        // Ville : on prend le texte du bloc location
        const city = clean($("[data-testid='location'], .location, h2, .breadcrumb").text())
            .replace(/\d{5}.*/g, "")
            .replace(/[-–—]/g, "")
            .split("·")[0]
            .trim();

        let surfaceHouse = "";
        let surfaceLand = "";
        $("text").each((_, el) => {
            const txt = clean($(el).text());
            if (txt.includes("m²") && txt.match(/\d/)) {
                if (txt.toLowerCase().includes("terrain") || txt.toLowerCase().includes("parcelle")) {
                    surfaceLand = txt;
                } else if (!surfaceHouse && (txt.includes("hab") || txt.match(/\d{3,}/))) {
                    surfaceHouse = txt;
                }
            }
        });

        let pricePerM2 = "";
        if (price && surfaceHouse) {
            const s = parseFloat(surfaceHouse.replace(/[^\d,]/g, "").replace(",", "."));
            if (s > 0) pricePerM2 = Math.round(price / s).toLocaleString("fr-FR") + " €/m²";
        }

        const result = { title, price: priceStr, image, city, pricePerM2, surfaceHouse, surfaceLand, description: "" };

        console.log("BIENICI — CHAMPS SCRAPPÉS (FINAL 16 nov 2025 15:19) :");
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