import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as cheerio from "cheerio";

puppeteerExtra.use(StealthPlugin());

const USER_DATA_DIR = process.env.USER_DATA_DIR || "./puppeteer_data";
const PROXY = process.env.RESIDENTIAL_PROXY || ""; // ex: "http://user:pass@host:port"

function extractNumber(text) {
    if (!text) return null;
    const cleaned = text.replace(/\u00A0/g, " ").replace(/€/g, "").replace(/\s+/g, " ").trim();
    const match = cleaned.match(/[\d]+(?:[.,]\d+)?/);
    if (!match) return null;
    return parseFloat(match[0].replace(/\./g, "").replace(/,/g, "."));
}

function looksBlocked(html, $) {
    return (
        !html ||
        html.toLowerCase().includes("datadome") ||
        (Boolean($) && $('img[src*="datadome"]').length > 0) ||
        /captcha/i.test(html) ||
        /you are being blocked/i.test(html)
    );
}

async function waitMs(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

export default async function leboncoinScraper(url, { retries = 2, timeout = 30000 } = {}) {
    let browser;
    try {
        const launchArgs = [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
            "--disable-extensions",
            "--disable-notifications",
            "--lang=fr-FR"
        ];
        if (PROXY) launchArgs.push(`--proxy-server=${PROXY}`);

        browser = await puppeteerExtra.launch({
            headless: true,
            userDataDir: USER_DATA_DIR,
            ignoreHTTPSErrors: true,
            args: launchArgs,
            defaultViewport: { width: 1280, height: 800 }
        });

        const page = await browser.newPage();
        const UA =
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        await page.setUserAgent(UA);
        await page.setExtraHTTPHeaders({ "accept-language": "fr-FR,fr;q=0.9" });

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => false });
            window.navigator.chrome = { runtime: {} };
            Object.defineProperty(navigator, "languages", { get: () => ["fr-FR", "fr"] });
            Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
        });

        let html = "";
        let $ = null;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                await page.goto(url, { waitUntil: "domcontentloaded", timeout });
            } catch (_) { /* ignore navigation errors and continue */ }

            // attendre un peu puis attendre un des sélecteurs utiles
            await waitMs(800);
            try {
                await Promise.race([
                    page.waitForSelector("h1", { timeout: 3000 }),
                    page.waitForSelector('[data-qa-id="adview_title"]', { timeout: 3000 }),
                    page.waitForSelector('[data-qa-id="adview_price"]', { timeout: 3000 }),
                    waitMs(1800)
                ]);
            } catch (_) {}

            // attendre un peu d'activité réseau
            try { await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 3000 }); } catch (_) {}

            html = await page.content();
            $ = cheerio.load(html);

            if (!looksBlocked(html, $)) break;

            if (!PROXY) {
                return {
                    blocked: true,
                    blockedReason: "datadome_or_captcha_no_proxy",
                    title: "",
                    description: "",
                    image: "",
                    city: "",
                    price: "",
                    priceValue: null,
                    pricePerM2: "",
                    surfaceHouse: "",
                    surfaceLand: ""
                };
            }

            // si proxy configuré, attendre puis retry (possible rotation côté proxy)
            await waitMs(1500 + attempt * 1000);
            try { await page.reload({ waitUntil: "domcontentloaded", timeout }).catch(() => {}); } catch (_) {}
        }

        if (looksBlocked(html, $)) {
            return {
                blocked: true,
                blockedReason: "still_blocked_after_retries",
                title: "",
                description: "",
                image: "",
                city: "",
                price: "",
                priceValue: null,
                pricePerM2: "",
                surfaceHouse: "",
                surfaceLand: ""
            };
        }

        let jsonLd = null;
        $('script[type="application/ld+json"]').each((_, el) => {
            try {
                const data = JSON.parse($(el).contents().text());
                if (data && (data.name || data.description || data.offers)) jsonLd = data;
            } catch (_) {}
        });

        const title =
            $('h1').first().text().trim() ||
            $('[data-qa-id="adview_title"]').text().trim() ||
            $('[data-testid="adview-title"]').text().trim() ||
            (jsonLd && jsonLd.name) ||
            "";

        const image =
            $('meta[property="og:image"]').attr("content") ||
            $('[data-qa-id="adview_photos"] img').first().attr("src") ||
            (Array.isArray(jsonLd?.image) ? jsonLd.image[0] : jsonLd?.image) ||
            "";

        const priceText =
            $('[data-qa-id="adview_price"]').first().text().trim() ||
            $('[data-testid="adview-price"]').first().text().trim() ||
            (jsonLd?.offers?.price ? `${jsonLd.offers.price}` : "") ||
            $('meta[property="og:price:amount"]').attr("content") ||
            "";
        const priceNum = extractNumber(priceText);
        const bodyText = $("body").text();

        let surfaceHouse = "";
        let surfaceNum = null;
        const surfaceMatch = bodyText.match(/(\d{1,4}(?:[.,\s]\d{1,3})?\s?m²)/i);
        if (surfaceMatch) {
            surfaceHouse = surfaceMatch[0].replace(/\s+/g, " ").trim();
            const numMatch = surfaceHouse.match(/[\d.,]+/);
            if (numMatch) surfaceNum = parseFloat(numMatch[0].replace(/\./g, "").replace(/,/g, "."));
        } else if (jsonLd?.floorSize?.value) {
            surfaceNum = Number(jsonLd.floorSize.value) || null;
            surfaceHouse = jsonLd.floorSize.value ? `${jsonLd.floorSize.value} m²` : "";
        }

        let surfaceLand = "";
        const terrainMatch = bodyText.match(/terrain[^.\n\r]{0,40}?(\d{1,4}(?:[.,\s]\d{1,3})?\s?m²)/i);
        if (terrainMatch) surfaceLand = terrainMatch[1].trim();

        let city =
            $('[data-qa-id="adview_location"]').text().trim() ||
            $('[data-qa-id="adview_location"] a').first().text().trim() ||
            $('[data-testid="adview-location"]').text().trim() ||
            (jsonLd?.address?.addressLocality) ||
            "";
        if (!city) {
            const cityMatch = bodyText.match(/([A-Za-zÀ-ÖØ-öø-ÿ\- ]{2,40})\s*\d{5}/);
            if (cityMatch) city = cityMatch[1].trim();
        }

        let pricePerM2 = "";
        if (priceNum && surfaceNum && surfaceNum > 0) {
            const ppm2 = Math.round(priceNum / surfaceNum);
            pricePerM2 = `${ppm2} €/m²`;
        }

        const description =
            $('meta[name="description"]').attr("content") ||
            $('meta[property="og:description"]').attr("content") ||
            $('[data-qa-id="adview_description"]').text().trim() ||
            (jsonLd?.description) ||
            "";

        return { blocked: false, title, description, image, city, price: priceText, priceValue: priceNum, pricePerM2, surfaceHouse, surfaceLand };
    } catch (error) {
        console.error("Erreur leboncoinScraper:", error);
        return { blocked: true, blockedReason: "internal_error", title: "", description: "", image: "", city: "", price: "", priceValue: null, pricePerM2: "", surfaceHouse: "", surfaceLand: "" };
    } finally {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
    }
}