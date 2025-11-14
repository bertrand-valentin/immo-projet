import puppeteer from "puppeteer";
import * as cheerio from "cheerio";

async function defaultScraper(url, site) {
    try {
        const browser = await puppeteer.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded" });
        const html = await page.content();
        await browser.close();
        const $ = cheerio.load(html);

        let title = $("title").text().trim() || "Page sans titre";
        let description =
            $('meta[name="description"]').attr("content") ||
            $('meta[property="og:description"]').attr("content") ||
            "";
        let image =
            $('meta[property="og:image"]').attr("content") ||
            $('meta[name="twitter:image"]').attr("content") ||
            "";
        let city =
            $('meta[property="og:locale"]').attr("content") ||
            "";

        let price = "";
        let pricePerM2 = "";
        let surfaceHouse = "";
        let surfaceLand = "";

        if (site === "leboncoin") {
            price = $('.Price__value').first().text().trim() || "";
            surfaceHouse = $('.Property__surface').first().text().trim() || "";
            city = $('.Property__city').first().text().trim() || city;
        }

        return { title, description, image, city, price, pricePerM2, surfaceHouse, surfaceLand };
    } catch (error) {
        console.error(`Erreur lors du scraping de ${url}:`, error);
        return {
            title: "",
            description: "",
            image: "",
            city: "",
            price: "",
            pricePerM2: "",
            surfaceHouse: "",
            surfaceLand: ""
        };
    }
}

export default defaultScraper;