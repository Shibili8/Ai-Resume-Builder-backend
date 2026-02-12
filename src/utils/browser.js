export async function getBrowser() {
  const isProduction = process.env.NODE_ENV === "production";

  // 🟢 PRODUCTION (Render / Server)
  if (isProduction) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = (await import("puppeteer-core")).default;

    const execPath = await chromium.executablePath();

    return puppeteer.launch({
      args: chromium.args,
      executablePath: execPath,
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });
  }

  // 🟢 LOCAL (Windows / Mac / Linux)
  const puppeteer = (await import("puppeteer")).default;

  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}
