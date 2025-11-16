import { Client } from "@notionhq/client";
import leboncoinScraper from "./scrapers/leboncoin.js";
import bieniciScraper from "./scrapers/bienici.js";
import defaultScraper from "./scrapers/default.js";

const notion = process.env.NOTION_TOKEN && process.env.NOTION_DB_ID ? new Client({ auth: process.env.NOTION_TOKEN }) : null;

const scrapers = {
    "leboncoin.fr": leboncoinScraper,
    "bienici.com": bieniciScraper,
    "propietes-privees.com": defaultScraper,
    "immobilier.lefigaro.fr": defaultScraper,
    "immobilier.notaires.fr": defaultScraper,
    "seloger.com": defaultScraper,
    "paruvendu.fr": defaultScraper,
    "guy-hoquet.com": defaultScraper,
};

async function updateNotion(pageId, properties, coverUrl = null) {
    if (!notion) return console.error("Notion non configuré");
    const payload = { page_id: pageId, properties };
    if (coverUrl) payload.cover = { type: "external", external: { url: coverUrl } };
    try {
        await notion.pages.update(payload);
        console.log("Notion mise à jour avec succès");
    } catch (e) {
        console.error("Erreur Notion :", e.message);
    }
}

(async () => {
    const realUrl = process.argv[2];
    const pageId  = process.argv[3];
    if (!realUrl || !pageId) process.exit(1);

    console.log(`Scraping → ${realUrl}`);

    let domain = "unknown";
    try { domain = new URL(realUrl).hostname.replace(/^www\./, ""); } catch (_) {}

    const scraper = scrapers[domain] || defaultScraper;

    let result = {};
    try {
        result = await scraper(realUrl);
    } catch (e) {
        console.error("Scraper planté :", e.message);
        await updateNotion(pageId, { Scrapping: { select: { name: "Erreur" } } });
        process.exit(0);
    }

    const { title = "", price = "", image = "", city = "", pricePerM2 = "", surfaceHouse = "", surfaceLand = "" } = result;

    const properties = {
        Nom: { title: [{ text: { content: title || "Maison sans titre" } }] },
        Avancement: { status: { name: "Annonce" } },
        Scrapping:  { select:  { name: "Scrappé" } },
        Prix:       { rich_text: [{ text: { content: price } }] },
        "Prix/m2":  { rich_text: [{ text: { content: pricePerM2 } }] },
        "Surface maison":   { rich_text: [{ text: { content: surfaceHouse } }] },
        "Surface terrain":  { rich_text: [{ text: { content: surfaceLand } }] },
        Ville:      { rich_text: [{ text: { content: city } }] },
        URL:        { url: realUrl }
    };

    await updateNotion(pageId, properties, image || null);
})();