import { Client } from "@notionhq/client";
import puppeteer from "puppeteer";
import * as cheerio from "cheerio";

const batch = process.env.BATCH ? JSON.parse(process.env.BATCH) : [];

const notion = process.env.NOTION_TOKEN && process.env.NOTION_DB_ID ? new Client({ auth: process.env.NOTION_TOKEN }) : null;
const DATABASE_ID = process.env.NOTION_DB_ID;

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

        // Scraping spécifique Leboncoin
        if (site === "leboncoin") {
            // Placeholders pour les sélecteurs CSS Leboncoin
            price = $('.Price__value').first().text().trim() || "";
            surfaceHouse = $('.Property__surface').first().text().trim() || "";
            city = $('.Property__city').first().text().trim() || city;
            // Les sélecteurs ci-dessus sont des exemples à adapter selon la structure réelle du site
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

const scrapers = {
    "leboncoin.fr": (url) => defaultScraper(url, "leboncoin"),
    "propietes-privees.com": defaultScraper,
    "immobilier.lefigaro.fr": defaultScraper,
    "immobilier.notaires.fr": defaultScraper,
    "seloger.com": defaultScraper,
    "paruvendu.fr": defaultScraper,
    "guy-hoquet.com": defaultScraper,
    "bienici.com": defaultScraper,
};

async function run(url, pageId) {
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

async function runAll(batch) {
    for (const item of batch) {
        await run(item.url, item.pageId);
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
}

if (batch.length === 0) {
    console.error("❌ Aucun batch fourni ou batch vide.");
    process.exit(1);
} else {
    runAll(batch).catch(error => {
        console.error("Erreur inattendue :", error);
    });
}