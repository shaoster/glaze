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
  const piecesLoaded = page.waitForResponse(
    (response) =>
      response.url().includes("/api/pieces/") &&
      response.request().method() === "GET" &&
      response.ok(),
    { timeout: 30000 },
  );
  await page.goto(webUrl, { waitUntil: "domcontentloaded" });
  await piecesLoaded;

  const exactLink = pieceId
    ? page.locator(`a[href="/pieces/${pieceId}"]`).first()
    : null;
  let clicked = false;
  if (exactLink) {
    try {
      await exactLink.waitFor({ state: "visible", timeout: 5000 });
      await exactLink.click();
      clicked = true;
    } catch {
      clicked = false;
    }
  }

  if (!clicked) {
    const firstLink = page.locator('a[href^="/pieces/"]').first();
    await firstLink.waitFor({ state: "visible", timeout: 30000 });
    await firstLink.click();
  }

  const detailUrl = page.waitForURL(/\/pieces\/[^/]+(?:\/|$)/);
  await detailUrl;
  await page.getByTestId("piece-title").waitFor();

  const title = await page.getByTestId("piece-title").textContent();
  console.log(`piece detail loaded: ${title ?? ""}`);
} finally {
  await browser.close();
}
