/* ============================================
   ÉTAT GLOBAL
============================================ */
let data = [];          // Liste affichée = excelData (+ surcharges) + manualEntries
let excelData = [];     // KPIs issus du fichier Excel (version d'origine, jamais modifiée)
let manualEntries = []; // KPIs créés directement dans l'application
let overrides = {};     // Modifications apportées aux KPIs Excel, par id
let deletedIds = [];    // Fiches Excel supprimées dans l'app (masquées même après ré-import)
let currentUser = localStorage.getItem("kpiUser");
let favorites = [];
let currentView = "all"; // "all" | "fav"
let editingKpiId = null; // id du KPI en cours d'édition dans la modale

// Échappe le HTML pour un affichage sûr dans les cartes
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

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
const sidebarOverlay   = document.getElementById("sidebarOverlay");
const syncSettingsBtn  = document.getElementById("syncSettingsBtn");
const syncModal        = document.getElementById("syncModal");
const closeSyncModalBtn= document.getElementById("closeSyncModalBtn");

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

  // Sur mobile, la sidebar démarre repliée pour laisser la place au contenu
  if (window.innerWidth <= 768) {
    document.getElementById("sidebar").classList.add("collapsed");
  }

  loadFavorites();
  loadManualEntries();
  loadOverrides();
  loadDeletedIds();
  loadSavedFile();

  try { connectSync(false); } catch (err) { console.error("connectSync (login) error:", err); }
}

loginBtn.addEventListener("click", () => {
  const user = usernameInput.value.trim();
  if (!user) { usernameInput.focus(); return; }
  login(user);
});

usernameInput.addEventListener("keydown", e => {
  if (e.key === "Enter") loginBtn.click();
});

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("kpiUser");
  data = [];
  excelData = [];
  manualEntries = [];
  overrides = {};
  deletedIds = [];
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
  if (window.innerWidth <= 768) {
    document.getElementById("sidebar").classList.add("collapsed");
    sidebarOverlay.classList.remove("show");
  }
}

/* ============================================
   SIDEBAR TOGGLE
============================================ */
function toggleSidebar() {
  const sb = document.getElementById("sidebar");
  sb.classList.toggle("collapsed");
  if (window.innerWidth <= 768) {
    sidebarOverlay.classList.toggle("show", !sb.classList.contains("collapsed"));
  }
}

sidebarOverlay?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.add("collapsed");
  sidebarOverlay.classList.remove("show");
});

/* ============================================
   FAVORIS
============================================ */
function loadFavorites() {
  favorites = JSON.parse(localStorage.getItem("kpiFav_" + currentUser)) || [];
}

function saveFavorites() {
  localStorage.setItem("kpiFav_" + currentUser, JSON.stringify(favorites));
  scheduleAutoSync();
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
  if (stored) {
    const bytes = new Uint8Array(JSON.parse(stored));
    loadWorkbook(bytes);
    return;
  }
  // Pas de fichier Excel local : on utilise les données déjà synchronisées depuis le cloud, si disponibles
  const cached = localStorage.getItem("kpiDataCache");
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      excelData = parsed.filter(d => !d.manual);
      // Les entrées manuelles du cache complètent celles déjà connues localement
      const cachedManual = parsed.filter(d => d.manual);
      const known = new Set(manualEntries.map(m => m.id));
      cachedManual.forEach(m => { if (!known.has(m.id)) manualEntries.push(m); });
      saveManualEntries(false);
      rebuildData(false);
      return;
    } catch { /* cache invalide, on retombe sur l'import */ }
  }
  // Pas d'Excel ni de cache : on affiche au moins les fiches créées à la main
  if (manualEntries.length) { rebuildData(false); return; }
  fileInput.click();
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
  excelData = rawData.slice(1)
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

  rebuildData(true);
}

/* ============================================
   FUSION EXCEL + FICHES MANUELLES
============================================ */
function rebuildData(sync) {
  // Applique les modifications utilisateur par-dessus les fiches Excel d'origine,
  // et masque celles qui ont été supprimées dans l'application
  const excelWithEdits = excelData
    .filter(d => !deletedIds.includes(d.id))
    .map(d => overrides[d.id] ? { ...d, ...overrides[d.id], edited: true } : d);
  data = [...excelWithEdits, ...manualEntries];
  initFilters();
  updateCounts();
  filterData();
  updateRestoreDeletedBtn();
  // Cache la donnée d'origine (surcharges et suppressions sont stockées à part)
  localStorage.setItem("kpiDataCache", JSON.stringify([...excelData, ...manualEntries]));
  if (sync) scheduleAutoSync();
}

