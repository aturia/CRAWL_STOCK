import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const rootDir = path.resolve(process.cwd());
const screenshotsDir = path.join(rootDir, "screenshots");
const supportedExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

const getMimeType = (fileName) => {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
};

const getWebhookUrl = () => {
  const rawValue = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!rawValue) {
    return "";
  }

  const normalizedValue = rawValue.replace(/^['"]|['"]$/g, "");

  let parsedUrl;
  try {
    parsedUrl = new URL(normalizedValue);
  } catch {
    throw new Error("DISCORD_WEBHOOK_URL khong phai la URL hop le.");
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "discord.com" ||
    !/^\/api(\/v\d+)?\/webhooks\/[^/]+\/[^/]+/.test(parsedUrl.pathname)
  ) {
    throw new Error(
      "DISCORD_WEBHOOK_URL phai la webhook execute URL dang https://discord.com/api/webhooks/..."
    );
  }

  parsedUrl.searchParams.set("wait", "true");
  return parsedUrl.toString();
};

const getImageFiles = () =>
  readdirSync(screenshotsDir)
    .filter((file) => supportedExtensions.has(path.extname(file).toLowerCase()))
    .sort((left, right) => left.localeCompare(right));

const sendImage = async (webhookUrl, fileName) => {
  const filePath = path.join(screenshotsDir, fileName);
  const fileBuffer = readFileSync(filePath);
  const form = new FormData();

  form.append(
    "files[0]",
    new Blob([fileBuffer], { type: getMimeType(fileName) }),
    fileName
  );
  form.append(
    "payload_json",
    JSON.stringify({
      content: `Da gui screenshot: ${fileName}`,
    })
  );

  const response = await fetch(webhookUrl, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
  }
};

const sendImages = async () => {
  const webhookUrl = getWebhookUrl();

  if (!webhookUrl) {
    throw new Error("Khong tim thay bien moi truong DISCORD_WEBHOOK_URL.");
  }

  if (!existsSync(screenshotsDir)) {
    console.log("Thu muc screenshots khong ton tai.");
    return;
  }

  const imageFiles = getImageFiles();
  if (imageFiles.length === 0) {
    console.log("Khong co anh nao de gui.");
    return;
  }

  console.log(`Tim thay ${imageFiles.length} anh. Dang gui len Discord...`);

  for (const fileName of imageFiles) {
    try {
      await sendImage(webhookUrl, fileName);
      console.log(`Da gui thanh cong: ${fileName}`);
    } catch (error) {
      console.error(`Loi khi gui ${fileName}: ${error.message}`);
    }
  }
};

sendImages().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
