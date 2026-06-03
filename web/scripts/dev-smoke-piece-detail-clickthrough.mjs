import { chromium } from "playwright";

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const webUrl = getArg("--web-url");
const pieceId = getArg("--piece-id");
const sessionCookie = getArg("--session-cookie");

if (!webUrl || !pieceId || !sessionCookie) {
  console.error(
    "usage: node web/scripts/dev-smoke-piece-detail-clickthrough.mjs --web-url <url> --piece-id <id> --session-cookie <cookie>",
  );
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });

try {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "sessionid", value: sessionCookie, url: webUrl },
  ]);

  const page = await context.newPage();
  await page.goto(webUrl, { waitUntil: "networkidle" });
  await page.locator(`a[href="/pieces/${pieceId}"]`).first().click();
  await page.waitForURL(new RegExp(`/pieces/${pieceId}(?:/|$)`));
  await page.getByTestId("piece-title").waitFor();

  const title = await page.getByTestId("piece-title").textContent();
  console.log(`piece detail loaded: ${title ?? ""}`);
} finally {
  await browser.close();
}
