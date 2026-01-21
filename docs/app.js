function sslClass(state) {
  if (state === "action") return "red";
  if (state === "renewal") return "yellow";
  return "green";
}

function sslLabel(site) {
  if (site.sslState === "renewal") return "Renewal in progress";
  if (site.sslState === "action") return "Action required";
  return "OK";
}

function barWidth(days) {
  if (!days) return 100;
  return Math.min((days / 365) * 100, 100);
}

async function load() {
  const meta = document.getElementById("meta");
  const list = document.getElementById("list");

  const res = await fetch("./status.json", { cache: "no-store" });
  const data = await res.json();

  meta.textContent = `Last updated: ${data.generatedAt}`;
  list.innerHTML = "";

  data.sites.forEach(s => {
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <div class="row">
        <div class="url">${s.url}</div>
        <div class="badge ${sslClass(s.sslState)}">${sslLabel(s)}</div>
      </div>

      <div class="grid">
        <div>DNS: <span class="${s.dnsOk ? "ok" : "bad"}">${s.dnsOk ? "OK" : "FAIL"}</span></div>
        <div>HTTP: <span class="${s.httpOk ? "ok" : "bad"}">${s.httpStatus ?? "—"}</span></div>
        <div>Page: <span class="${s.pageOk ? "ok" : "bad"}">${s.pageOk ? "OK" : "ERR"}</span></div>
      </div>

      <div class="barwrap">
        <div class="barbg">
          <div class="bar ${sslClass(s.sslState)}" style="width:${barWidth(s.sslDaysLeft)}%"></div>
        </div>
        <div class="small">
          SSL days left: <strong>${s.sslDaysLeft ?? "—"}</strong>
          &nbsp;|&nbsp; Issuer: ${s.sslIssuer ?? "—"}
        </div>
      </div>
    `;

    list.appendChild(card);
  });
}

load();
setInterval(load, 60000);
