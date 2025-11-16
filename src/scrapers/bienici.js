import puppeteer from "puppeteer";
import { load as cheerioLoad } from "cheerio";

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
];

export default async function bieniciScraper(rawUrl) {
    const cleanUrl = rawUrl.split("?")[0].replace(/\/q\/.*/, "");

    try {
        console.log("Scraping BienIci →", cleanUrl);
        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        });
        const page = await browser.newPage();
        await page.setUserAgent(USER_AGENTS[0]);
        await page.goto(cleanUrl, { waitUntil: "networkidle2", timeout: 20000 });
        await page.waitForSelector("[data-testid='price'], .priceValue, h1", { timeout: 10000 });
        const html = await page.content();
        await browser.close();

        const $ = cheerioLoad(html);
        const clean = (t) => t?.replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim() || "";

        const title = clean($("h1").first().text()) || clean($("title").text());
        const price = clean($("[data-testid='price'], .priceValue, .detailPrice").first().text());
        const image = $("meta[property='og:image']").attr("content") || "";

        const cityRaw = clean($("[data-testid='location'], .locationTitle, .detailLocation").text());
        const city = cityRaw.split(/(\d{5})/)[2]?.trim() || cityRaw.split(",")[0]?.trim() || "";

        const details = {};
        $("[data-testid*='detail-'], .detailLine, .characteristicsList li, .detailItem, dl dt, .propertyFeatures li").each((_, el) => {
            const text = clean($(el).text());
            const [key, ...val] = text.split(":");
            if (key && val.length) details[clean(key).toLowerCase()] = clean(val.join(":"));
        });

        const surfaceHouse = details["surface"] || details["surface habitable"] || details["surf. habitable"] || details["surface (m²)"] || "";
        const surfaceLand = details["terrain"] || details["surface terrain"] || details["surface du terrain"] || details["terrain (m²)"] || "";

        let pricePerM2 = "";
        if (price && surfaceHouse) {
            const p = parseInt(price.replace(/\D/g, ""), 10);
            const s = parseFloat(surfaceHouse.replace(/[^\d,]/g, "").replace(",", "."));
            if (p && s > 0) pricePerM2 = Math.round(p / s).toLocaleString("fr-FR") + " €/m²";
        }

        const result = {
            title,
            description: "",
            image,
            city,
            price,
            pricePerM2,
            surfaceHouse,
            surfaceLand,
        };

        console.log("BIENICI — CHAMPS SCRAPPÉS (pour vérif mapping Notion) :");
        console.log("→ Titre          :", `"${result.title}"`);
        console.log("→ Prix           :", `"${result.price}"`);
        console.log("→ Ville          :", `"${result.city}"`);
        console.log("→ Surface maison :", `"${result.surfaceHouse}"`);
        console.log("→ Surface terrain:", `"${result.surfaceLand}"`);
        console.log("→ Prix/m²        :", `"${result.pricePerM2}"`);
        console.log("→ Image (cover)  :", result.image ? "OK (" + result.image.substring(0, 80) + "…)" : "KO");
        console.log("→ URL utilisée   :", cleanUrl);

        return result;

    } catch (error) {
        console.error("Erreur finale BienIci :", error.message);
        return { title: "Erreur scraping", image: "", city: "", price: "", pricePerM2: "", surfaceHouse: "", surfaceLand: "" };
    }
}