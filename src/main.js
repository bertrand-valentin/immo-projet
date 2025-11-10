import "dotenv/config";
import { Client } from "@notionhq/client";
import axios from "axios";
import * as cheerio from "cheerio";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DB_ID;

async function defaultScraper(url) {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);

    const title = $("title").text().trim() || "Page sans titre";
    const description =
        $('meta[name="description"]').attr("content") ||
        $('meta[property="og:description"]').attr("content") ||
        "";
    const image =
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="twitter:image"]').attr("content") ||
        "";
    const city =
        $('meta[property="og:locale"]').attr("content") ||
        "";

    const price = "";
    const pricePerM2 = "";
    const surfaceHouse = "";
    const surfaceLand = "";

    return { title, description, image, city, price, pricePerM2, surfaceHouse, surfaceLand };
}

const scrapers = {
    "leboncoin.fr": defaultScraper,
    "propietes-privees.com": defaultScraper,
    "immobilier.lefigaro.fr": defaultScraper,
    "immobilier.notaires.fr": defaultScraper,
    "seloger.com": defaultScraper,
    "paruvendu.fr": defaultScraper,
    "guy-hoquet.com": defaultScraper,
    "bienici.com": defaultScraper,
};

async function run(url) {
    console.log(`🔍 Scraping de : ${url}`);

    const domain = (new URL(url)).hostname.replace(/^www\./, "");
    const scraper = scrapers[domain] || defaultScraper;
    console.log(`🛠️ Utilisation du scraper pour le domaine : ${domain}`);

    const { title, description, image, city, price, pricePerM2, surfaceHouse, surfaceLand } = await scraper(url);

    await notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: {
            Title: { title: [{ text: { content: title } }] },

            Scrapping: { select: { name: "🟢 Scrappé" } },

            Prix: { rich_text: [{ text: { content: price } }] },
            "Prix/m2": { rich_text: [{ text: { content: pricePerM2 } }] },
            "Surface maison": { rich_text: [{ text: { content: surfaceHouse } }] },
            "Surface terrain": { rich_text: [{ text: { content: surfaceLand } }] },
            Ville: { rich_text: [{ text: { content: city } }] },
            Description: { rich_text: [{ text: { content: description } }] },

            URL: { url },
        },
        ...(image && {
            cover: { external: { url: image } },
        }),
    });

    console.log("✅ Carte ajoutée à Notion !");
}

const url = process.argv[2];
if (!url) {
    console.error("❌ Utilisation : node src/main.js <url>");
    process.exit(1);
}

run(url).catch(console.error);