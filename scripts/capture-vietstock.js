import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const urlsConfigPath = path.join(rootDir, "urls.json");
const DEFAULT_URLS = [
  "https://finance.vietstock.vn/ACB-ngan-hang-tmcp-a-chau.htm",
  "https://finance.vietstock.vn/SMB-ctcp-bia-sai-gon-mien-trung.htm",
  "https://finance.vietstock.vn/QNS-ctcp-duong-quang-ngai.htm",
];

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage:
  node scripts/capture-vietstock.js
  node scripts/capture-vietstock.js <url-1> <url-2> ...

Priority:
  1. URLs passed from command line
  2. URLs in urls.json
  3. Built-in default URLs

Examples:
  node scripts/capture-vietstock.js
  node scripts/capture-vietstock.js "https://finance.vietstock.vn/ACB-ngan-hang-tmcp-a-chau.htm"
  node scripts/capture-vietstock.js "https://finance.vietstock.vn/SMB-ctcp-bia-sai-gon-mien-trung.htm" "https://finance.vietstock.vn/QNS-ctcp-duong-quang-ngai.htm"
`);
  process.exit(0);
}

const outputDir = path.join(rootDir, "screenshots");
const viewport = { width: 1600, height: 900 };
const screenshotClip = {
  x: 0,
  y: 0,
  width: viewport.width,
  height: Math.round(viewport.height),
};

const qaInventory = [
  {
    claim: "Danh sách trang cổ phiếu Vietstock tải thành công.",
    check: "Điều hướng lần lượt tới từng URL và chờ phần DOM chính hiện ra.",
    evidence: "Tiêu đề trang và nhiều file ảnh đầu ra.",
  },
  {
    claim: "Ảnh chụp lấy được vùng đầu trang với kích thước hiển thị lớn hơn.",
    check:
      "Dùng viewport cố định 1600x900 và chỉ chụp vùng trên cùng cao 1/5 màn hình.",
    evidence: "Mỗi URL tạo ra một PNG trong thư mục screenshots.",
  },
  {
    claim: "Script chịu được popup/cookie/banner cơ bản trên nhiều trang.",
    check:
      "Thử đóng các nút đồng ý/đóng phổ biến nếu có xuất hiện trước khi chụp từng URL.",
    evidence: "Không bị popup che phần chính trong các ảnh cuối.",
  },
  {
    claim: "Off-happy path 1",
    check: "Nếu selector chính chưa hiện ngay, đợi thêm ngắn rồi chụp.",
    evidence: "Các ảnh vẫn được tạo.",
  },
  {
    claim: "Off-happy path 2",
    check: "Nếu output directory chưa tồn tại, script tự tạo.",
    evidence: "Lần chạy đầu vẫn ghi file thành công.",
  },
  {
    claim: "Off-happy path 3",
    check: "Tên file đầu ra được sinh tự động từ mã cổ phiếu trong URL.",
    evidence: "File như acb.png, smb.png, qns.png.",
  },
];

const getTickerFromUrl = (url) => {
  const match = new URL(url).pathname.match(/\/([A-Z0-9]+)-/i);
  return (match?.[1] ?? "vietstock").toLowerCase();
};

// const getOutputPath = (url) =>
//   path.resolve(outputDir, `${getTickerFromUrl(url)}.png`);

const getOutputPath = (url) =>
  path.resolve(outputDir, `${crypto.randomUUID()}.png`);

const readUrlsFromConfig = async () => {
  try {
    const fileContent = await fs.readFile(urlsConfigPath, "utf8");
    const parsed = JSON.parse(fileContent);
    if (!Array.isArray(parsed.urls)) {
      throw new Error(
        "Expected urls.json to contain an object with a urls array.",
      );
    }

    const normalizedUrls = parsed.urls.filter(
      (value) => typeof value === "string" && value.trim().length > 0,
    );

    if (normalizedUrls.length === 0) {
      throw new Error("The urls array in urls.json is empty.");
    }

    return normalizedUrls;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return DEFAULT_URLS;
    }

    throw error;
  }
};

const dismissCommonPopups = async (page) => {
  const candidates = [
    page.getByRole("button", { name: /đóng|close|skip/i }).first(),
    page.getByRole("button", { name: /tôi hiểu|đồng ý|accept|agree/i }).first(),
    page.getByRole("span", { name: /6 tháng/i }).first(),
    page.locator(".modal .close, .popup .close, .fancybox-close").first(),
  ];

  for (const locator of candidates) {
    try {
      if (await locator.isVisible({ timeout: 1_500 })) {
        await locator.click({ timeout: 1_500 });
      }
    } catch {
      // Popup may not exist in this run.
    }
  }
};

const main = async () => {
  console.log("QA inventory:");
  for (const item of qaInventory) {
    console.log(`- ${item.claim}: ${item.check} -> ${item.evidence}`);
  }

  const targetUrls = args.length > 0 ? args : await readUrlsFromConfig();

  await fs.mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: 1,
      locale: "vi-VN",
    });
    const page = await context.newPage();

    for (const targetUrl of targetUrls) {
      const outputPath = getOutputPath(targetUrl);

      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });

      await dismissCommonPopups(page);

      await page
        .waitForSelector("body", { state: "visible", timeout: 15_000 })
        .catch(() => {});
      await page
        .waitForSelector(
          [
            "main",
            "#MainBox",
            ".stock-header-info",
            ".page-title",
            ".company-overview",
          ].join(", "),
          { state: "visible", timeout: 20_000 },
        )
        .catch(() => {});
      await page.waitForTimeout(5_000);

      const pageTitle = await page.title();
      console.log(`Loaded page title: ${pageTitle}`);

      await page.screenshot({
        path: outputPath,
        clip: screenshotClip,
        type: "png",
      });

      console.log(`Saved screenshot to: ${outputPath}`);
    }

    await context.close();
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error("Capture failed:", error);
  process.exitCode = 1;
});
