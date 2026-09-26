// Follow the Bill — frontend (Person C)
// Two pages share this file: the bill list ("/") and a single bill ("/bill/<session>/<code>").

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- Page 1: bill list ----------
function initBillList() {
  const gazette = document.getElementById("gazette");
  const filtersEl = document.getElementById("filters");
  const status = document.getElementById("status");
  const search = document.getElementById("search");
  if (!gazette) return; // not this page

  let allBills = [];
  let activeFilter = "All";

  function metaLine(b) {
    // Once Person A's list_bills() adds `introduced`, prefer showing that date;
    // fall back to session + status for now.
    if (b.introduced) {
      const d = new Date(b.introduced);
      const dateStr = isNaN(d) ? b.introduced : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      return `${dateStr} \u00b7 ${escapeHtml(b.status_en)}`;
    }
    return `${escapeHtml(b.session)} \u00b7 ${escapeHtml(b.status_en)}`;
  }

  function renderFilters() {
    const statuses = ["All", ...new Set(allBills.map((b) => b.status_en))];
    filtersEl.innerHTML = statuses.map((s) => `
      <button type="button" class="filter-pill${s === activeFilter ? " is-active" : ""}" data-status="${escapeHtml(s)}">
        ${escapeHtml(s)}
      </button>
    `).join("");
    filtersEl.hidden = statuses.length <= 1;
    filtersEl.querySelectorAll(".filter-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeFilter = btn.dataset.status;
        renderFilters();
        render(applyFilters());
      });
    });
  }

  function applyFilters() {
    const q = search.value.trim().toLowerCase();
    return allBills.filter((b) => {
      const matchesQ = !q || b.code.toLowerCase().includes(q) || b.title_en.toLowerCase().includes(q);
      const matchesStatus = activeFilter === "All" || b.status_en === activeFilter;
      return matchesQ && matchesStatus;
    });
  }

  function render(bills) {
    if (bills.length === 0) {
      gazette.innerHTML = '<li class="gazette-empty">No bills match your search.</li>';
      gazette.hidden = false;
      return;
    }
    gazette.innerHTML = bills.map((b) => `
      <li class="gazette-item">
        <a href="/bill/${encodeURIComponent(b.session)}/${encodeURIComponent(b.code)}">
          <span class="gazette-code">${escapeHtml(b.code)}</span>
          <span>
            <span class="gazette-title">${escapeHtml(b.title_en)}</span>
            <div class="gazette-meta">${metaLine(b)}</div>
          </span>
        </a>
      </li>
    `).join("");
    gazette.hidden = false;
  }

  fetch("/api/bills")
    .then((resp) => {
      if (!resp.ok) throw new Error("Request failed");
      return resp.json();
    })
    .then((bills) => {
      allBills = bills;
      status.hidden = true;
      renderFilters();
      render(applyFilters());
    })
    .catch(() => {
      status.textContent = "Couldn't load bills right now. Try refreshing the page.";
    });

  search.addEventListener("input", () => render(applyFilters()));
}

