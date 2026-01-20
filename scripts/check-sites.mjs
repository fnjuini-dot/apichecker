import fs from "fs";
import dns from "dns/promises";
import tls from "tls";
import https from "https";
import { URL } from "url";

const SITES = [
  "https://www.kearney.com/",
  "https://www.de.kearney.com/",
  "https://www.es.kearney.com/",
  "https://www.jp.kearney.com/",
  "https://www.kearney.cn/",
  "https://www.kearney.co.kr/",
  "https://www.middle-east.kearney.com/",
  "https://www.prokura.com/",
  "https://www.jp.prokura.com/",
  "https://www.de.prokura.com/"
];

const OUT_FILE = "docs/status.json";
const TIMEOUT_MS = 12000;

function nowIso() {
  return new Date().toISOString();
}

function daysUntil(date) {
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}

function fetchPage(urlStr) {
  return new Promise((resolve) => {
    const req = https.request(
      urlStr,
      {
        method: "GET",
        timeout: TIMEOUT_MS,
        headers: { "User-Agent": "site-status-bot/1.0" }
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          if (body.length < 200000) body += c;
        });
        res.on("end", () => {
          resolve({ ok: true, status: res.statusCode, body });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: null, body: "" });
    });

    req.on("error", () => resolve({ ok: false, status: null, body: "" }));
    req.end();
  });
}

function getTlsCert(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        timeout: TIMEOUT_MS
      },
      () => {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || !cert.valid_to) {
          resolve({ ok: true, expiresAt: null });
          return;
        }

        resolve({
          ok: true,
          expiresAt: new Date(cert.valid_to)
        });
      }
    );

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, expiresAt: null });
    });

    socket.on("error", () => resolve({ ok: false, expiresAt: null }));
  });
}

function pageLooksOk(status, body) {
  if (!status || status >= 400) return false;
  const text = body.toLowerCase();
  const bad = [
    "application error",
    "bad gateway",
    "service unavailable",
    "gateway timeout",
    "error 500",
    "error 502",
    "error 503",
    "error 504"
  ];
  return !bad.some((s) => text.includes(s));
}

async function checkOne(siteUrl) {
  const u = new URL(siteUrl);
  const host = u.hostname;

  let dnsOk = true;
  try {
    await dns.lookup(host);
  } catch {
    dnsOk = false;
  }

  const tlsRes = await getTlsCert(host);
  const sslExpiresAt = tlsRes.expiresAt;

  const httpRes = await fetchPage(siteUrl);
  const pageOk = pageLooksOk(httpRes.status, httpRes.body);

  return {
    url: siteUrl,
    checkedAt: nowIso(),
    dnsOk,
    tlsOk: tlsRes.ok,
    httpOk: httpRes.ok && httpRes.status < 400,
    httpStatus: httpRes.status,
    pageOk,
    sslExpiresAt: sslExpiresAt ? sslExpiresAt.toISOString() : null,
    sslDaysLeft: sslExpiresAt ? daysUntil(sslExpiresAt) : null
  };
}

async function main() {
  const results = [];
  for (const site of SITES) {
    results.push(await checkOne(site));
  }

  const payload = {
    generatedAt: nowIso(),
    sites: results
  };

  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
