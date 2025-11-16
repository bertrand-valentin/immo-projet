import puppeteer from "puppeteer";
import { load as cheerioLoad } from "cheerio";

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
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
        await page.setUserAgent(USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]);
        await page.goto(cleanUrl, { waitUntil: "networkidle2", timeout: 20000 });
        await page.waitForSelector("h1, [data-testid='ad-title'], .ad-title", { timeout: 8000 }).catch(() => {});
        const html = await page.content();
        await browser.close();

        const $ = cheerioLoad(html);
        const clean = (t) => t?.replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim() || "";

        const title = clean($("h1, [data-testid='ad-title'], .ad-title").first().text()) || clean($('meta[property="og:title"]').attr("content"));
        const price = clean($("[data-testid='price'], .price").first().text());
        const image = $('meta[property="og:image"]').attr("content") || $("img[data-testid='main-image'], .main-photo img").first().attr("src") || "";
        const description = clean($(".description, [data-testid='description'], #description").text());

        const details = {};
        $("[data-testid^='detail'], .detail-item, dt").each((_, el) => {
            const key = clean($(el).find("label, dt, span:first").text()).toLowerCase().replace(":", "");
            const value = clean($(el).find("span:last, dd").text());
            if (key && value) details[key] = value;
        });

        const surfaceHouse = details["surface"] || details["surface habitable"] || details["surf. habitable"] || "";
        const surfaceLand = details["surface terrain"] || details["terrain"] || details["parcelle"] || "";

        let city = clean($(".location, [data-testid='location']").text());
        const cityMatch = city.match(/(\d{5})\s+(.+)/);
        city = cityMatch ? cityMatch[2] : city.split(",")[0].trim();

        let pricePerM2 = "";
        if (price && surfaceHouse) {
            const p = parseInt(price.replace(/\D/g, ""), 10);
            const s = parseFloat(surfaceHouse.match(/[\d,]+/)?.[0]?.replace(",", ".") || 0);
            if (p && s > 0) pricePerM2 = Math.round(p / s).toLocaleString("fr-FR") + " €/m²";
        }

        return {
            title,
            description: description.slice(0, 1990),
            image,
            city,
            price,
            pricePerM2,
            surfaceHouse,
            surfaceLand,
        };
    } catch (error) {
        console.error("Erreur BienIci :", error.message);
        return { title: "Erreur scraping", description: "", image: "", city: "", price: "", pricePerM2: "", surfaceHouse: "", surfaceLand: "" };
    }
}