// ---------- Page 2: single bill ----------
function initBillPage() {
  const article = document.getElementById("bill-article");
  if (!article) return; // not this page

  const session = document.body.dataset.session;
  const code = document.body.dataset.code;
  const status = document.getElementById("status");

  let currentLang = "en";
  let currentBill = null; // last summary response, for reuse in the letter step
  let currentMp = null;

  function loadSummary(lang) {
    return fetch(`/api/bills/${encodeURIComponent(session)}/${encodeURIComponent(code)}/summary?lang=${lang}`)
      .then((resp) => {
        if (!resp.ok) throw new Error("Request failed");
        return resp.json();
      });
  }

  function renderBill(data) {
    currentBill = data;
    document.getElementById("bill-code").textContent = `Bill ${code} \u2014 ${session}`;
    document.getElementById("bill-title").textContent = data.title;
    document.getElementById("bill-tldr").textContent = data.tldr;
    document.getElementById("bill-summary").textContent = data.summary;
    document.getElementById("bill-changes").innerHTML =
      data.key_changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("");
    document.getElementById("bill-source").href = data.source_url;

    document.getElementById("html-root").lang = currentLang;
    document.getElementById("lang-en").classList.toggle("is-active", currentLang === "en");
    document.getElementById("lang-en").setAttribute("aria-pressed", String(currentLang === "en"));
    document.getElementById("lang-fr").classList.toggle("is-active", currentLang === "fr");
    document.getElementById("lang-fr").setAttribute("aria-pressed", String(currentLang === "fr"));
  }

  function renderCompanies(data) {
    const list = document.getElementById("company-list");
    const impactStatus = document.getElementById("impact-status");
    const companies = (data && data.companies) || [];

    if (!companies.length) {
      list.innerHTML = "";
      impactStatus.hidden = false;
      impactStatus.textContent = "No companies or sectors were identified for this bill.";
      return;
    }
    impactStatus.hidden = true;

    list.innerHTML = companies.map((c) => {
      const m = c.market_data;
      let priceHtml = "";
      if (m && typeof m.price === "number") {
        const dir = m.change > 0 ? "up" : m.change < 0 ? "down" : "";
        const sign = m.change > 0 ? "+" : "";
        priceHtml = `<span class="company-price ${dir}">$${m.price.toFixed(2)} (${sign}${m.change_pct.toFixed(1)}%)</span>`;
      }
      const holdings = c.political_holdings || [];
      const conflictHtml = holdings.map((h) => {
        const who = h.mp_name || h.mp || h.name || "An MP";
        return `<span class="conflict-flag">\u26a0 <strong>${escapeHtml(who)}</strong> has a disclosed holding matching this company.</span>`;
      }).join("");
      return `
        <li class="company-row">
          <span class="company-name">${escapeHtml(c.company)}</span>
          ${c.ticker ? `<span class="company-ticker">${escapeHtml(c.ticker)}</span>` : ""}
          ${priceHtml}
          ${conflictHtml}
        </li>`;
    }).join("");
  }

  function loadImpact(lang) {
    const impactStatus = document.getElementById("impact-status");
    impactStatus.hidden = false;
    impactStatus.textContent = "Loading financial analytics…";
    document.getElementById("company-list").innerHTML = "";
    document.getElementById("holdings-table-wrap").hidden = true;
    document.getElementById("charts-wrap").innerHTML = "";
    document.getElementById("networth-section").hidden = true;

    fetch(`/api/bills/${encodeURIComponent(session)}/${encodeURIComponent(code)}/impact?lang=${lang}`)
      .then((resp) => {
        if (!resp.ok) throw new Error("Request failed");
        return resp.json();
      })
      .then((data) => {
        renderCompanies(data);
        renderFinancials(data.companies || []);
      })
      .catch(() => {
        // Optional/experimental feature (needs FINNHUB_API_KEY etc.) — fail without
        // taking down the rest of the page.
        impactStatus.hidden = false;
        impactStatus.textContent = "Couldn't load financial analytics for this bill right now.";
      });
  }

  function loadAndRender(lang) {
    status.hidden = false;
    status.textContent = "Loading summary\u2026 this can take up to 20 seconds.";
    article.hidden = true;
    loadSummary(lang)
      .then((data) => {
        currentLang = lang;
        renderBill(data);
        renderDescription(data);
        status.hidden = true;
        article.hidden = false;
        document.getElementById("mp-step").hidden = false;
        document.getElementById("letter-step").hidden = false;
        loadImpact(lang);
      })
      .catch(() => {
        status.textContent = "Couldn't load this bill's summary right now.";
      });
  }

  document.getElementById("lang-en").addEventListener("click", () => loadAndRender("en"));
  document.getElementById("lang-fr").addEventListener("click", () => loadAndRender("fr"));

  loadAndRender("en");

  // ---- MP finder ----
  const mpForm = document.getElementById("mp-form");
  const mpError = document.getElementById("mp-error");
  const mpCard = document.getElementById("mp-card");

  mpForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const postal = document.getElementById("postal").value.trim().toUpperCase().replace(/\s+/g, "");
    mpError.hidden = true;
    mpCard.hidden = true;

    if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(postal)) {
      mpError.textContent = "That doesn't look like a Canadian postal code, e.g. K1N6N5.";
      mpError.hidden = false;
      return;
    }

    fetch(`/api/mp?postal=${encodeURIComponent(postal)}`)
      .then((resp) => {
        if (resp.status === 404) throw new Error("not-found");
        if (!resp.ok) throw new Error("failed");
        return resp.json();
      })
      .then((mp) => {
        currentMp = mp;
        document.getElementById("mp-name").textContent = mp.name;
        document.getElementById("mp-meta").textContent = `${mp.party} \u00b7 ${mp.riding}`;
        mpCard.hidden = false;
      })
      .catch((err) => {
        mpError.textContent = err.message === "not-found"
          ? "No MP found for that postal code."
          : "Couldn't look up your MP right now.";
        mpError.hidden = false;
      });
  });

  // ---- Letter drafting ----
  const letterForm = document.getElementById("letter-form");
  const letterStatus = document.getElementById("letter-status");
  const letterOutput = document.getElementById("letter-output");

  letterForm.addEventListener("submit", (e) => {
    e.preventDefault();
    letterOutput.hidden = true;

    if (!currentMp) {
      letterStatus.hidden = false;
      letterStatus.textContent = "Find your MP above first.";
      return;
    }

    const stance = letterForm.querySelector('input[name="stance"]:checked').value;
    const note = document.getElementById("note").value.trim();
    const name = document.getElementById("name").value.trim();

    letterStatus.hidden = false;
    letterStatus.textContent = "Drafting your letter\u2026";

    fetch("/api/letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lang: currentLang,
        mp: currentMp,
        bill: { code, title: currentBill.title, tldr: currentBill.tldr },
        stance, note, name,
      }),
    })
      .then((resp) => {
        if (!resp.ok) throw new Error("Request failed");
        return resp.json();
      })
      .then((letter) => {
        letterStatus.hidden = true;
        document.getElementById("letter-subject").textContent = letter.subject;
        document.getElementById("letter-body").textContent = letter.body;
        document.getElementById("letter-mailto").href =
          `mailto:${encodeURIComponent(currentMp.email)}?subject=${encodeURIComponent(letter.subject)}&body=${encodeURIComponent(letter.body)}`;
        letterOutput.hidden = false;
      })
      .catch(() => {
        letterStatus.textContent = "Couldn't draft a letter right now. Try again in a moment.";
      });
  });

  document.getElementById("letter-copy").addEventListener("click", () => {
    const text = document.getElementById("letter-body").textContent;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById("letter-copy");
      const original = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(() => { btn.textContent = original; }, 1500);
    });
  });
}

