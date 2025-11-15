import { Client } from "@notionhq/client";
import leboncoinScraper from "./scrapers/leboncoin.js";
import bieniciScraper from "./scrapers/bienici.js";
import defaultScraper from "./scrapers/default.js";

const notion = process.env.NOTION_TOKEN && process.env.NOTION_DB_ID ? new Client({ auth: process.env.NOTION_TOKEN }) : null;
const DATABASE_ID = process.env.NOTION_DB_ID;

const scrapers = {
    "leboncoin.fr": leboncoinScraper,
    "propietes-privees.com": defaultScraper,
    "immobilier.lefigaro.fr": defaultScraper,
    "immobilier.notaires.fr": defaultScraper,
    "seloger.com": defaultScraper,
    "paruvendu.fr": defaultScraper,
    "guy-hoquet.com": defaultScraper,
    "bienici.com": bieniciScraper,
};

async function run(url, pageId) {
    console.log(`Scraping de : ${url}`);

    const domain = (new URL(url)).hostname.replace(/^www\./, "");
    const scraper = scrapers[domain] || defaultScraper;
    console.log(`Utilisation du scraper : ${domain}`);

    const { title, description, image, city, price, pricePerM2, surfaceHouse, surfaceLand } = await scraper(url);

    if (!notion || !DATABASE_ID) {
        console.error("Variables NOTION_TOKEN ou NOTION_DB_ID manquantes");
        return;
    }

    const properties = {
        "Avancement": { status: { name: "Annonce" } },
        "Scrapping": { select: { name: "Scrappé" } },
        "Prix": { rich_text: [{ text: { content: price || "" } }] },
        "Prix/m2": { rich_text: [{ text: { content: pricePerM2 || "" } }] },
        "Surface maison": { rich_text: [{ text: { content: surfaceHouse || "" } }] },
        "Surface terrain": { rich_text: [{ text: { content: surfaceLand || "" } }] },
        "Ville": { rich_text: [{ text: { content: city || "" } }] },
        "URL": { url },
    };

    try {
        if (pageId) {
            console.log(`Mise à jour page : ${pageId}`);
            await notion.pages.update({
                page_id: pageId,
                properties
            });
        } else {
            console.log("Création nouvelle page");
            await notion.pages.create({
                parent: { database_id: DATABASE_ID },
                properties,
                ...(image && { cover: { external: { url: image } } }),
            });
        }
        console.log("Notion OK");
    } catch (error) {
        console.error("Erreur Notion :", error);
    }
}

function mapNotionUrlToRealUrl(input) {
    let url = input.trim();

    if (url.match(/^https?:\/\//i)) {
        return url.replace(/^https?:\/+(?:www\.)?/i, "https://www.");
    }

    if (url.match(/^(www\.)?bienici\.com\//i)) {
        return "https://" + url.replace(/^(www\.)?/i, "www.");
    }

    if (url.includes("bienici")) {
        const cleaned = url
            .replace(/https?:?\/?\/?/gi, "")
            .replace(/com?/gi, "com")
            .trim();
        return "https://www.bienici.com/" + cleaned.split("/").slice(1).join("/");
    }

    return "https://www." + url.replace(/^https?:\/\/\/?/gi, "");
}

(async () => {
    const rawUrl = process.argv[2];
    const pageId = process.argv[3];

    if (!rawUrl || !pageId) {
        console.error("Usage: node src/main.js <url> <pageId>");
        process.exit(1);
    }

    const url = mapNotionUrlToRealUrl(rawUrl);

    if (!url.startsWith("http")) {
        console.error("URL invalide après nettoyage :", rawUrl);
        process.exit(1);
    }

    console.log(`Scraper l'URL : ${url}`);
    console.log(`Mettre à jour la page Notion : ${pageId}`);
    await run(url, pageId);
})();