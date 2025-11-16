import puppeteer from "puppeteer";
import { load as cheerioLoad } from "cheerio";

export default async function bieniciScraper(rawUrl) {
    const cleanUrl = rawUrl.split("?")[0].replace(/\/q\/.*/, "");

    try {
        console.log("Scraping BienIci →", cleanUrl);
        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-web-security"],
        });
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36");
        await page.goto(cleanUrl, { waitUntil: "networkidle2", timeout: 25000 });

        await page.waitForSelector("[data-testid='price'], .price", { timeout: 15000 });
        await page.waitForSelector("[data-testid^='detail-'], .detailCard", { timeout: 10000 }).catch(() => {});

        const html = await page.content();
        await browser.close();

        const $ = cheerioLoad(html);
        const clean = (t) => t?.replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim() || "";

        const title = clean($("h1").first().text());
        const priceRaw = clean($("[data-testid='price'], .price").first().text());
        const price = priceRaw.split("€")[0].trim() + " €";
        const image = $("meta[property='og:image']").attr("content") || "";
        const city = clean($("[data-testid='location'] span, .location span, .location").first().text())
            .replace(/\d{5}.*/, "").replace(/[-–]/g, "").trim();

        const details = {};
        $("[data-testid*='detail-'], [data-qa*='detail-'], .detailCard__value, .detailItem").each((_, el) => {
            const label = clean($(el).prev().text() || $(el).find("span").first().text()).toLowerCase();
            const value = clean($(el).text());
            if (label.includes("surface") || label.includes("terrain")) {
                if (label.includes("terrain") || label.includes("parcelle")) details["terrain"] = value;
                else details["surface"] = value;
            }
        });

        if (!details["surface"]) {
            $("text").each((_, el) => {
                const txt = clean($(el).text());
                if (txt.includes("m²") && txt.match(/\d/)) {
                    if (txt.toLowerCase().includes("terrain") || txt.toLowerCase().includes("parcelle")) {
                        details["terrain"] = txt;
                    } else if (!details["surface"] || txt.includes("hab")) {
                        details["surface"] = txt;
                    }
                }
            });
        }

        const surfaceHouse = details["surface"] || "";
        const surfaceLand = details["terrain"] || "";

        let pricePerM2 = "";
        if (price && surfaceHouse) {
            const p = parseInt(price.replace(/\D/g, ""), 10);
            const s = parseFloat(surfaceHouse.replace(/[^\d,]/g, "").replace(",", "."));
            if (p && s > 0) pricePerM2 = Math.round(p / s).toLocaleString("fr-FR") + " €/m²";
        }

        const result = { title, price, image, city, pricePerM2, surfaceHouse, surfaceLand, description: "" };

        console.log("BIENICI — CHAMPS SCRAPPÉS (FINAL 16 nov 2025) :");
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