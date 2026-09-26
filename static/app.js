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

  function loadAndRender(lang) {
    status.hidden = false;
    status.textContent = "Loading summary\u2026 this can take up to 20 seconds.";
    article.hidden = true;
    loadSummary(lang)
      .then((data) => {
        currentLang = lang;
        renderBill(data);
        status.hidden = true;
        article.hidden = false;
        document.getElementById("mp-step").hidden = false;
        document.getElementById("letter-step").hidden = false;
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

initBillList();
initBillPage();
