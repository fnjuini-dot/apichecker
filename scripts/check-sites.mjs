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

/* Known Let's Encrypt intermediates */
const LE_INTERMEDIATES = ["E7", "R3", "R10", "R11"];

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
        timeout: TIMEOUT_MS,
        headers: { "User-Agent": "site-status-bot/1.0" }
      },
      (res) => {
        let body = "";
        res.on("data", c => {
          if (body.length < 200000) body += c;
        });
        res.on("end", () =>
          resolve({ ok: true, status: res.statusCode, body })
        );
      }
    );

    req.on("timeout", () => resolve({ ok: false }));
    req.on("error", () => resolve({ ok: false }));
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
        const cert = socket.getPeerCertificate(true);
        socket.end();

        console.log("---- TLS DEBUG START ----");
        console.log("HOST:", hostname);
        console.log("CERT KEYS:", Object.keys(cert || {}));
        console.log("CERT SUBJECT:", cert?.subject || null);
        console.log("CERT ISSUER:", cert?.issuer || null);
        console.log("CERT SERIAL:", cert?.serialNumber || null);
        console.log("CERT VALID TO:", cert?.valid_to || null);

        if (cert?.issuerCertificate) {
          console.log("ISSUER CERT SUBJECT:", cert.issuerCertificate.subject || null);
          console.log("ISSUER CERT ISSUER:", cert.issuerCertificate.issuer || null);
          console.log(
            "ISSUER CERT KEYS:",
            Object.keys(cert.issuerCertificate || {})
          );
        } else {
          console.log("NO issuerCertificate present");
        }

        console.log("---- TLS DEBUG END ----");

        const issuer =
          cert?.issuer?.O ||
          cert?.issuer?.CN ||
          cert?.issuerCertificate?.subject?.O ||
          cert?.issuerCertificate?.subject?.CN ||
          null;

        resolve({
          ok: true,
          expiresAt: cert?.valid_to ? new Date(cert.valid_to) : null,
          issuer,
          serial: cert?.serialNumber || null
        });
      }
    );

    socket.on("error", (e) => {
      console.log("TLS ERROR:", hostname, e.message);
      resolve({ ok: false, expiresAt: null, issuer: null, serial: null });
    });

    socket.on("timeout", () => {
      console.log("TLS TIMEOUT:", hostname);
      resolve({ ok: false, expiresAt: null, issuer: null, serial: null });
    });
  });
}



function pageLooksOk(status, body) {
  if (!status || status >= 400) return false;
  const bad = [
    "application error",
    "bad gateway",
    "service unavailable",
    "gateway timeout"
  ];
  return !bad.some(b => body.toLowerCase().includes(b));
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
  const httpRes = await fetchPage(siteUrl);

  return {
    url: siteUrl,
    checkedAt: nowIso(),
    dnsOk,
    tlsOk: tlsRes.ok,
    httpOk: httpRes.ok && httpRes.status < 400,
    httpStatus: httpRes.status || null,
    pageOk: pageLooksOk(httpRes.status, httpRes.body || ""),
    sslExpiresAt: tlsRes.expiresAt
      ? tlsRes.expiresAt.toISOString()
      : null,
    sslDaysLeft: tlsRes.expiresAt
      ? daysUntil(tlsRes.expiresAt)
      : null,
    sslIssuer: tlsRes.issuer,
    sslSerial: tlsRes.serial
  };
}

async function main() {
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
  } catch {}

  const results = [];

  for (const site of SITES) {
    const r = await checkOne(site);
    const prev = previous?.sites?.find(p => p.url === r.url);

    /* Default state */
    r.sslState = "ok";

    /* Renewal in progress (Let’s Encrypt rotation detected) */
    if (
      LE_INTERMEDIATES.includes(r.sslIssuer) &&
      r.sslDaysLeft !== null &&
      r.sslDaysLeft > 30 &&
      r.sslDaysLeft <= 45 &&
      prev &&
      prev.sslSerial &&
      r.sslSerial &&
      prev.sslSerial !== r.sslSerial
    ) {
      r.sslState = "renewal";
    }

    /* Real action required */
    if (r.sslDaysLeft !== null && r.sslDaysLeft <= 30) {
      r.sslState = "action";
    }

    results.push(r);
  }

  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      {
        generatedAt: nowIso(),
        sites: results
      },
      null,
      2
    )
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
