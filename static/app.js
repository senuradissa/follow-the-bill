// Follow the Bill — frontend (Person C)
// Two pages share this file: the bill list ("/") and a single bill ("/bill/<session>/<code>").

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- Page 1: bill list ----------
// Explicit progress order for the filter tags, most-advanced first. The two
// terminal outcomes lead; "awaiting first reading in [other chamber]" ranks
// above that chamber's own third reading because it means the bill already
// finished an entire chamber. Same-stage Senate/Commons ties are broken by
// convention (Senate first) since either chamber can be a bill's origin.
const STATUS_ORDER = [
  "Royal assent received",
  "Bill defeated",
  "House of Commons bill awaiting first reading in the Senate",
  "Senate bill awaiting first reading in the House of Commons",
  "At third reading in the Senate",
  "At third reading in the House of Commons",
  "At report stage in the Senate",
  "At report stage in the House of Commons",
  "At consideration in committee in the Senate",
  "At consideration in committee in the House of Commons",
  "At second reading in the Senate",
  "At second reading in the House of Commons",
  "Outside the Order of Precedence",
];

function statusRank(s) {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? STATUS_ORDER.length : i; // unrecognized statuses sort last, not dropped
}

function initBillList() {
  const gazette = document.getElementById("gazette");
  const filtersEl = document.getElementById("filters");
  const statusSelect = document.getElementById("status-select");
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
    const sortedStatuses = [...new Set(allBills.map((b) => b.status_en))]
      .sort((a, b) => statusRank(a) - statusRank(b));
    const statuses = ["All", ...sortedStatuses];

    // Pill list -- shown on wider screens (see .index-sidebar .filters in style.css).
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

    // Same list as a <select> -- shown instead of the pills on phones/tablets
    // (same breakpoint, in style.css) where a column of ~13 pills would eat
    // the whole screen before you get to a single bill.
    statusSelect.innerHTML = statuses.map((s) => `
      <option value="${escapeHtml(s)}"${s === activeFilter ? " selected" : ""}>${escapeHtml(s)}</option>
    `).join("");
    statusSelect.hidden = statuses.length <= 1;
  }

  function applyFilters() {
    const q = search.value.trim().toLowerCase();
    return allBills.filter((b) => {
      const matchesQ = !q || b.code.toLowerCase().includes(q) || b.title_en.toLowerCase().includes(q);
      const matchesStatus = activeFilter === "All" || b.status_en === activeFilter;
      return matchesQ && matchesStatus;
    });
  }

  function billRow(b) {
    return `
      <li class="gazette-item">
        <a href="/bill/${encodeURIComponent(b.session)}/${encodeURIComponent(b.code)}">
          <span class="gazette-code">${escapeHtml(b.code)}</span>
          <span>
            <span class="gazette-title">${escapeHtml(b.title_en)}</span>
            <div class="gazette-meta">${metaLine(b)}</div>
          </span>
        </a>
      </li>`;
  }

  function render(bills) {
    if (bills.length === 0) {
      gazette.innerHTML = '<li class="gazette-empty">No bills match your search.</li>';
      gazette.hidden = false;
      return;
    }
    // Newest first. `introduced` may be missing on some entries; those sort
    // to the end rather than breaking the sort.
    const sorted = [...bills].sort((a, b) => new Date(b.introduced || 0) - new Date(a.introduced || 0));
    gazette.innerHTML = sorted.map(billRow).join("");
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

  // The select's own <option> list gets rebuilt every renderFilters() call,
  // but the <select> element itself never does, so this listener only
  // needs to be wired up once.
  statusSelect.addEventListener("change", () => {
    activeFilter = statusSelect.value;
    renderFilters();
    render(applyFilters());
  });
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
    status.hidden = false;
    status.textContent = "Loading summary… this can take up to 20 seconds.";
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

  // ---- Listen to summary (ElevenLabs, via voice.py) ----
  const listenBtn = document.getElementById("listen-btn");
  const listenStatus = document.getElementById("listen-status");
  const listenAudio = document.getElementById("listen-audio");

  listenBtn.addEventListener("click", () => {
    listenBtn.disabled = true;
    listenAudio.hidden = true;
    listenStatus.textContent = "Generating audio… this can take a few seconds.";

    fetch(`/api/bills/${encodeURIComponent(session)}/${encodeURIComponent(code)}/audio?lang=${currentLang}`)
      .then((resp) => {
        if (!resp.ok) throw new Error("Request failed");
        return resp.blob();
      })
      .then((blob) => {
        listenAudio.src = URL.createObjectURL(blob);
        listenAudio.hidden = false;
        listenStatus.textContent = "";
        listenAudio.play();
      })
      .catch(() => {
        listenStatus.textContent = "Couldn't generate audio right now.";
      })
      .finally(() => {
        listenBtn.disabled = false;
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

// ---------- Bookmark button (bill page) ----------
function initBookmarkButton() {
  const btn = document.getElementById("bookmark-btn");
  if (!btn) return; // not this page

  const session = document.body.dataset.session;
  const code = document.body.dataset.code;
  const label = document.getElementById("bookmark-label");

  function setSaved(saved) {
    btn.classList.toggle("is-saved", saved);
    label.textContent = saved ? "Bookmarked" : "Bookmark";
  }

  if (btn.dataset.loggedIn !== "true") {
    // Not logged in yet -- send them to log in rather than silently failing
    // the API call. They land back on the homepage; they can come back to
    // this bill and bookmark it once they're signed in.
    btn.addEventListener("click", () => { window.location.href = "/login"; });
    return;
  }

  fetch("/api/bookmarks")
    .then((resp) => resp.json())
    .then((bookmarks) => {
      setSaved(bookmarks.some((b) => b.session === session && b.code === code));
    })
    .catch(() => {}); // leave it unbookmarked-looking rather than block the page

  btn.addEventListener("click", () => {
    if (btn.classList.contains("is-saved")) {
      fetch(`/api/bookmarks/${encodeURIComponent(session)}/${encodeURIComponent(code)}`, { method: "DELETE" })
        .then(() => setSaved(false));
    } else {
      const title = document.getElementById("bill-title").textContent || "";
      fetch("/api/bookmarks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, code, title_en: title }),
      }).then(() => setSaved(true));
    }
  });
}

// ---------- Bookmarks page ----------
function bookmarkRow(b) {
  return `
    <li class="gazette-item gazette-item--bookmark">
      <a href="/bill/${encodeURIComponent(b.session)}/${encodeURIComponent(b.code)}">
        <span class="gazette-code">${escapeHtml(b.code)}</span>
        <span class="gazette-title">${escapeHtml(b.title_en)}</span>
      </a>
      <button type="button" class="bookmark-remove" data-session="${escapeHtml(b.session)}" data-code="${escapeHtml(b.code)}" aria-label="Remove bookmark">&times;</button>
    </li>`;
}

function initBookmarksPage() {
  const list = document.getElementById("bookmark-list");
  if (!list) return; // not this page, or not logged in (server renders the login prompt instead)
  const status = document.getElementById("status");

  fetch("/api/bookmarks")
    .then((resp) => {
      if (!resp.ok) throw new Error("Request failed");
      return resp.json();
    })
    .then((bookmarks) => {
      if (bookmarks.length === 0) {
        list.innerHTML = '<li class="gazette-empty">No bookmarks yet &mdash; open a bill and tap "Bookmark" to save it here.</li>';
      } else {
        list.innerHTML = bookmarks.map(bookmarkRow).join("");
        list.querySelectorAll(".bookmark-remove").forEach((removeBtn) => {
          removeBtn.addEventListener("click", () => {
            const { session, code } = removeBtn.dataset;
            fetch(`/api/bookmarks/${encodeURIComponent(session)}/${encodeURIComponent(code)}`, { method: "DELETE" })
              .then(() => removeBtn.closest(".gazette-item").remove());
          });
        });
      }
      status.hidden = true;
      list.hidden = false;
    })
    .catch(() => {
      status.textContent = "Couldn't load your bookmarks. Try refreshing.";
    });
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
initBookmarkButton();
initBookmarksPage();
