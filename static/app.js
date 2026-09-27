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
      return `${dateStr} · ${escapeHtml(b.status_en)}`;
    }
    return `${escapeHtml(b.session)} · ${escapeHtml(b.status_en)}`;
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
    document.getElementById("bill-code").textContent = `Bill ${code} — ${session}`;
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
      const lobbying = c.lobbying_activity || [];
      let lobbyHtml = "";
      if (lobbying.length) {
        const first = lobbying[0];
        const extra = lobbying.length - 1;
        const who = `${escapeHtml(first.dpoh_name)}${first.dpoh_institution ? ` (${escapeHtml(first.dpoh_institution)})` : ""}`;
        const rest = extra > 0 ? ` and ${extra} other${extra > 1 ? "s" : ""}` : "";
        lobbyHtml = `
          <span class="conflict-flag">
            <span>⚠ Registered lobbying: contacted <strong>${who}</strong>${rest}.</span>
            <a class="conflict-cta" href="#mp-step">Contact your MP about this &rarr;</a>
          </span>`;
      }
      return `
        <li class="company-row">
          <span class="company-name">${escapeHtml(c.company)}</span>
          ${c.ticker ? `<span class="company-ticker">${escapeHtml(c.ticker)}</span>` : ""}
          ${priceHtml}
          ${lobbyHtml}
        </li>`;
    }).join("");
  }

  function loadImpact(lang) {
    const impactStatus = document.getElementById("impact-status");
    impactStatus.hidden = false;
    impactStatus.textContent = "Loading lobbying data…";
    document.getElementById("company-list").innerHTML = "";
    document.getElementById("holdings-table-wrap").hidden = true;
    document.getElementById("impact-sectors").hidden = true;

    fetch(`/api/bills/${encodeURIComponent(session)}/${encodeURIComponent(code)}/impact?lang=${lang}`)
      .then((resp) => {
        if (!resp.ok) throw new Error("Request failed");
        return resp.json();
      })
      .then((data) => {
        renderSectors(data);
        renderCompanies(data);
        renderFinancials(data.companies || []);
      })
      .catch(() => {
        // Optional/experimental feature (needs FINNHUB_API_KEY etc.) — fail without
        // taking down the rest of the page.
        impactStatus.hidden = false;
        impactStatus.textContent = "Couldn't load lobbying data for this bill right now.";
      });
  }

  function loadAndRender(lang) {
    resetListen();
    status.hidden = false;
    status.textContent = "Loading summary… this can take up to 20 seconds.";
    article.hidden = true;
    loadSummary(lang)
      .then((data) => {
        currentLang = lang;
        renderBill(data);
        renderDescription(data);
        resetListen();
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

  // ---- Listen: read the summary aloud (ElevenLabs, via /audio) ----
  const listenBtn = document.getElementById("listen-btn");
  const listenLabel = document.getElementById("listen-label");
  const listenStatus = document.getElementById("listen-status");
  const listenAudio = document.getElementById("listen-audio");

  const LISTEN_TEXT = {
    en: {
      idle: "Listen to this summary",
      loading: "Preparing audio… this can take up to 20 seconds.",
      error: "Couldn't load the audio right now.",
    },
    fr: {
      idle: "Écouter ce résumé",
      loading: "Préparation de l’audio… cela peut prendre jusqu’à 20 secondes.",
      error: "Impossible de charger l’audio pour le moment.",
    },
  };

  // Stop any playing audio and put the button back to its starting state
  // (called when the page loads a summary or switches language).
  function resetListen() {
    listenAudio.pause();
    listenAudio.removeAttribute("src");
    listenAudio.load();
    listenAudio.hidden = true;
    listenBtn.disabled = false;
    listenStatus.textContent = "";
    listenLabel.textContent = LISTEN_TEXT[currentLang].idle;
  }

  listenBtn.addEventListener("click", () => {
    listenBtn.disabled = true;
    listenStatus.textContent = LISTEN_TEXT[currentLang].loading;
    listenAudio.src = `/api/bills/${encodeURIComponent(session)}/${encodeURIComponent(code)}/audio?lang=${currentLang}`;
    listenAudio.hidden = false;
    listenAudio.play().catch(() => {}); // failures are handled by the "error" listener below
  });

  listenAudio.addEventListener("playing", () => {
    listenStatus.textContent = "";
    listenBtn.disabled = false;
  });

  listenAudio.addEventListener("error", () => {
    if (!listenAudio.getAttribute("src")) return; // just reset, not a real error
    listenStatus.textContent = LISTEN_TEXT[currentLang].error;
    listenAudio.hidden = true;
    listenBtn.disabled = false;
  });

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
        document.getElementById("mp-meta").textContent = `${mp.party} · ${mp.riding}`;
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
    letterStatus.textContent = "Drafting your letter…";

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

// ---------- Description / Lobbying activity tabs ----------
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
    // Collapsed by default: for big bills this is thousands of words.
    // renderBill() has already set the page language by this point.
    document.getElementById('description-toggle').textContent =
      document.documentElement.lang === 'fr'
        ? 'Lire le sommaire officiel du Parlement'
        : 'Read the official summary from Parliament';
    section.hidden = false;
  } else {
    section.hidden = true;
  }
}

function renderSectors(data) {
  const el = document.getElementById('impact-sectors');
  const sectors = (data && data.sectors) || [];
  if (!sectors.length) {
    el.hidden = true;
    return;
  }
  el.innerHTML = `<strong>Sectors this bill affects:</strong> ${sectors.map(escapeHtml).join(', ')}`;
  el.hidden = false;
}

function renderFinancials(companies) {
  // Lobbying activity table -- who registered companies affected by this bill
  // have actually contacted in government, sourced from Canada's public
  // Registry of Lobbyists (see impact.py: company_lobbying()).
  const tableWrap = document.getElementById('holdings-table-wrap');
  const tbody = document.getElementById('holdings-table-body');
  tbody.innerHTML = '';
  let rowCount = 0;

  companies.forEach(c => {
    (c.lobbying_activity || []).forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(c.registered_name || c.company)}</td>
        <td>${escapeHtml(c.ticker || '—')}</td>
        <td>${escapeHtml(r.dpoh_name || '—')}</td>
        <td>${escapeHtml(r.dpoh_title || '—')}</td>
        <td>${escapeHtml(r.dpoh_institution || '—')}</td>
        <td>${escapeHtml(r.date || '—')}</td>
      `;
      tbody.appendChild(tr);
      rowCount++;
    });
  });
  tableWrap.hidden = rowCount === 0;
}

initBillList();
initBillPage();
initTabs();