/* ============================================
   FICHES MANUELLES (créées dans l'application)
============================================ */
function loadManualEntries() {
  try {
    manualEntries = JSON.parse(localStorage.getItem("kpiManualEntries")) || [];
  } catch { manualEntries = []; }
}

function saveManualEntries(sync = true) {
  localStorage.setItem("kpiManualEntries", JSON.stringify(manualEntries));
  if (sync) scheduleAutoSync();
}

/* ============================================
   SURCHARGES : modifications des fiches Excel
   (conservées même après un ré-import du fichier)
============================================ */
function loadOverrides() {
  try {
    overrides = JSON.parse(localStorage.getItem("kpiOverrides")) || {};
  } catch { overrides = {}; }
}

function saveOverrides(sync = true) {
  localStorage.setItem("kpiOverrides", JSON.stringify(overrides));
  if (sync) scheduleAutoSync();
}

function restoreOriginalKpi(id) {
  const original = excelData.find(k => k.id === id);
  if (!confirm(`Restaurer la version d'origine de « ${original ? original.title : id} » ?`)) return;
  delete overrides[id];
  saveOverrides();
  rebuildData(true);
  showToast("↩ Version d'origine restaurée");
}

/* ============================================
   SUPPRESSION DES FICHES EXCEL (masquage persistant)
============================================ */
function loadDeletedIds() {
  try {
    deletedIds = JSON.parse(localStorage.getItem("kpiDeletedIds")) || [];
  } catch { deletedIds = []; }
}

function saveDeletedIds(sync = true) {
  localStorage.setItem("kpiDeletedIds", JSON.stringify(deletedIds));
  if (sync) scheduleAutoSync();
}

function deleteExcelKpi(id) {
  const kpi = data.find(k => k.id === id) || excelData.find(k => k.id === id);
  if (!kpi) return;
  if (!confirm(`Supprimer le signet « ${kpi.title} » ?\n\nIl restera masqué même après un ré-import Excel. Vous pourrez le réafficher via « Réafficher les fiches supprimées » dans le menu.`)) return;
  if (!deletedIds.includes(id)) deletedIds.push(id);
  delete overrides[id];
  favorites = favorites.filter(f => f !== id);
  saveFavoritesLocalOnly();
  saveOverrides(false);
  saveDeletedIds();
  rebuildData(true);
  showToast("🗑 Signet supprimé");
}

// Point d'entrée unique de la corbeille sur les cartes
function deleteKPI(id) {
  if (manualEntries.some(k => k.id === id)) deleteManualKpi(id);
  else deleteExcelKpi(id);
}

function updateRestoreDeletedBtn() {
  const btn = document.getElementById("restoreDeletedBtn");
  const label = document.getElementById("restoreDeletedLabel");
  if (!btn) return;
  const n = deletedIds.length;
  btn.style.display = n ? "" : "none";
  if (label) label.textContent = `Réafficher ${n} fiche${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""}`;
}

document.getElementById("restoreDeletedBtn")?.addEventListener("click", () => {
  if (!deletedIds.length) return;
  if (!confirm(`Réafficher les ${deletedIds.length} fiche(s) supprimée(s) ?`)) return;
  deletedIds = [];
  saveDeletedIds();
  rebuildData(true);
  showToast("✅ Fiches réaffichées");
});

function fillDatalists() {
  const fill = (id, values) => {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = "";
    [...new Set(values.filter(Boolean))].sort().forEach(v => {
      const o = document.createElement("option");
      o.value = v;
      dl.appendChild(o);
    });
  };
  fill("typeList",    data.map(d => d.type));
  fill("processList", data.map(d => d.process));
  fill("freqList",    data.map(d => d.freq));
  fill("ritualList",  data.map(d => d.ritual));
}

