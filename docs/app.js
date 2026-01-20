function sslClass(daysLeft) {
  if (daysLeft === null) return "red";
  if (daysLeft <= 30) return "red";
  if (daysLeft <= 90) return "yellow";
  return "green";
}

function barWidth(daysLeft) {
  if (daysLeft === null) return 100;
  const pct = Math.min((daysLeft / 365) * 100, 100);
  return Math.max(pct, 2);
}

async function load() {
  const meta = document.getElementById("meta");
  const list = document.getElementById("list");

  const res = await fetch("./status.json", { cache: "no-store" });
  const data = await res.json();

  meta.textContent = `Last updated: ${data.generatedAt}`;
  list.innerHTML = "";

  for (const s of data.sites) {
    const overallOk = s.dnsOk && s.tlsOk && s.httpOk && s.pageOk;
    const badgeClass = overallOk ? "ok" : "bad";
    const badgeText = overallOk ? "OK" : "ISSUE";

    const sslDays = s.sslDaysLeft;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row">
        <div class="url">${s.url}</div>
        <div class="badge ${badgeClass}">${badgeText}</div>
      </div>

      <div class="grid">
        <div class="kv">DNS: <span class="${s.dnsOk ? "ok" : "bad"}">${s.dnsOk ? "OK" : "FAIL"}</span></div>
        <div class="kv">TLS: <span class="${s.tlsOk ? "ok" : "bad"}">${s.tlsOk ? "OK" : "FAIL"}</span></div>
        <div class="kv">HTTP: <span class="${s.httpOk ? "ok" : "bad"}">${s.httpStatus}</span></div>
      </div>

      <div class="barwrap">
        <div class="barbg">
          <div class="bar ${sslClass(sslDays)}" style="width:${barWidth(sslDays)}%"></div>
        </div>
        <div class="small">
          SSL days left: <strong>${sslDays}</strong>
        </div>
      </div>
    `;
    list.appendChild(card);
  }
}

load();
setInterval(load, 60000);