// ---------- Description / Financial analytics tabs ----------
function initTabs() {
  const tabDescription = document.getElementById("tab-description");
  const tabFinancial = document.getElementById("tab-financial");
  const panelDescription = document.getElementById("panel-description");
  const panelFinancial = document.getElementById("panel-financial");
  if (!tabDescription) return; // not this page

  function activate(name) {
    const isDescription = name === "description";
    tabDescription.classList.toggle("is-active", isDescription);
    tabDescription.setAttribute("aria-selected", String(isDescription));
    tabFinancial.classList.toggle("is-active", !isDescription);
    tabFinancial.setAttribute("aria-selected", String(!isDescription));
    panelDescription.hidden = !isDescription;
    panelFinancial.hidden = isDescription;
  }

  tabDescription.addEventListener("click", () => activate("description"));
  tabFinancial.addEventListener("click", () => activate("financial"));
}

function renderDescription(data) {
  const section = document.getElementById('description-section');
  const text = document.getElementById('description-text');
  if (data.official_summary) {
    text.textContent = data.official_summary;
    section.hidden = false;
  } else {
    section.hidden = true;
  }
}

let _impactCharts = [];

function renderFinancials(companies) {
  // ---- holdings table ----
  const tableWrap = document.getElementById('holdings-table-wrap');
  const tbody = document.getElementById('holdings-table-body');
  tbody.innerHTML = '';
  let rowCount = 0;

  companies.forEach(c => {
    (c.political_holdings || []).forEach(h => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(h.mp)}</td>
        <td>${escapeHtml(h.party)}</td>
        <td>${escapeHtml(h.riding)}</td>
        <td>${escapeHtml(c.company)}</td>
        <td>${escapeHtml(c.ticker || '—')}</td>
      `;
      tbody.appendChild(tr);
      rowCount++;
    });
  });
  tableWrap.hidden = rowCount === 0;

  // ---- charts (one per company that has real price history) ----
  _impactCharts.forEach(ch => ch.destroy());
  _impactCharts = [];
  const chartsWrap = document.getElementById('charts-wrap');
  chartsWrap.innerHTML = '';

  companies.forEach(c => {
    if (!c.price_history || !c.projected_trend) return;

    const box = document.createElement('div');
    box.className = 'chart-box';
    box.innerHTML = `
      <h4>${escapeHtml(c.company)}${c.ticker ? ' (' + escapeHtml(c.ticker) + ')' : ''}</h4>
      <canvas></canvas>
      <p class="trend-note">${escapeHtml(c.trend_note)}</p>
    `;
    chartsWrap.appendChild(box);

    const histLabels = c.price_history.map(p => p.date);
    const histData = c.price_history.map(p => p.close);
    const lastClose = histData[histData.length - 1];

    // projected_trend is [{year, price}, ...] for years 1..4 from "now" —
    // give it its own label track appended after the historical dates,
    // and bridge it from the last real close so the line connects visually.
    const projLabels = c.projected_trend.map(t => `+${t.year}y`);
    const projData = c.projected_trend.map(t => t.price);

    const labels = [...histLabels, ...projLabels];
    const historicalSeries = [...histData, ...projLabels.map(() => null)];
    const projectedSeries = [
      ...histData.map(() => null),
    ];
    projectedSeries[histData.length - 1] = lastClose; // bridge point
    projectedSeries.push(...projData);

    const ctx = box.querySelector('canvas').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Actual close',
            data: historicalSeries,
            borderColor: '#2563eb',
            spanGaps: false,
            pointRadius: 0,
          },
          {
            label: 'Illustrative trend (not a forecast)',
            data: projectedSeries,
            borderColor: '#ea580c',
            borderDash: [6, 4],
            spanGaps: true,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { maxTicksLimit: 8 } },
        },
      },
    });
    _impactCharts.push(chart);
  });

  // ---- net worth ----
  const conflicted = companies.filter(c => (c.political_holdings || []).length > 0);
  const withValue = conflicted.filter(c => c.illustrative_value_now != null);

  const nwSection = document.getElementById('networth-section');
  if (withValue.length === 0) {
    nwSection.hidden = true;
    return;
  }

  const totalNow = withValue.reduce((sum, c) => sum + c.illustrative_value_now, 0);
  const total4y = withValue.reduce((sum, c) => sum + c.illustrative_value_4y, 0);
  const fmt = n => n.toLocaleString('en-CA', { style: 'currency', currency: 'USD' });

  document.getElementById('assumed-shares').textContent = withValue[0].assumed_shares;
  document.getElementById('networth-now').textContent = fmt(totalNow);
  document.getElementById('networth-4y').textContent = fmt(total4y);
  nwSection.hidden = false;
}

initBillList();
initBillPage();
initTabs();
