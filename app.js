/* ============================================
   ÉTAT GLOBAL
============================================ */
let data = [];
let currentUser = localStorage.getItem("kpiUser");
let favorites = [];
let currentView = "all"; // "all" | "fav"

/* ============================================
   ÉLÉMENTS DOM
============================================ */
const loginScreen   = document.getElementById("loginScreen");
const appShell      = document.getElementById("appShell");
const loginBtn      = document.getElementById("loginBtn");
const usernameInput = document.getElementById("usernameInput");
const userInfo      = document.getElementById("userInfo");
const userAvatar    = document.getElementById("userAvatar");
const logoutBtn     = document.getElementById("logoutBtn");
const container     = document.getElementById("kpiContainer");
const fileInput     = document.getElementById("fileInput");
const refreshBtn    = document.getElementById("refreshBtn");
const searchInput   = document.getElementById("search");
const processFilter = document.getElementById("processFilter");
const freqFilter    = document.getElementById("freqFilter");
const ritualFilter  = document.getElementById("ritualFilter");
const countAll      = document.getElementById("countAll");
const countFav      = document.getElementById("countFav");
const searchCount   = document.getElementById("searchCount");
const topbarBadge   = document.getElementById("topbarBadge");
const emptyState    = document.getElementById("emptyState");
const toastEl       = document.getElementById("toast");

/* ============================================
   TOAST
============================================ */
let toastTimer;
function showToast(msg, duration = 2200) {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), duration);
}

/* ============================================
   LOGIN
============================================ */
function login(user) {
  currentUser = user;
  localStorage.setItem("kpiUser", user);
  loginScreen.style.display = "none";
  appShell.style.display = "flex";

  userInfo.textContent = user;
  userAvatar.textContent = user.charAt(0).toUpperCase();

  loadFavorites();
  loadSavedFile();
}

loginBtn.addEventListener("click", () => {
  const user = usernameInput.value.trim();
  if (!user) { usernameInput.focus(); return; }
  login(user);
});

usernameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") loginBtn.click();
});

// Auto-login si session mémorisée
if (currentUser) {
  login(currentUser);
}

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("kpiUser");
  data = [];
  favorites = [];
  currentView = "all";
  container.innerHTML = "";
  container.appendChild(emptyState);
  emptyState.style.display = "";
  appShell.style.display = "none";
  loginScreen.style.display = "flex";
  usernameInput.value = "";
});

/* ============================================
   VUES (all / fav)
============================================ */
function switchView(view, btn) {
  currentView = view;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  filterData();
}

/* ============================================
   SIDEBAR TOGGLE
============================================ */
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("collapsed");
}

/* ============================================
   FAVORIS
============================================ */
function loadFavorites() {
  favorites = JSON.parse(localStorage.getItem("kpiFav_" + currentUser)) || [];
}

function saveFavorites() {
  localStorage.setItem("kpiFav_" + currentUser, JSON.stringify(favorites));
}

function toggleFavorite(id) {
  if (favorites.includes(id)) {
    favorites = favorites.filter(f => f !== id);
    showToast("Retiré des favoris");
  } else {
    favorites.push(id);
    showToast("⭐ Ajouté aux favoris");
  }
  saveFavorites();
  updateCounts();
  render(getFilteredData());
}

function isFavorite(id) { return favorites.includes(id); }

/* ============================================
   EXCEL IMPORT + SAUVEGARDE
============================================ */
fileInput.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const buf = evt.target.result;
    localStorage.setItem("kpiFile", JSON.stringify(Array.from(new Uint8Array(buf))));
    loadWorkbook(buf);
    showToast("✅ Fichier importé");
  };
  reader.readAsArrayBuffer(file);
});

function loadSavedFile() {
  const stored = localStorage.getItem("kpiFile");
  if (!stored) { fileInput.click(); return; }
  const bytes = new Uint8Array(JSON.parse(stored));
  loadWorkbook(bytes);
}

