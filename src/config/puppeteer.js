import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export async function getBrowser() {
  if (process.env.RENDER === "true") {
    return puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      executablePath: await chromium.executablePath(),
      defaultViewport: chromium.defaultViewport,
      headless: chromium.headless,
    });
  }

  const fullPuppeteer = (await import("puppeteer")).default;
  return fullPuppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}
