import { Client } from "@notionhq/client";
import leboncoinScraper from "./scrapers/leboncoin.js";
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
    "bienici.com": defaultScraper,
};

async function run(url, pageId) {
    if (url.startsWith("https://www.notion.so/")) {
        url = url.replace("https://www.notion.so/", "");
    }
    console.log(`🔍 Scraping de : ${url}`);

    const domain = (new URL(url)).hostname.replace(/^www\./, "");
    const scraper = scrapers[domain] || defaultScraper;
    console.log(`🛠️ Utilisation du scraper pour le domaine : ${domain}`);

    const { title, description, image, city, price, pricePerM2, surfaceHouse, surfaceLand } = await scraper(url);

    if (!notion || !DATABASE_ID) {
        console.error("❌ Les variables d'environnement NOTION_TOKEN ou NOTION_DB_ID ne sont pas définies. Impossible d'ajouter la carte à Notion.");
        return;
    }

    try {
        const properties = {
            "Avancement": { status: { name: "Annonce" } },
            "Scrapping": { select: { name: "🟢 Scrappé" } },
            "Prix": { rich_text: [{ text: { content: price } }] },
            "Prix/m2": { rich_text: [{ text: { content: pricePerM2 } }] },
            "Surface maison": { rich_text: [{ text: { content: surfaceHouse } }] },
            "Surface terrain": { rich_text: [{ text: { content: surfaceLand } }] },
            "Ville": { rich_text: [{ text: { content: city } }] },
            "URL": { url },
        };

        if (pageId) {
            console.log(`✏️ Mise à jour de la page existante : ${pageId}`);
            await notion.pages.update({
                page_id: pageId,
                properties
            });
            console.log("✅ Page mise à jour dans Notion !");
        } else {
            console.log("➕ Création d’une nouvelle page dans Notion...");
            await notion.pages.create({
                parent: { database_id: DATABASE_ID },
                properties,
                ...(image && {
                    cover: { external: { url: image } },
                }),
            });
            console.log("✅ Nouvelle page créée dans Notion !");
        }
    } catch (error) {
        console.error("Erreur lors de la création/mise à jour de la page Notion :", error);
    }
}

function mapNotionUrlToRealUrl(notionUrl) {
    let url = notionUrl.trim();
    if (url.startsWith("https://www.notion.so/")) {
        url = url.replace("https://www.notion.so/", "");
    }

    const lastDashIndex = url.lastIndexOf("-");
    if (lastDashIndex === -1) return url;

    const base = url.substring(0, lastDashIndex);
    if (base.startsWith("https-www-leboncoin-fr-")) {
        let path = base.replace("https-www-leboncoin-fr-", "");

        const adIdMatch = path.match(/(\d{10})/);
        if (!adIdMatch) {
            console.warn("Aucun ID d'annonce trouvé dans l'URL Notion");
            return null;
        }

        const adId = adIdMatch[0];
        return `https://www.leboncoin.fr/ad/ventes_immobilieres/${adId}`;
    }
    return base.replace(/-/g, "/");
}

(async () => {
    const rawUrl = process.argv[2];
    const pageId = process.argv[3];
    if (!rawUrl || !pageId) {
        console.error("❌ Erreur : URL et pageId sont requis.");
        console.error("   Usage: node src/main.js <url> <pageId>");
        process.exit(1);
    }
    const url = mapNotionUrlToRealUrl(rawUrl);
    console.log(`Scraper l'URL : ${url}`);
    console.log(`Mettre à jour la page Notion : ${pageId}`);
    await run(url, pageId);
})();