function loadWorkbook(buffer) {
  try {
    const wb = XLSX.read(buffer, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    transformData(sheet, raw);
  } catch (e) {
    showToast("❌ Erreur de lecture du fichier", 3000);
  }
}

/* ============================================
   EXTRACTION LIENS
============================================ */
function extractLinksByColumn(sheet, headers, rowIndex) {
  const links = { logistiport: "", armement: "", armateur: "", global: "" };
  headers.forEach((header, colIndex) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
    if (cell && cell.l && cell.l.Target) {
      const url = cell.l.Target.replace(/&amp;/g, "&");
      const h = (header || "").toLowerCase();
      if (h.includes("log"))                          links.logistiport = url;
      else if (h.includes("armement") || h.includes("mg")) links.armement = url;
      else if (h.includes("armateur"))                links.armateur = url;
      else if (h.includes("global"))                  links.global = url;
    }
  });
  return links;
}

/* ============================================
   TRANSFORMATION
============================================ */
function transformData(sheet, rawData) {
  const headers = rawData[0];
  data = rawData.slice(1)
    .filter(row => row.some(cell => cell !== undefined && cell !== ""))
    .map((row, idx) => {
      const obj = {};
      headers.forEach((h, i) => (obj[h] = row[i]));
      const id = (obj["Intitulé"] || "kpi") + "_" + idx;
      const links = extractLinksByColumn(sheet, headers, idx + 1);
      return {
        id,
        title:   obj["Intitulé"] || "",
        type:    obj["Type KPI"] || "",
        process: obj["Processus"] || "",
        freq:    obj["Fréquence"] || "",
        ritual:  obj["Rituel"] || "",
        desc:    obj["Description / Mode de calcul"] || "",
        ...links
      };
    });

  initFilters();
  updateCounts();
  filterData();
}

/* ============================================
   FILTRES
============================================ */
function initFilters() {
  const makeOptions = (arr, el) => {
    const first = el.options[0];
    el.innerHTML = "";
    el.appendChild(first);
    [...new Set(arr.filter(Boolean))].sort().forEach(v => {
      const o = document.createElement("option");
      o.textContent = v;
      el.appendChild(o);
    });
  };
  makeOptions(data.map(d => d.process), processFilter);
  makeOptions(data.map(d => d.freq),    freqFilter);
  makeOptions(data.map(d => d.ritual),  ritualFilter);
}

function resetFilters() {
  searchInput.value = "";
  processFilter.selectedIndex = 0;
  freqFilter.selectedIndex = 0;
  ritualFilter.selectedIndex = 0;
  filterData();
  showToast("Filtres réinitialisés");
}

function getFilteredData() {
  const s = searchInput.value.toLowerCase().trim();
  const p = processFilter.value;
  const f = freqFilter.value;
  const r = ritualFilter.value;

  let list = data.filter(d =>
    (!p || d.process === p) &&
    (!f || d.freq === f) &&
    (!r || d.ritual === r) &&
    (!s || d.title.toLowerCase().includes(s) || d.desc.toLowerCase().includes(s))
  );

  if (currentView === "fav") list = list.filter(d => isFavorite(d.id));

  return list;
}

function filterData() {
  const list = getFilteredData();
  render(list);
}

/* ============================================
   COMPTEURS
============================================ */
function updateCounts() {
  countAll.textContent = data.length;
  countFav.textContent = favorites.length;
}

/* ============================================
   OPEN KPI
============================================ */
function openKPI(selectId) {
  const url = document.getElementById(selectId).value;
  if (!url) { showToast("Sélectionnez d'abord un rapport"); return; }
  window.open(url, "_blank");
}