function openKpiModal(id = null) {
  editingKpiId = id;
  const kpi = id ? data.find(k => k.id === id) : null;
  const isManual = !!(kpi && kpi.manual);
  const isEdited = !!(kpi && !kpi.manual && overrides[id]);

  document.getElementById("kpiModalTitle").textContent =
    kpi ? (isManual ? "✏️ Modifier le KPI" : "✏️ Modifier le signet") : "➕ Nouveau KPI";

  // Pied de modale : Supprimer pour toute fiche existante,
  // Restaurer l'original en plus si une fiche Excel a été modifiée
  const delBtn = document.getElementById("deleteKpiBtn");
  const restoreBtn = document.getElementById("restoreKpiBtn");
  delBtn.style.display = kpi ? "" : "none";
  restoreBtn.style.display = isEdited ? "" : "none";

  document.getElementById("kpiTitleInput").value   = kpi?.title   || "";
  document.getElementById("kpiTypeInput").value    = kpi?.type    || "";
  document.getElementById("kpiProcessInput").value = kpi?.process || "";
  document.getElementById("kpiFreqInput").value    = kpi?.freq    || "";
  document.getElementById("kpiRitualInput").value  = kpi?.ritual  || "";
  document.getElementById("kpiDescInput").value    = kpi?.desc    || "";
  document.getElementById("kpiLinkLog").value      = kpi?.logistiport || "";
  document.getElementById("kpiLinkArmement").value = kpi?.armement    || "";
  document.getElementById("kpiLinkArmateur").value = kpi?.armateur    || "";
  document.getElementById("kpiLinkGlobal").value   = kpi?.global      || "";

  fillDatalists();
  document.getElementById("kpiModal").classList.remove("hidden");
  document.getElementById("kpiTitleInput").focus();
}

function closeKpiModal() {
  editingKpiId = null;
  document.getElementById("kpiModal").classList.add("hidden");
}

// Normalise une URL saisie (ajoute https:// si absent)
function normalizeUrl(v) {
  v = v.trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "https://" + v;
  return v;
}

function saveKpiForm() {
  const title = document.getElementById("kpiTitleInput").value.trim();
  if (!title) {
    showToast("⚠️ L'intitulé est obligatoire", 2600);
    document.getElementById("kpiTitleInput").focus();
    return;
  }

  const fields = {
    title,
    type:    document.getElementById("kpiTypeInput").value.trim(),
    process: document.getElementById("kpiProcessInput").value.trim(),
    freq:    document.getElementById("kpiFreqInput").value.trim(),
    ritual:  document.getElementById("kpiRitualInput").value.trim(),
    desc:    document.getElementById("kpiDescInput").value.trim(),
    logistiport: normalizeUrl(document.getElementById("kpiLinkLog").value),
    armement:    normalizeUrl(document.getElementById("kpiLinkArmement").value),
    armateur:    normalizeUrl(document.getElementById("kpiLinkArmateur").value),
    global:      normalizeUrl(document.getElementById("kpiLinkGlobal").value)
  };

  const isExcelKpi = editingKpiId && excelData.some(k => k.id === editingKpiId);

  if (isExcelKpi) {
    // Fiche Excel : on stocke la modification en surcharge (l'original reste intact)
    overrides[editingKpiId] = fields;
    saveOverrides();
    showToast("✅ Signet modifié");
  } else {
    const entry = { id: editingKpiId || ("manual_" + Date.now()), manual: true, ...fields };
    const idx = manualEntries.findIndex(k => k.id === entry.id);
    if (idx >= 0) {
      manualEntries[idx] = entry;
      showToast("✅ KPI modifié");
    } else {
      manualEntries.push(entry);
      showToast("✅ KPI créé");
    }
    saveManualEntries();
  }

  rebuildData(true);
  closeKpiModal();
}

function editKPI(id) { openKpiModal(id); }

function deleteManualKpi(id) {
  const kpi = manualEntries.find(k => k.id === id);
  if (!kpi) return;
  if (!confirm(`Supprimer le KPI « ${kpi.title} » ?`)) return;
  manualEntries = manualEntries.filter(k => k.id !== id);
  favorites = favorites.filter(f => f !== id);
  saveFavoritesLocalOnly();
  saveManualEntries();
  rebuildData(true);
  showToast("🗑 KPI supprimé");
}

