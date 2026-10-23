const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");

const keywords = ["plc", "تابلوبرق", "کوره"];

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = {};

  try {
    for (const keyword of keywords) {
      console.log(`Searching: ${keyword}`);

      try {
        await page.goto(
          `https://divar.ir/s/fashapuyeh/jobs?q=${encodeURIComponent(keyword)}`,
          { waitUntil: "domcontentloaded", timeout: 60000 }
        );

        const container = page.locator("#post-list-container-id");
        await container.waitFor({
          state: "attached",
          timeout: 30000,
        });

        const listings = container
          .locator(":scope > div").first()
          .locator(":scope > div").first()
          .locator(":scope > div").first()
          .locator(":scope > div").first()
          .locator("a");

        await listings.first().waitFor({
          state: "attached",
          timeout: 60000,
        });

        const links = await listings.evaluateAll(anchors => {
          const seen = new Set();

          return anchors.flatMap(anchor => {
            const rawHref = anchor.getAttribute("href");
            if (!rawHref) return [];

            const url = new URL(rawHref, "https://divar.ir");

            if (
              !["http:", "https:"].includes(url.protocol) ||
              seen.has(url.href)
            ) {
              return [];
            }

            seen.add(url.href);

            return [{
              title:
                anchor.querySelector("h2, h3")?.textContent.trim() ||
                anchor.textContent.replace(/\s+/g, " ").trim() ||
                "مشاهده",
              text: anchor.textContent.replace(/\s+/g, " ").trim(),
              href: url.href,
              html: anchor.outerHTML,
            }];
          });
        });

        results[keyword] = { links };
        console.log(`Found ${links.length} links.`);
      } catch (error) {
        results[keyword] = {
          error: error.message,
          links: [],
        };

        console.error(`Failed: ${keyword}: ${error.message}`);
      }

      await page.waitForTimeout(1500);
    }
  } finally {
    await browser.close();
  }

  const sections = Object.entries(results)
    .map(([keyword, result]) => `
      <section>
        <h2>
          ${escapeHtml(keyword)}
          <small>(${result.links.length})</small>
        </h2>

        ${result.error
          ? `<p class="notice" dir="auto">${escapeHtml(result.error)}</p>`
          : ""}

        <div class="cards">
          ${result.links.map(link => `
            <a
              class="card"
              href="${escapeHtml(link.href)}"
              target="_blank"
              rel="noopener noreferrer"
            >
              <h3>${escapeHtml(link.title)}</h3>
              ${link.text !== link.title
                ? `<p>${escapeHtml(link.text)}</p>`
                : ""}
              <span class="view">مشاهده در دیوار ↗</span>
            </a>
          `).join("\n")}
        </div>
      </section>
    `)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>نتایج جستجوی دیوار</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Tahoma, Arial, sans-serif;
      background: #f5f5f5;
      color: #222;
      max-width: 1100px;
      margin: 40px auto;
      padding: 0 20px;
    }
    section { margin-bottom: 36px; }
    small, .timestamp { color: #777; }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
      gap: 14px;
    }
    .card {
      display: block;
      padding: 20px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 12px;
      color: inherit;
      text-decoration: none;
      line-height: 1.9;
      overflow-wrap: anywhere;
    }
    .card:hover { border-color: #a62626; }
    .card h3 { margin: 0 0 12px; font-size: 17px; }
    .card p { color: #666; font-size: 14px; }
    .view { color: #a62626; font-size: 13px; }
    .notice {
      color: #a62626;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  </style>
</head>
<body>
  <h1>نتایج جستجوی دیوار</h1>
  <p class="timestamp">${escapeHtml(new Date().toLocaleString("fa-IR"))}</p>
  ${sections}
</body>
</html>`;

  await fs.writeFile(
    "results.json",
    JSON.stringify(results, null, 2),
    "utf8"
  );

  await fs.writeFile("results.html", html, "utf8");

  console.log(`HTML saved: ${path.resolve("results.html")}`);
  console.log(`JSON saved: ${path.resolve("results.json")}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
