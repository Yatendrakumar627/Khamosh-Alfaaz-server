import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import mongoose from "mongoose";
import { createApp } from "../app.js";
import { connectDB } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../../");
const clientPublicDir = path.resolve(rootDir, "client/public");
const clientDistDir = path.resolve(rootDir, "client/dist");
const clientSrcDir = path.resolve(rootDir, "client/src");

describe("Search Engine Optimization (SEO) & Link Integrity Audit", () => {
  const app = createApp();

  before(async () => {
    await connectDB();
  });

  after(async () => {
    await mongoose.disconnect();
  });

  describe("1. Robots.txt Validation & Crawl Directives", () => {
    test("robots.txt exists in public and build dist with valid directives", () => {
      const robotsPath = path.join(clientPublicDir, "robots.txt");
      assert.ok(fs.existsSync(robotsPath), "robots.txt must exist in client/public");

      const content = fs.readFileSync(robotsPath, "utf-8");
      assert.match(content, /User-agent:\s*\*/i);
      assert.match(content, /Allow:\s*\//i);
      assert.match(content, /Disallow:\s*\/dashboard/i);
      assert.match(content, /Disallow:\s*\/entries/i);
      assert.match(content, /Disallow:\s*\/settings/i);
      assert.match(content, /Disallow:\s*\/api\//i);
      assert.match(content, /Sitemap:\s*https:\/\/khamosh-alfaaz-client\.vercel\.app\/sitemap\.xml/i);
    });

    test("robots.txt was deployed to production dist directory", () => {
      const distRobots = path.join(clientDistDir, "robots.txt");
      assert.ok(fs.existsSync(distRobots), "robots.txt must be copied to dist on build");
    });
  });

  describe("2. XML Sitemap Syntax & Structure", () => {
    let sitemapContent;

    before(() => {
      const sitemapPath = path.join(clientPublicDir, "sitemap.xml");
      assert.ok(fs.existsSync(sitemapPath), "sitemap.xml must exist in client/public");
      sitemapContent = fs.readFileSync(sitemapPath, "utf-8");
    });

    test("sitemap.xml has valid XML declaration and schema namespace", () => {
      assert.match(sitemapContent, /<\?xml\s+version="1\.0"\s+encoding="UTF-8"\?>/i);
      assert.match(sitemapContent, /<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/i);
      assert.match(sitemapContent, /<\/urlset>/i);
    });

    test("sitemap.xml includes all critical public canonical routes", () => {
      const expectedPaths = [
        "https://khamosh-alfaaz-client.vercel.app/",
        "https://khamosh-alfaaz-client.vercel.app/explore",
        "https://khamosh-alfaaz-client.vercel.app/explore/quotes",
        "https://khamosh-alfaaz-client.vercel.app/explore/categories",
        "https://khamosh-alfaaz-client.vercel.app/about",
        "https://khamosh-alfaaz-client.vercel.app/login",
      ];

      for (const loc of expectedPaths) {
        assert.ok(
          sitemapContent.includes(`<loc>${loc}</loc>`),
          `sitemap.xml must include canonical route: ${loc}`
        );
      }
    });

    test("all sitemap entries contain lastmod, changefreq, and valid priority", () => {
      const locCount = (sitemapContent.match(/<loc>/g) || []).length;
      const lastmodCount = (sitemapContent.match(/<lastmod>/g) || []).length;
      const changefreqCount = (sitemapContent.match(/<changefreq>/g) || []).length;
      const priorityCount = (sitemapContent.match(/<priority>/g) || []).length;

      assert.equal(locCount, 6, "Expected 6 canonical public URLs");
      assert.equal(lastmodCount, locCount, "Each URL must have a lastmod timestamp");
      assert.equal(changefreqCount, locCount, "Each URL must have a changefreq");
      assert.equal(priorityCount, locCount, "Each URL must have a priority");
    });
  });

  describe("3. HTML Document Head, Meta Tags & Schema.org JSON-LD", () => {
    let indexHtml;

    before(() => {
      const indexPath = path.join(clientSrcDir, "../index.html");
      indexHtml = fs.readFileSync(indexPath, "utf-8");
    });

    test("Document specifies language and viewport attributes", () => {
      assert.match(indexHtml, /<html\s+lang="en"/i);
      assert.match(indexHtml, /<meta\s+name="viewport"/i);
      assert.match(indexHtml, /<meta\s+charset="UTF-8"/i);
    });

    test("Title and meta description are descriptive and within optimal character limits", () => {
      const titleMatch = indexHtml.match(/<title>([^<]+)<\/title>/i);
      assert.ok(titleMatch, "Title tag must exist");
      const title = titleMatch[1].trim();
      assert.ok(title.length >= 10 && title.length <= 70, `Title length (${title.length}) should be 10-70 chars`);

      const descMatch = indexHtml.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
      assert.ok(descMatch, "Meta description must exist");
      const desc = descMatch[1].trim();
      assert.ok(desc.length >= 50 && desc.length <= 170, `Description length (${desc.length}) should be 50-170 chars`);
    });

    test("Canonical URL is defined and points to production HTTPS domain", () => {
      assert.match(indexHtml, /<link\s+rel="canonical"\s+href="https:\/\/khamosh-alfaaz-client\.vercel\.app\/"/i);
    });

    test("Open Graph (Facebook/LinkedIn) social meta tags are present", () => {
      assert.match(indexHtml, /<meta\s+property="og:type"\s+content="website"/i);
      assert.match(indexHtml, /<meta\s+property="og:url"\s+content="https:\/\/khamosh-alfaaz-client\.vercel\.app\/"/i);
      assert.match(indexHtml, /<meta\s+property="og:site_name"\s+content="Khamosh Alfaaz"/i);
      assert.match(indexHtml, /<meta\s+property="og:title"/i);
      assert.match(indexHtml, /<meta\s+property="og:description"/i);
      assert.match(indexHtml, /<meta\s+property="og:image"/i);
    });

    test("Twitter Card meta tags are present", () => {
      assert.match(indexHtml, /<meta\s+name="twitter:card"\s+content="summary_large_image"/i);
      assert.match(indexHtml, /<meta\s+name="twitter:title"/i);
      assert.match(indexHtml, /<meta\s+name="twitter:description"/i);
      assert.match(indexHtml, /<meta\s+name="twitter:image"/i);
    });

    test("Valid Schema.org JSON-LD structured data is embedded", () => {
      const jsonLdMatch = indexHtml.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i);
      assert.ok(jsonLdMatch, "JSON-LD script block must exist");

      const parsed = JSON.parse(jsonLdMatch[1]);
      assert.equal(parsed["@context"], "https://schema.org");
      assert.ok(Array.isArray(parsed["@graph"]), "Expected @graph array");
      const types = parsed["@graph"].map((item) => item["@type"]);
      assert.ok(types.includes("WebSite"));
      assert.ok(types.includes("WebApplication"));
    });
  });

  describe("4. Link Integrity & Route Resolution (Zero Broken Links)", () => {
    test("All canonical sitemap paths exist as defined routes in client App.jsx", () => {
      const appJsx = fs.readFileSync(path.join(clientSrcDir, "App.jsx"), "utf-8");

      const routesToCheck = ["/", "/explore", "/explore/quotes", "/explore/categories", "/about", "/login"];
      for (const r of routesToCheck) {
        if (r === "/") {
          assert.match(appJsx, /path="\/"/);
        } else {
          const routePattern = new RegExp(`path="${r}"`);
          assert.match(appJsx, routePattern, `Route ${r} must be defined in App.jsx`);
        }
      }
    });

    test("VisitorBottomNavigation does not contain broken /quotes link", () => {
      const navJsx = fs.readFileSync(path.join(clientSrcDir, "components/visitor/VisitorBottomNavigation.jsx"), "utf-8");
      assert.ok(!navJsx.includes("path: '/quotes'"), "VisitorBottomNavigation must not point to dead /quotes");
      assert.ok(navJsx.includes("path: '/explore/quotes'"), "VisitorBottomNavigation must link to /explore/quotes");
    });

    test("VisitorFooter links resolve cleanly to active routes", () => {
      const footerJsx = fs.readFileSync(path.join(clientSrcDir, "components/visitor/VisitorFooter.jsx"), "utf-8");
      const linkMatches = [...footerJsx.matchAll(/to="([^"]+)"/g)].map((m) => m[1]);
      const validRoutes = ["/", "/explore", "/explore/quotes", "/explore/categories", "/about", "/login"];

      for (const link of linkMatches) {
        assert.ok(
          validRoutes.includes(link),
          `VisitorFooter contains unrecognized link destination: ${link}`
        );
      }
    });

    test("Catch-all 404 route is configured in App.jsx to render dedicated NotFound component", () => {
      const appJsx = fs.readFileSync(path.join(clientSrcDir, "App.jsx"), "utf-8");
      assert.match(appJsx, /import\s+{\s*NotFound\s*}\s+from\s+'\.\/pages\/NotFound'/);
      assert.match(appJsx, /<Route\s+path="\*"\s+element={<NotFound\s*\/>}\s*\/>/);
    });
  });

  describe("5. Backend Crawler APIs & Public Endpoint Health", () => {
    test("GET /api/public/entries responds cleanly without authentication (200 OK)", async () => {
      const res = await request(app).get("/api/public/entries");
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(Array.isArray(res.body.entries));
      assert.ok(res.body.pagination);
    });

    test("GET /api/public/quotes responds cleanly (200 OK)", async () => {
      const res = await request(app).get("/api/public/quotes");
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(Array.isArray(res.body.entries));
    });

    test("GET /api/public/categories responds cleanly (200 OK)", async () => {
      const res = await request(app).get("/api/public/categories");
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      assert.ok(Array.isArray(res.body.categories));
    });
  });
});