// Boutons d'ouverture / actions de la modale
document.getElementById("addKpiBtn")?.addEventListener("click", () => openKpiModal());
document.getElementById("fabAddBtn")?.addEventListener("click", () => openKpiModal());
document.getElementById("closeKpiModalBtn")?.addEventListener("click", closeKpiModal);
document.getElementById("cancelKpiBtn")?.addEventListener("click", closeKpiModal);
document.getElementById("saveKpiBtn")?.addEventListener("click", saveKpiForm);
document.getElementById("deleteKpiBtn")?.addEventListener("click", () => {
  if (!editingKpiId) return;
  const id = editingKpiId;
  closeKpiModal();
  deleteKPI(id);
});
document.getElementById("restoreKpiBtn")?.addEventListener("click", () => {
  if (!editingKpiId) return;
  const id = editingKpiId;
  closeKpiModal();
  restoreOriginalKpi(id);
});
document.getElementById("kpiModal")?.addEventListener("click", e => {
  if (e.target === document.getElementById("kpiModal")) closeKpiModal();
});

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
    const safeId = esc(kpi.id).replace(/'/g, "\\'");

    const siteBadges = [
      kpi.logistiport ? `<span class="site-badge logistiport"><span class="dot"></span>LOG</span>` : "",
      kpi.armement    ? `<span class="site-badge armement"><span class="dot"></span>ARM</span>` : "",
      kpi.armateur    ? `<span class="site-badge armateur"><span class="dot"></span>ATEUR</span>` : "",
      kpi.global      ? `<span class="site-badge global"><span class="dot"></span>GLOBAL</span>` : ""
    ].join("");

    let options = "";
    if (kpi.logistiport) options += `<option value="${esc(kpi.logistiport)}">Logistiport</option>`;
    if (kpi.armement)    options += `<option value="${esc(kpi.armement)}">Armement</option>`;
    if (kpi.armateur)    options += `<option value="${esc(kpi.armateur)}">Armateur</option>`;
    if (kpi.global)      options += `<option value="${esc(kpi.global)}">Global</option>`;

    const card = document.createElement("div");
    card.className = "card" + (isFav ? " favorite" : "");
    card.style.animationDelay = `${Math.min(i * 30, 180)}ms`;

    card.innerHTML = `
      ${isFav ? `<div class="fav-ribbon">⭐ Favori</div>` : ""}

      <div class="card-header">
        <div class="card-title">${esc(kpi.title)}</div>
        <div class="card-tools">
          <button class="btn-tool" onclick="editKPI('${safeId}')" title="Modifier">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-tool btn-tool-danger" onclick="deleteKPI('${safeId}')" title="Supprimer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <button class="btn-fav${isFav ? " active" : ""}" onclick="toggleFavorite('${safeId}')" title="${isFav ? "Retirer des favoris" : "Ajouter aux favoris"}">⭐</button>
        </div>
      </div>

      <div class="card-tags">
        ${kpi.manual  ? `<span class="tag tag-manual">✎ Manuel</span>` : ""}
        ${kpi.edited  ? `<span class="tag tag-edited">✎ Modifié</span>` : ""}
        ${kpi.type    ? `<span class="tag tag-type">${esc(kpi.type)}</span>` : ""}
        ${kpi.process ? `<span class="tag tag-process">${esc(kpi.process)}</span>` : ""}
        ${kpi.freq    ? `<span class="tag tag-freq">${esc(kpi.freq)}</span>` : ""}
        ${kpi.ritual  ? `<span class="tag tag-ritual">${esc(kpi.ritual)}</span>` : ""}
      </div>

      ${siteBadges ? `<div class="card-sites">${siteBadges}</div>` : ""}

      ${kpi.desc ? `<p class="card-desc">${esc(kpi.desc)}</p>` : ""}

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

/* ============================================
   SYNCHRONISATION CLOUD (Firebase Firestore)
============================================ */
const LS_SYNC = "kpiSyncConfig";
const getSyncConfig = () => { try { return JSON.parse(localStorage.getItem(LS_SYNC)); } catch { return null; } };
const setSyncConfig = cfg => cfg ? localStorage.setItem(LS_SYNC, JSON.stringify(cfg)) : localStorage.removeItem(LS_SYNC);

let fbApp = null, fbDb = null, fbUnsub = null;
let syncDebounceHandle = null;
let lastSyncPushAt = 0;
let lastAppliedSyncAt = 0;
let connectedSyncCode = null;
let applyingRemoteSync = false;

function setSyncStatusUI(state, detail) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  const map = {
    off:       { text: "⚪ Synchronisation non configurée", cls: "" },
    connected: { text: "🟢 Connecté — synchronisation active", cls: "connected" },
    syncing:   { text: "🔄 Synchronisation…", cls: "syncing" },
    error:     { text: "🔴 Erreur : " + (detail || "voir console"), cls: "error" }
  };
  const s = map[state] || map.off;
  el.textContent = s.text;
  el.className = "sync-status " + s.cls;
}

function syncDocRef(code) {
  return fbDb.collection("kpi_sync").doc(code);
}

function buildSyncPayload() {
  const favoritesByUser = JSON.parse(localStorage.getItem("kpiSyncFavorites") || "{}");
  favoritesByUser[currentUser] = favorites;
  localStorage.setItem("kpiSyncFavorites", JSON.stringify(favoritesByUser));
  // On envoie les fiches d'origine + les surcharges séparément,
  // pour que "Restaurer l'original" fonctionne sur tous les appareils
  return {
    kpiData: [...excelData, ...manualEntries],
    kpiOverrides: overrides,
    kpiDeleted: deletedIds,
    favoritesByUser,
    updatedAt: Date.now()
  };
}

function scheduleAutoSync() {
  const cfg = getSyncConfig();
  if (!cfg || !cfg.enabled || !fbDb || applyingRemoteSync) return;
  clearTimeout(syncDebounceHandle);
  syncDebounceHandle = setTimeout(() => pushToCloud(false), 1500);
}

async function pushToCloud(manual) {
  const cfg = getSyncConfig();
  if (!cfg || !fbDb) return;
  setSyncStatusUI("syncing");
  try {
    const payload = buildSyncPayload();
    lastSyncPushAt = payload.updatedAt;
    await syncDocRef(cfg.code).set(payload);
    setSyncStatusUI("connected");
    if (manual) showToast("Synchronisé ☁️ — données envoyées", 2500);
  } catch (err) {
    setSyncStatusUI("error", err.message);
    if (manual) showToast("❌ Erreur de synchronisation", 3000);
  }
}

function applyRemoteData(payload, fromSync) {
  applyingRemoteSync = true;
  if (Array.isArray(payload.kpiData)) {
    excelData     = payload.kpiData.filter(d => !d.manual);
    manualEntries = payload.kpiData.filter(d => d.manual);
    saveManualEntries(false);
  }
  if (payload.kpiOverrides && typeof payload.kpiOverrides === "object") {
    overrides = payload.kpiOverrides;
    saveOverrides(false);
  }
  if (Array.isArray(payload.kpiDeleted)) {
    deletedIds = payload.kpiDeleted;
    saveDeletedIds(false);
  }
  if (payload.favoritesByUser) {
    localStorage.setItem("kpiSyncFavorites", JSON.stringify(payload.favoritesByUser));
    if (payload.favoritesByUser[currentUser]) {
      favorites = payload.favoritesByUser[currentUser];
      saveFavoritesLocalOnly();
    }
  }
  rebuildData(false);
  applyingRemoteSync = false;
  if (!fromSync) showToast("✅ Données récupérées depuis le cloud", 2500);
}

// Sauvegarde locale des favoris SANS redéclencher une synchronisation (évite les boucles)
function saveFavoritesLocalOnly() {
  localStorage.setItem("kpiFav_" + currentUser, JSON.stringify(favorites));
}

async function pullFromCloud(manual) {
  const cfg = getSyncConfig();
  if (!cfg || !fbDb) return;
  setSyncStatusUI("syncing");
  try {
    const snap = await syncDocRef(cfg.code).get();
    if (!snap.exists) {
      setSyncStatusUI("connected");
      if (manual) showToast("Aucune donnée cloud pour ce code", 2800);
      return;
    }
    applyRemoteData(snap.data(), false);
    setSyncStatusUI("connected");
  } catch (err) {
    setSyncStatusUI("error", err.message);
    if (manual) showToast("❌ Erreur de synchronisation", 3000);
  }
}

function listenForRemoteChanges(code) {
  if (fbUnsub) { fbUnsub(); fbUnsub = null; }
  fbUnsub = syncDocRef(code).onSnapshot(
    snap => {
      if (!snap.exists) return;
      const payload = snap.data();
      if (!payload || !payload.updatedAt) return;
      if (payload.updatedAt === lastSyncPushAt || payload.updatedAt === lastAppliedSyncAt) return;
      lastAppliedSyncAt = payload.updatedAt;
      applyRemoteData(payload, true);
      showToast("☁️ Données mises à jour depuis un autre appareil", 2800);
    },
    err => setSyncStatusUI("error", err.message)
  );
}

function connectSync(manual) {
  try {
    const cfg = getSyncConfig();
    if (!cfg || !cfg.config || !cfg.code) { setSyncStatusUI("off"); return; }
    if (typeof firebase === "undefined") {
      setSyncStatusUI("error", "Librairie Firebase non chargée (vérifiez votre connexion).");
      return;
    }
    if (fbDb && fbUnsub && connectedSyncCode === cfg.code) {
      setSyncStatusUI("connected");
      if (manual) showToast("Déjà connecté ☁️", 2200);
      return;
    }
    if (!fbApp) {
      fbApp = firebase.apps && firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(cfg.config);
      fbDb  = firebase.firestore();
    }
    listenForRemoteChanges(cfg.code);
    connectedSyncCode = cfg.code;
    setSyncStatusUI("connected");
    if (manual) showToast("Connecté ☁️ — code : " + cfg.code, 2800);
  } catch (err) {
    console.error("connectSync error:", err);
    setSyncStatusUI("error", err.message);
    if (manual) showToast("❌ Échec de connexion", 3000);
  }
}

function disconnectSync() {
  if (fbUnsub) { fbUnsub(); fbUnsub = null; }
  connectedSyncCode = null;
  setSyncConfig(null);
  setSyncStatusUI("off");
  showToast("Synchronisation désactivée", 2200);
}

function initSyncModal() {
  const cfg = getSyncConfig();
  document.getElementById("syncConfigInput").value = cfg?.config ? JSON.stringify(cfg.config, null, 2) : "";
  document.getElementById("syncCodeInput").value   = cfg?.code || "";
  document.getElementById("syncEnabledToggle").checked = !!cfg?.enabled;
  if (cfg && cfg.config && cfg.code) connectSync(false); else setSyncStatusUI("off");
}

syncSettingsBtn?.addEventListener("click", () => {
  initSyncModal();
  syncModal.classList.remove("hidden");
});
closeSyncModalBtn?.addEventListener("click", () => syncModal.classList.add("hidden"));
syncModal?.addEventListener("click", e => { if (e.target === syncModal) syncModal.classList.add("hidden"); });

document.getElementById("connectSyncBtn")?.addEventListener("click", () => {
  let parsedConfig;
  try {
    parsedConfig = JSON.parse(document.getElementById("syncConfigInput").value.trim());
  } catch {
    return showToast("❌ Configuration invalide (JSON)", 3000);
  }
  const code = document.getElementById("syncCodeInput").value.trim();
  if (!code) return showToast("Choisissez un code de synchronisation", 2800);

  fbApp = null; fbDb = null; connectedSyncCode = null;
  setSyncConfig({ config: parsedConfig, code, enabled: true });
  connectSync(true);
});

document.getElementById("syncEnabledToggle")?.addEventListener("change", function () {
  const c = getSyncConfig();
  if (!c) return;
  c.enabled = this.checked;
  setSyncConfig(c);
  showToast(c.enabled ? "Synchronisation activée" : "Synchronisation en pause", 2200);
});

document.getElementById("pushSyncBtn")?.addEventListener("click", () => pushToCloud(true));
document.getElementById("pullSyncBtn")?.addEventListener("click", () => {
  if (confirm("Ceci va remplacer vos données locales par celles du cloud. Continuer ?")) pullFromCloud(true);
});
document.getElementById("disconnectSyncBtn")?.addEventListener("click", () => {
  if (confirm("Désactiver la synchronisation cloud sur cet appareil ?")) disconnectSync();
});

/* ============================================
   PWA : service worker
============================================ */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js")
      .then(() => console.log("✅ Service worker enregistré"))
      .catch(err => console.warn("Service worker non enregistré :", err));
  });
}

/* ============================================
   AUTO-LOGIN (session mémorisée)
   Placé tout à la fin, après tous les boutons : une erreur ici
   (réseau, sync mal configurée…) ne peut plus jamais bloquer l'UI.
============================================ */
if (currentUser) {
  try {
    login(currentUser);
  } catch (err) {
    console.error("Erreur lors de la reconnexion automatique :", err);
    showToast("⚠️ Erreur au chargement — réessayez de vous connecter");
    loginScreen.style.display = "flex";
    appShell.style.display = "none";
  }
}