/* ============================================
   RENDER
============================================ */
function render(list) {
  // Vide + empty state
  container.innerHTML = "";

  if (!list.length) {
    const msg = data.length === 0
      ? { icon: "📊", title: "Aucun KPI chargé", sub: "Importez votre fichier Excel pour commencer" }
      : currentView === "fav"
        ? { icon: "⭐", title: "Aucun favori", sub: "Cliquez sur ⭐ dans une carte pour ajouter aux favoris" }
        : { icon: "🔍", title: "Aucun résultat", sub: "Essayez d'autres mots-clés ou réinitialisez les filtres" };

    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${msg.icon}</div>
        <h3>${msg.title}</h3>
        <p>${msg.sub}</p>
      </div>`;
    searchCount.textContent = "";
    topbarBadge.textContent = "";
    return;
  }

  // Trie : favoris en premier
  const sorted = [...list].sort((a, b) => isFavorite(b.id) - isFavorite(a.id));

  // Compteur barre de recherche
  searchCount.textContent = list.length !== data.length ? `${list.length} résultat${list.length > 1 ? "s" : ""}` : "";
  topbarBadge.textContent = `${list.length} KPI${list.length > 1 ? "s" : ""}`;

  sorted.forEach((kpi, i) => {
    const isFav  = isFavorite(kpi.id);
    const selId  = "sel_" + kpi.id.replace(/[^a-zA-Z0-9_]/g, "_");

    const siteBadges = [
      kpi.logistiport ? `<span class="site-badge logistiport"><span class="dot"></span>LOG</span>` : "",
      kpi.armement    ? `<span class="site-badge armement"><span class="dot"></span>ARM</span>` : "",
      kpi.armateur    ? `<span class="site-badge armateur"><span class="dot"></span>ATEUR</span>` : "",
      kpi.global      ? `<span class="site-badge global"><span class="dot"></span>GLOBAL</span>` : ""
    ].join("");

    let options = "";
    if (kpi.logistiport) options += `<option value="${kpi.logistiport}">Logistiport</option>`;
    if (kpi.armement)    options += `<option value="${kpi.armement}">Armement</option>`;
    if (kpi.armateur)    options += `<option value="${kpi.armateur}">Armateur</option>`;
    if (kpi.global)      options += `<option value="${kpi.global}">Global</option>`;

    const card = document.createElement("div");
    card.className = "card" + (isFav ? " favorite" : "");
    card.style.animationDelay = `${Math.min(i * 30, 180)}ms`;

    card.innerHTML = `
      ${isFav ? `<div class="fav-ribbon">⭐ Favori</div>` : ""}

      <div class="card-header">
        <div class="card-title">${kpi.title}</div>
        <button class="btn-fav${isFav ? " active" : ""}" onclick="toggleFavorite('${kpi.id}')" title="${isFav ? "Retirer des favoris" : "Ajouter aux favoris"}">⭐</button>
      </div>

      <div class="card-tags">
        ${kpi.type    ? `<span class="tag tag-type">${kpi.type}</span>` : ""}
        ${kpi.process ? `<span class="tag tag-process">${kpi.process}</span>` : ""}
        ${kpi.freq    ? `<span class="tag tag-freq">${kpi.freq}</span>` : ""}
        ${kpi.ritual  ? `<span class="tag tag-ritual">${kpi.ritual}</span>` : ""}
      </div>

      ${siteBadges ? `<div class="card-sites">${siteBadges}</div>` : ""}

      ${kpi.desc ? `<p class="card-desc">${kpi.desc}</p>` : ""}

      ${options ? `
      <div class="card-action">
        <select id="${selId}">
          <option value="">Choisir un rapport</option>
          ${options}
        </select>
        <button class="btn-open" onclick="openKPI('${selId}')">
          Ouvrir
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
      </div>` : ""}
    `;

    container.appendChild(card);
  });
}

/* ============================================
   EVENTS
============================================ */
searchInput.addEventListener("input", filterData);
processFilter.addEventListener("change", filterData);
freqFilter.addEventListener("change", filterData);
ritualFilter.addEventListener("change", filterData);
refreshBtn.addEventListener("click", () => { loadSavedFile(); showToast("🔄 Données rafraîchies"); });
