/* ============================================
   ÉTAT GLOBAL
============================================ */
let data = [];          // Liste affichée = excelData (+ surcharges) + manualEntries
let excelData = [];     // KPIs issus du fichier Excel (version d'origine, jamais modifiée)
let manualEntries = []; // KPIs créés directement dans l'application (partagés)
let personalEntries = []; // Signets personnels de l'utilisateur (locaux, jamais synchronisés)
let overrides = {};     // Modifications apportées aux KPIs Excel, par id
let deletedIds = [];    // Fiches Excel supprimées : [{id, title, freq, at, by}]

function isDeleted(id) { return isDeletedIn(deletedIds, id); }

// Enregistre un marqueur de suppression daté (unique point d'entrée).
// Indispensable avec la fusion : sans marqueur, la fiche serait ressuscitée
// par la version encore présente sur le cloud ou un autre poste.
function markDeleted(id, kpi) {
  deletedIds = deletedIds.filter(d => d.id !== id);
  deletedIds.push({
    id,
    title: (kpi && kpi.title) || "",
    freq:  (kpi && kpi.freq)  || "",
    at: now(), by: currentUser || "?", state: "deleted"
  });
}

// Fiches purgées définitivement : masquées pour toujours, plus listées dans la corbeille
let purgedIds = [];
function loadPurged() {
  try { purgedIds = JSON.parse(localStorage.getItem("kpiPurgedIds")) || []; }
  catch { purgedIds = []; }
}
function savePurged(sync = true) {
  localStorage.setItem("kpiPurgedIds", JSON.stringify(purgedIds));
  if (sync) scheduleAutoSync();
}
function isPurged(id) { return purgedIds.includes(id); }

/* ============================================
   JOURNAL D'ACTIVITÉ (qui a fait quoi, quand)
============================================ */
const LS_ACTIVITY = "kpiActivity";
const MAX_ACTIVITY = 400;
let activityLog = [];

function loadActivity() {
  try { activityLog = JSON.parse(localStorage.getItem(LS_ACTIVITY)) || []; }
  catch { activityLog = []; }
}
function saveActivity(sync = true) {
  localStorage.setItem(LS_ACTIVITY, JSON.stringify(activityLog));
  if (sync) scheduleAutoSync();
}
// action : "create" | "update" | "delete" | "restore"
function logActivity(action, title, detail, space) {
  activityLog.unshift({
    at: now(),
    by: currentUser || "?",
    action,
    title: title || "",
    detail: detail || "",
    space: space || "shared"
  });
  while (activityLog.length > MAX_ACTIVITY) activityLog.pop();
  saveActivity(false); // l'appelant déclenche la synchro
}
let currentUser = localStorage.getItem("kpiUser");
let favorites = [];
let currentView = "all"; // "all" | "fav"
let editingKpiId = null; // id de référence du KPI en cours d'édition (pour Supprimer/Restaurer)

// ─── État de la modale multi-temporalités ───
const STD_FREQS = ["Mensuelle", "Hebdomadaire", "Quotidienne"];
let modalSlots = {};        // freq → { id, active, ritual, links:{siteKey:url} }

// ─── Sites configurables (périmètres) ───
const SITE_PALETTE = ["#0891B2", "#059669", "#D97706", "#64748B", "#7C3AED", "#DB2777", "#0D9488", "#B45309", "#4F46E5", "#BE123C"];
const DEFAULT_SITES = [
  { key: "logistiport", name: "Logistiport",  badge: "LOG",    color: "#0891B2" },
  { key: "armement",    name: "MG + Débords", badge: "MG+D",   color: "#059669" },
  { key: "armateur",    name: "Armateur",     badge: "ATEUR",  color: "#D97706" },
  { key: "global",      name: "Global",       badge: "GLOBAL", color: "#64748B" }
];
let sites = [];

function loadSites() {
  try { sites = JSON.parse(localStorage.getItem("kpiSites")); } catch { sites = null; }
  if (!Array.isArray(sites) || !sites.length) sites = JSON.parse(JSON.stringify(DEFAULT_SITES));
}
function saveSites(sync = true) {
  localStorage.setItem("kpiSites", JSON.stringify(sites));
  if (sync) scheduleAutoSync();
}
function siteBadgeLabel(s) { return (s.badge || s.name || "").toUpperCase().slice(0, 8); }

// Sites réellement visibles (hors marqueurs de suppression), dans l'ordre.
// `sites` peut contenir des sites _dele:true conservés pour la synchro.
function activeSites() { return sites.filter(s => s && !s._deleted); }
let modalCurrentFreq = "Mensuelle";
let modalExtraVariants = []; // variantes de fréquence non-standard, préservées telles quelles
let modalInitialIds = {};   // freq → id d'origine (pour détecter les suppressions)

// Classe un id : "excel", "manual", "perso" ou null
function classifyId(id) {
  if (excelData.some(k => k.id === id)) return "excel";
  if (personalEntries.some(k => k.id === id)) return "perso";
  if (manualEntries.some(k => k.id === id)) return "manual";
  return null;
}

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
  loadSites();
  loadManualEntries();
  loadPersonalEntries();
  loadOverrides();
  loadDeletedIds();
  loadPurged();
  loadActivity();
  loadSavedFile();

  try { connectSync(false); } catch (err) { console.error("connectSync (login) error:", err); }

  // Le chargement est terminé : les modifications suivantes sont de vraies actions utilisateur
  setTimeout(() => { isBooting = false; }, 2500);
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
  personalEntries = [];
  personalTrash = [];
  overrides = {};
  deletedIds = [];
  purgedIds = [];
  activityLog = [];
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

// Enregistre les favoris en local SANS déclencher de synchronisation.
// Utilisée quand la synchro est gérée séparément (réception cloud, suppression
// de fiche) pour éviter une double synchro ou une boucle.
function saveFavoritesLocalOnly() {
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
  touchMeta("favAt");
  saveFavorites();
  updateCounts();
  animateNextRender = false;
  filterData();
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
    try {
      const u8 = new Uint8Array(buf);
      let bin = ""; const CH = 0x8000;
      for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
      localStorage.setItem("kpiFileB64", btoa(bin));
      localStorage.removeItem("kpiFile"); // ancien format volumineux
    } catch (err) {
      showToast("⚠️ Fichier trop volumineux pour être conservé localement", 3500);
    }
    touchMeta("excelAt");            // ce bloc Excel devient le plus récent
    loadWorkbook(buf);
    showToast("✅ Fichier importé");
  };
  reader.readAsArrayBuffer(file);
});

function loadSavedFile() {
  const b64 = localStorage.getItem("kpiFileB64");
  if (b64) {
    try {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      loadWorkbook(bytes);
      return;
    } catch (err) {
      console.warn("[Excel] Fichier local illisible (base64), tentative sur les autres sources.", err);
    }
  }
  const stored = localStorage.getItem("kpiFile"); // ancien format
  if (stored) {
    try {
      loadWorkbook(new Uint8Array(JSON.parse(stored)));
      return;
    } catch (err) {
      console.warn("[Excel] Fichier local illisible (ancien format).", err);
    }
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
    } catch (err) {
      console.warn("[Cache] Cache de données invalide, import requis.", err);
    }
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
  const links = {};
  const inc = (h, v) => v && h.includes(v.toLowerCase());
  headers.forEach((header, colIndex) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];
    if (cell && cell.l && cell.l.Target) {
      const url = cell.l.Target.replace(/&amp;/g, "&");
      const h = (header || "").toLowerCase();
      // 1) Correspondance avec un site configuré (nom, clé ou badge)
      let matched = sites.find(s => inc(h, s.name) || inc(h, s.key) || inc(h, s.badge));
      // 2) Repli sur les mots-clés historiques des sites par défaut
      if (!matched) {
        if (h.includes("log"))                               matched = sites.find(s => s.key === "logistiport");
        else if (h.includes("armement") || h.includes("mg")) matched = sites.find(s => s.key === "armement");
        else if (h.includes("armateur"))                     matched = sites.find(s => s.key === "armateur");
        else if (h.includes("global"))                       matched = sites.find(s => s.key === "global");
      }
      if (matched) links[matched.key] = url;
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
    .filter(d => !isDeleted(d.id) && !isPurged(d.id))
    .map(d => overrides[d.id] ? { ...d, ...overrides[d.id], edited: true } : d);
  // Les fiches manuelles supprimées restent stockées (pour la corbeille) mais sont masquées
  const manualVisible = manualEntries.filter(d => !isDeleted(d.id) && !isPurged(d.id));
  data = [...excelWithEdits, ...manualVisible];
  initFilters();
  updateCounts();
  // Une mise à jour (sync=true) ou une synchro distante ne doit pas rejouer l'animation d'entrée
  if (sync || applyingRemoteSync) animateNextRender = false;
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
   ESPACE PERSONNEL
   Signets propres à l'utilisateur connecté :
   stockés en local par identifiant, jamais envoyés
   dans la synchronisation cloud partagée.
============================================ */
function loadPersonalEntries() {
  try {
    personalEntries = JSON.parse(localStorage.getItem("kpiPersonal_" + currentUser)) || [];
  } catch { personalEntries = []; }
  loadPersonalTrash();
}

function savePersonalEntries() {
  localStorage.setItem("kpiPersonal_" + currentUser, JSON.stringify(personalEntries));
}

// Corbeille personnelle : propre à chaque utilisateur, stockée en local,
// JAMAIS synchronisée (comme les fiches personnelles elles-mêmes).
let personalTrash = [];
function loadPersonalTrash() {
  try {
    personalTrash = JSON.parse(localStorage.getItem("kpiPersonalTrash_" + currentUser)) || [];
  } catch { personalTrash = []; }
}
function savePersonalTrash() {
  localStorage.setItem("kpiPersonalTrash_" + currentUser, JSON.stringify(personalTrash));
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
  saveOverrides(false);
  logActivity("restore", original ? original.title : id, "version d'origine rétablie");
  rebuildData(true);
  showToast("↩ Version d'origine restaurée");
}

/* ============================================
   SUPPRESSION DES FICHES EXCEL (masquage persistant)
============================================ */
function loadDeletedIds() {
  try {
    deletedIds = normalizeDeleted(JSON.parse(localStorage.getItem("kpiDeletedIds")));
  } catch { deletedIds = []; }
}

function saveDeletedIds(sync = true) {
  localStorage.setItem("kpiDeletedIds", JSON.stringify(deletedIds));
  if (sync) scheduleAutoSync();
}



// Point d'entrée unique de la corbeille sur les cartes.
// Supprime TOUTE la fiche : toutes les temporalités portant le même intitulé,
// dans le même espace (partagé ou personnel), pas seulement la variante affichée.
function deleteKPI(id) {
  const ref = data.find(k => k.id === id) || personalEntries.find(k => k.id === id);
  if (!ref) return;
  const key = titleKey(ref.title);
  const isPersonal = personalEntries.some(k => k.id === id);
  const source = isPersonal ? personalEntries : data;

  // Toutes les variantes (temporalités) de cette fiche dans le même espace
  const group = source.filter(k => titleKey(k.title) === key);
  const freqs = group.map(k => k.freq).filter(Boolean);

  const nbTemp = group.length;
  const detail = nbTemp > 1
    ? `\n\nCette fiche contient ${nbTemp} temporalités (${freqs.join(", ")}). Toutes seront supprimées.`
    : "";
  const suffix = isPersonal ? "" : "\n\nElle restera masquée même après un ré-import Excel. Vous pourrez la réafficher depuis « Corbeille ».";
  if (!confirm(`Supprimer la fiche « ${ref.title} » ?${detail}${suffix}`)) return;

  let touchedShared = false, touchedPerso = false;
  const deletedAt = now();
  group.forEach(v => {
    const kind = classifyId(v.id);
    if (kind === "perso") {
      // On déplace la fiche dans la corbeille personnelle (au lieu de l'effacer)
      personalEntries = personalEntries.filter(k => k.id !== v.id);
      personalTrash.push({ ...v, _deletedAt: deletedAt });
      touchedPerso = true;
    } else if (kind === "excel") {
      markDeleted(v.id, v);
      delete overrides[v.id];
      touchedShared = true;
    } else { // manual
      markDeleted(v.id, v);
      touchedShared = true;
    }
    favorites = favorites.filter(f => f !== v.id);
  });

  saveFavoritesLocalOnly();
  if (touchedPerso) { savePersonalEntries(); savePersonalTrash(); }
  if (touchedShared) { saveOverrides(false); saveDeletedIds(false); saveManualEntries(false); }
  logActivity("delete", ref.title, nbTemp > 1 ? `fiche entière (${nbTemp} temporalités : ${freqs.join(", ")})` : "");
  rebuildData(true);
  showToast(nbTemp > 1 ? `🗑 Fiche supprimée (${nbTemp} temporalités)` : "🗑 Fiche supprimée");
}

function updateRestoreDeletedBtn() {
  const btn = document.getElementById("restoreDeletedBtn");
  const label = document.getElementById("restoreDeletedLabel");
  if (!btn) return;
  const active = deletedIds.filter(d => d.state !== "restored");
  const sharedFiches = new Set(active.map(d => titleKey(d.title))).size;
  const persoFiches  = new Set(personalTrash.map(v => titleKey(v.title))).size;
  const nbFiches = sharedFiches + persoFiches;
  btn.style.display = nbFiches ? "" : "none";
  if (label) label.textContent = `Corbeille (${nbFiches})`;
}

/* ============================================
   CORBEILLE : liste des fiches supprimées
============================================ */
function fmtDate(ts) {
  if (!ts) return "date inconnue";
  const d = new Date(ts);
  return d.toLocaleDateString("fr-FR") + " à " + d.toLocaleTimeString("fr-FR").slice(0, 5);
}

function renderTrashList() {
  const el = document.getElementById("trashList");
  if (!el) return;
  const active = deletedIds.filter(d => d.state !== "restored");
  if (!active.length && !personalTrash.length) {
    el.innerHTML = `<p class="modal-hint" style="margin:0">La corbeille est vide.</p>`;
    return;
  }
  // Regroupe les temporalités supprimées par intitulé : une seule ligne par fiche
  const groups = new Map();

  // Fiches partagées (annuaire)
  active.forEach(d => {
    const orig = excelData.find(k => k.id === d.id) || manualEntries.find(k => k.id === d.id);
    const title = d.title || (orig ? orig.title : d.id);
    const key = "shared:" + titleKey(title);
    if (!groups.has(key)) groups.set(key, { title, ids: [], freqs: [], at: 0, by: "", perso: false });
    const g = groups.get(key);
    g.ids.push(d.id);
    if (d.freq || (orig && orig.freq)) g.freqs.push(d.freq || orig.freq);
    if ((d.at || 0) >= g.at) { g.at = d.at || 0; g.by = d.by || ""; }
  });

  // Fiches personnelles (visibles seulement par l'utilisateur courant)
  personalTrash.forEach(v => {
    const key = "perso:" + titleKey(v.title);
    if (!groups.has(key)) groups.set(key, { title: v.title, ids: [], freqs: [], at: 0, by: "", perso: true });
    const g = groups.get(key);
    g.ids.push(v.id);
    if (v.freq) g.freqs.push(v.freq);
    if ((v._deletedAt || 0) >= g.at) g.at = v._deletedAt || 0;
  });

  const rows = [...groups.values()].sort((a, b) => (b.at || 0) - (a.at || 0));
  el.innerHTML = "";
  rows.forEach(g => {
    const nb = g.ids.length;
    const tempTxt = nb > 1
      ? `${nb} temporalités (${g.freqs.join(", ")}) · `
      : (g.freqs[0] ? esc(g.freqs[0]) + " · " : "");
    const auteur = g.perso ? "" : (g.by ? " par " + esc(g.by) : "");
    const row = document.createElement("label");
    row.className = "trash-row";
    row.innerHTML = `
      <input type="checkbox" class="trash-check" data-ids="${esc(g.ids.join(","))}" data-perso="${g.perso ? "1" : "0"}">
      <div class="trash-info">
        <b>${g.perso ? "🔒 " : ""}${esc(g.title)}</b>
        <span>${tempTxt}supprimée le ${fmtDate(g.at)}${auteur}</span>
      </div>`;
    el.appendChild(row);
  });
}

function openTrashModal() {
  renderTrashList();
  document.getElementById("trashModal").classList.remove("hidden");
}
function closeTrashModal() { document.getElementById("trashModal").classList.add("hidden"); }

function restoreSelectedTrash() {
  const sel = getTrashSelection();
  if (!sel.length) { showToast("Sélectionnez au moins une fiche", 2400); return; }

  // Sépare les identifiants partagés des identifiants personnels
  const personalIds = personalTrash.filter(v => sel.includes(v.id)).map(v => v.id);
  const sharedIds   = sel.filter(id => !personalIds.includes(id));

  const titres = new Set();

  // Fiches partagées : marqueur « restauré » daté (converge en synchro)
  const restoredShared = deletedIds.filter(d => sharedIds.includes(d.id));
  restoredShared.forEach(d => titres.add(d.title));
  if (sharedIds.length) {
    deletedIds = deletedIds.map(d => sharedIds.includes(d.id)
      ? { ...d, state: "restored", at: now(), by: currentUser || "?" }
      : d);
    saveDeletedIds(false);
  }

  // Fiches personnelles : on les ressort de la corbeille locale
  if (personalIds.length) {
    const back = personalTrash.filter(v => personalIds.includes(v.id));
    back.forEach(v => {
      titres.add(v.title);
      const { _deletedAt, ...clean } = v;
      personalEntries.push(clean);
    });
    personalTrash = personalTrash.filter(v => !personalIds.includes(v.id));
    savePersonalEntries();
    savePersonalTrash();
  }

  const nbFiches = new Set([...titres].map(t => titleKey(t))).size;
  [...titres].forEach(t => logActivity("restore", t, "fiche réaffichée"));
  rebuildData(true);
  renderTrashList();
  showToast(`✅ ${nbFiches} fiche${nbFiches > 1 ? "s" : ""} réaffichée${nbFiches > 1 ? "s" : ""}`);
  const stillShared = deletedIds.some(d => d.state !== "restored");
  if (!stillShared && !personalTrash.length) closeTrashModal();
}

function getTrashSelection() {
  // Chaque case cochée regroupe toutes les temporalités d'une fiche
  const ids = [];
  document.querySelectorAll("#trashList .trash-check:checked").forEach(c => {
    (c.dataset.ids || "").split(",").filter(Boolean).forEach(id => ids.push(id));
  });
  return ids;
}

// Suppression définitive : la fiche disparaît de la corbeille et ne reviendra plus,
// même après un ré-import du fichier Excel.
function purgeSelectedTrash() {
  const sel = getTrashSelection();
  if (!sel.length) { showToast("Sélectionnez au moins une fiche", 2400); return; }

  const personalIds = personalTrash.filter(v => sel.includes(v.id)).map(v => v.id);
  const sharedIds   = sel.filter(id => !personalIds.includes(id));

  const targetsShared = deletedIds.filter(d => sharedIds.includes(d.id));
  const targetsPerso  = personalTrash.filter(v => personalIds.includes(v.id));
  const allTargets = [...targetsShared, ...targetsPerso];
  const noms = allTargets.slice(0, 5).map(d => "• " + (d.title || d.id)).join("\n");
  if (!confirm(
    `Supprimer DÉFINITIVEMENT ${allTargets.length} élément${allTargets.length > 1 ? "s" : ""} ?\n\n` +
    noms + (allTargets.length > 5 ? `\n… et ${allTargets.length - 5} autre(s)` : "") +
    "\n\nIls quitteront la corbeille et ne réapparaîtront plus, même après un ré-import Excel. " +
    "Cette action est irréversible."
  )) return;

  // Partagées : marquées purgées + retirées des données
  if (sharedIds.length) {
    sharedIds.forEach(id => { if (!purgedIds.includes(id)) purgedIds.push(id); });
    deletedIds = deletedIds.filter(d => !sharedIds.includes(d.id));
    excelData  = excelData.filter(k => !sharedIds.includes(k.id));
    sharedIds.forEach(id => delete overrides[id]);
    favorites = favorites.filter(f => !sharedIds.includes(f));
    savePurged(false);
    saveDeletedIds(false);
    saveOverrides(false);
  }
  // Personnelles : simplement effacées de la corbeille locale
  if (personalIds.length) {
    personalTrash = personalTrash.filter(v => !personalIds.includes(v.id));
    savePersonalTrash();
  }

  saveFavoritesLocalOnly();
  allTargets.forEach(d => logActivity("purge", d.title || d.id, "suppression définitive"));
  rebuildData(true);
  renderTrashList();
  showToast(`🔥 ${allTargets.length} élément${allTargets.length > 1 ? "s" : ""} définitivement supprimé${allTargets.length > 1 ? "s" : ""}`, 3000);
  if (!deletedIds.some(d => d.state !== "restored") && !personalTrash.length) closeTrashModal();
}

document.getElementById("restoreDeletedBtn")?.addEventListener("click", openTrashModal);
document.getElementById("purgeSelectedBtn")?.addEventListener("click", purgeSelectedTrash);document.getElementById("closeTrashModalBtn")?.addEventListener("click", closeTrashModal);
document.getElementById("cancelTrashBtn")?.addEventListener("click", closeTrashModal);
document.getElementById("restoreSelectedBtn")?.addEventListener("click", restoreSelectedTrash);
document.getElementById("trashSelectAll")?.addEventListener("click", () => {
  const boxes = document.querySelectorAll("#trashList .trash-check");
  const allChecked = Array.from(boxes).every(b => b.checked);
  boxes.forEach(b => b.checked = !allChecked);
});
document.getElementById("trashModal")?.addEventListener("click", e => {
  if (e.target === document.getElementById("trashModal")) closeTrashModal();
});

/* ============================================
   HISTORIQUE D'ACTIVITÉ (interface)
============================================ */
const ACTION_META = {
  create:  { icon: "➕", label: "Création",     cls: "act-create" },
  update:  { icon: "✏️", label: "Modification", cls: "act-update" },
  delete:  { icon: "🗑", label: "Suppression",  cls: "act-delete" },
  restore: { icon: "↩",  label: "Restauration", cls: "act-restore" },
  purge:   { icon: "🔥", label: "Suppression définitive", cls: "act-purge" }
};

function renderHistoryList() {
  const el = document.getElementById("historyList");
  if (!el) return;
  const fa = document.getElementById("historyActionFilter").value;
  const fu = document.getElementById("historyUserFilter").value;

  const rows = activityLog.filter(e => (!fa || e.action === fa) && (!fu || e.by === fu));
  if (!rows.length) {
    el.innerHTML = `<p class="modal-hint" style="margin:0">Aucune activité enregistrée${(fa || fu) ? " pour ce filtre" : " pour l'instant"}.</p>`;
    return;
  }
  el.innerHTML = "";
  rows.forEach(e => {
    const m = ACTION_META[e.action] || { icon: "•", label: e.action, cls: "" };
    const row = document.createElement("div");
    row.className = "history-row " + m.cls;
    row.innerHTML = `
      <span class="hist-icon">${m.icon}</span>
      <div class="hist-info">
        <b>${esc(e.title || "(sans titre)")}</b>
        <span>${m.label}${e.detail ? " · " + esc(e.detail) : ""}${e.space === "perso" ? " · espace personnel" : ""}</span>
      </div>
      <div class="hist-meta">
        <b>${esc(e.by || "?")}</b>
        <span>${fmtDate(e.at)}</span>
      </div>`;
    el.appendChild(row);
  });
}

function refreshHistoryUserFilter() {
  const sel = document.getElementById("historyUserFilter");
  if (!sel) return;
  const prev = sel.value;
  const users = [...new Set(activityLog.map(e => e.by).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">Tous les utilisateurs</option>`;
  users.forEach(u => {
    const o = document.createElement("option");
    o.value = o.textContent = u;
    sel.appendChild(o);
  });
  if (users.includes(prev)) sel.value = prev;
}

function openHistoryModal() {
  refreshHistoryUserFilter();
  renderHistoryList();
  document.getElementById("historyModal").classList.remove("hidden");
}
function closeHistoryModal() { document.getElementById("historyModal").classList.add("hidden"); }

function exportHistoryCsv() {
  if (!activityLog.length) { showToast("Historique vide", 2200); return; }
  const esc2 = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["Date;Utilisateur;Action;Fiche;Détail;Espace"];
  activityLog.forEach(e => {
    const m = ACTION_META[e.action] || { label: e.action };
    lines.push([fmtDate(e.at), e.by, m.label, e.title, e.detail, e.space === "perso" ? "personnel" : "partagé"]
      .map(esc2).join(";"));
  });
  // BOM pour qu'Excel ouvre correctement les accents
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `annuaire-kpi-historique-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast("💾 Historique exporté", 2500);
}

document.getElementById("historyBtn")?.addEventListener("click", openHistoryModal);
document.getElementById("closeHistoryModalBtn")?.addEventListener("click", closeHistoryModal);
document.getElementById("closeHistoryBtn2")?.addEventListener("click", closeHistoryModal);
document.getElementById("historyActionFilter")?.addEventListener("change", renderHistoryList);
document.getElementById("historyUserFilter")?.addEventListener("change", renderHistoryList);
document.getElementById("exportHistoryBtn")?.addEventListener("click", exportHistoryCsv);
document.getElementById("clearHistoryBtn")?.addEventListener("click", () => {
  if (!confirm("Vider tout l'historique d'activité ?\n\nCette action est définitive et s'appliquera aux appareils synchronisés.")) return;
  activityLog = [];
  saveActivity(true);
  renderHistoryList();
  refreshHistoryUserFilter();
  showToast("🧹 Historique vidé");
});
document.getElementById("historyModal")?.addEventListener("click", e => {
  if (e.target === document.getElementById("historyModal")) closeHistoryModal();
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
  fill("typeList",    [...data, ...personalEntries].map(d => d.type));
  fill("processList", [...data, ...personalEntries].map(d => d.process));
  fill("ritualList",  [...data, ...personalEntries].map(d => d.ritual));
}

function emptySlot() {
  return { id: null, active: false, ritual: "", links: {} };
}

// Construit les champs de liens dans la modale à partir de la liste des sites
function buildLinkFields() {
  const grid = document.getElementById("kpiLinksGrid");
  if (!grid) return;
  grid.innerHTML = activeSites().map(s => `
    <div>
      <label class="modal-label" for="kpiLink_${esc(s.key)}">
        <span class="link-swatch" style="background:${esc(s.color || "#64748B")}"></span>${esc(s.name)}
      </label>
      <input type="url" id="kpiLink_${esc(s.key)}" data-site="${esc(s.key)}" class="modal-input" placeholder="https://…">
    </div>`).join("");
}

function openKpiModal(id = null) {
  editingKpiId = id;
  const ref = id ? (data.find(k => k.id === id) || personalEntries.find(k => k.id === id)) : null;
  const isPersonal = !!(ref && personalEntries.some(k => k.id === id));

  // Rassemble toutes les temporalités du même intitulé, dans le même espace
  const key = ref ? titleKey(ref.title) : null;
  const groupSource = isPersonal ? personalEntries : data; // data = excel(+surcharges) + manuels
  const group = key ? groupSource.filter(k => titleKey(k.title) === key) : [];

  // Espace du groupe : excel (verrouillé partagé), perso, ou manuel (déplaçable)
  const hasExcel = group.some(k => classifyId(k.id) === "excel");
  const groupSpace = isPersonal ? "perso" : "shared";

  document.getElementById("kpiModalTitle").textContent = ref ? "✏️ Modifier le KPI" : "➕ Nouveau KPI";

  // Sélecteur d'espace : masqué si le groupe contient de l'Excel (toujours partagé)
  const spaceRow = document.getElementById("kpiSpaceRow");
  const spaceInput = document.getElementById("kpiSpaceInput");
  spaceRow.style.display = hasExcel ? "none" : "";
  spaceInput.value = ref ? groupSpace : (currentView === "perso" ? "perso" : "shared");

  // Champs partagés (repris de la variante cliquée, sinon de la première)
  const base = ref || group[0] || {};
  document.getElementById("kpiTitleInput").value   = base.title   || "";
  document.getElementById("kpiTypeInput").value    = base.type    || "";
  document.getElementById("kpiProcessInput").value = base.process || "";
  document.getElementById("kpiDescInput").value    = base.desc    || "";

  // Prépare les emplacements par temporalité
  modalSlots = {};
  modalInitialIds = {};
  modalExtraVariants = [];
  STD_FREQS.forEach(f => { modalSlots[f] = emptySlot(); });

  group.forEach(v => {
    const f = STD_FREQS.find(sf => sf.toLowerCase() === (v.freq || "").toLowerCase().trim());
    if (f) {
      const links = {};
      activeSites().forEach(s => { if (v[s.key]) links[s.key] = v[s.key]; });
      modalSlots[f] = { id: v.id, active: true, ritual: v.ritual || "", links };
      modalInitialIds[f] = v.id;
    } else {
      // Fréquence non standard : préservée telle quelle, non éditable ici
      modalExtraVariants.push(v);
    }
  });

  // Temporalité affichée par défaut : celle cliquée si standard, sinon la 1ʳᵉ active, sinon Mensuelle
  const clickedFreq = ref && STD_FREQS.find(sf => sf.toLowerCase() === (ref.freq || "").toLowerCase().trim());
  modalCurrentFreq = clickedFreq || STD_FREQS.find(f => modalSlots[f].active) || "Mensuelle";

  // Nouveau KPI : on active la temporalité de départ pour qu'il y ait quelque chose à enregistrer
  if (!ref) modalSlots[modalCurrentFreq].active = true;

  // Pied de modale
  const isExcelRef = !!(id && excelData.some(k => k.id === id));
  document.getElementById("deleteKpiBtn").style.display = ref ? "" : "none";
  document.getElementById("restoreKpiBtn").style.display = (isExcelRef && overrides[id]) ? "" : "none";

  buildLinkFields();
  loadSlotIntoInputs(modalCurrentFreq);
  renderFreqTabs();
  fillDatalists();
  document.getElementById("kpiModal").classList.remove("hidden");
  document.getElementById("kpiTitleInput").focus();
}

// Charge les valeurs d'une temporalité dans les champs
function loadSlotIntoInputs(freq) {
  const slot = modalSlots[freq];
  document.getElementById("freqActiveToggle").checked = slot.active;
  document.getElementById("kpiRitualInput").value  = slot.ritual;
  activeSites().forEach(s => {
    const el = document.getElementById("kpiLink_" + s.key);
    if (el) el.value = (slot.links && slot.links[s.key]) || "";
  });
  document.getElementById("ritualScope").textContent = "(" + freq.toLowerCase() + ")";
  const ff = document.getElementById("freqFields");
  ff.style.opacity = slot.active ? "1" : "0.45";
  ff.style.pointerEvents = slot.active ? "" : "none";
}

// Sauvegarde les champs courants dans l'emplacement de la temporalité affichée
function syncInputsIntoSlot(freq) {
  const slot = modalSlots[freq];
  slot.active = document.getElementById("freqActiveToggle").checked;
  slot.ritual = document.getElementById("kpiRitualInput").value.trim();
  slot.links = {};
  activeSites().forEach(s => {
    const el = document.getElementById("kpiLink_" + s.key);
    const url = el ? normalizeUrl(el.value) : "";
    if (url) slot.links[s.key] = url;
  });
}

// Onglets de temporalité : état actif (coche) + onglet courant surligné
function renderFreqTabs() {
  document.querySelectorAll(".freq-tab").forEach(btn => {
    const f = btn.dataset.freq;
    btn.classList.toggle("current", f === modalCurrentFreq);
    btn.classList.toggle("has-data", modalSlots[f].active);
  });
}

function switchFreqTab(freq) {
  syncInputsIntoSlot(modalCurrentFreq);
  modalCurrentFreq = freq;
  loadSlotIntoInputs(freq);
  renderFreqTabs();
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

/**
 * Lit les champs communs de la modale (valables pour toutes les temporalités).
 * @returns {{title:string,type:string,process:string,desc:string}|null} null si l'intitulé manque
 */
function readSharedFields() {
  const title = document.getElementById("kpiTitleInput").value.trim();
  if (!title) {
    showToast("⚠️ L'intitulé est obligatoire", 2600);
    document.getElementById("kpiTitleInput").focus();
    return null;
  }
  return {
    title,
    type:    document.getElementById("kpiTypeInput").value.trim(),
    process: document.getElementById("kpiProcessInput").value.trim(),
    desc:    document.getElementById("kpiDescInput").value.trim()
  };
}

/**
 * Retire une temporalité décochée dans la modale.
 * Les fiches partagées reçoivent un marqueur daté (jamais de suppression
 * sèche, sinon la fusion les ferait réapparaître). Les fiches personnelles,
 * qui ne sont pas synchronisées, sont retirées directement.
 * @returns {{shared:boolean, perso:boolean}} espaces impactés
 */
function removeTemporality(initialId, kind) {
  const gone = data.find(k => k.id === initialId) ||
               manualEntries.find(k => k.id === initialId) ||
               excelData.find(k => k.id === initialId);
  if (kind === "excel") {
    markDeleted(initialId, gone);
    delete overrides[initialId];
    return { shared: true, perso: false };
  }
  if (kind === "manual") {
    markDeleted(initialId, gone);
    return { shared: true, perso: false };
  }
  if (kind === "perso") {
    personalEntries = personalEntries.filter(k => k.id !== initialId);
    return { shared: false, perso: true };
  }
  return { shared: false, perso: false };
}

/**
 * Crée ou met à jour une temporalité.
 * Une fiche Excel passe par une surcharge (l'original reste intact pour
 * survivre à un ré-import) ; les autres sont des fiches à part entière.
 * @returns {{shared:boolean, perso:boolean, isNew:boolean}}
 */
function upsertTemporality(freq, slot, initialId, kind, shared, space) {
  const fields = { ...shared, freq, ritual: slot.ritual };
  activeSites().forEach(s => { fields[s.key] = (slot.links && slot.links[s.key]) || ""; });

  if (kind === "excel" && space === "shared") {
    overrides[initialId] = stamp(fields);
    return { shared: true, perso: false, isNew: false };
  }

  const targetPerso = space === "perso";
  const entry = {
    id: initialId && kind !== "excel"
      ? initialId
      : ((targetPerso ? "perso_" : "manual_") + Date.now() + "_" + freq),
    manual: true,
    ...(targetPerso ? { personal: true } : {}),
    ...fields
  };
  stamp(entry);
  // Retire l'ancienne occurrence des deux espaces (gère le déplacement)
  manualEntries   = manualEntries.filter(k => k.id !== entry.id);
  personalEntries = personalEntries.filter(k => k.id !== entry.id);
  if (targetPerso) personalEntries.push(entry);
  else             manualEntries.push(entry);

  return { shared: !targetPerso, perso: targetPerso, isNew: !initialId };
}

/**
 * Enregistre le formulaire : parcourt les trois temporalités et applique
 * la création, la mise à jour ou le retrait de chacune, puis persiste,
 * journalise et resynchronise.
 */
function saveKpiForm() {
  const shared = readSharedFields();
  if (!shared) return;

  // Fige les valeurs de la temporalité affichée avant de tout parcourir
  syncInputsIntoSlot(modalCurrentFreq);
  const space = document.getElementById("kpiSpaceInput").value; // "shared" | "perso"

  const done = { created: [], updated: [], removed: [] };
  let touchesShared = false, touchesPerso = false;

  STD_FREQS.forEach(freq => {
    const slot = modalSlots[freq];
    const initialId = modalInitialIds[freq] || null;
    const kind = initialId ? classifyId(initialId) : null;

    if (!slot.active) {
      if (!initialId) return;                       // rien à retirer
      done.removed.push(freq);
      const t = removeTemporality(initialId, kind);
      touchesShared = touchesShared || t.shared;
      touchesPerso  = touchesPerso  || t.perso;
      favorites = favorites.filter(f => f !== initialId);
      saveFavoritesLocalOnly();
      return;
    }

    const t = upsertTemporality(freq, slot, initialId, kind, shared, space);
    touchesShared = touchesShared || t.shared;
    touchesPerso  = touchesPerso  || t.perso;
    (t.isNew ? done.created : done.updated).push(freq);
  });

  persistKpiChanges(touchesShared, touchesPerso, shared.title, space, done);
  closeKpiModal();
}

/** Persiste les espaces modifiés, journalise et notifie. */
function persistKpiChanges(touchesShared, touchesPerso, title, space, done) {
  if (touchesPerso)  savePersonalEntries();
  if (touchesShared) { saveManualEntries(false); saveOverrides(false); saveDeletedIds(false); }

  const spaceLabel = space === "perso" ? "perso" : "shared";
  const plural = n => n > 1 ? "s" : "";
  if (done.created.length)
    logActivity("create", title, `${done.created.length} temporalité${plural(done.created.length)} : ${done.created.join(", ")}`, spaceLabel);
  if (done.updated.length)
    logActivity("update", title, `${done.updated.length} temporalité${plural(done.updated.length)} : ${done.updated.join(", ")}`, spaceLabel);
  if (done.removed.length)
    logActivity("delete", title, `temporalité${plural(done.removed.length)} retirée${plural(done.removed.length)} : ${done.removed.join(", ")}`, spaceLabel);

  rebuildData(true);

  const parts = [];
  if (done.created.length) parts.push(`${done.created.length} créée${plural(done.created.length)}`);
  if (done.updated.length) parts.push(`${done.updated.length} modifiée${plural(done.updated.length)}`);
  if (done.removed.length) parts.push(`${done.removed.length} retirée${plural(done.removed.length)}`);
  showToast("✅ Temporalités : " + (parts.join(", ") || "aucun changement"), 2800);
}

function editKPI(id) { openKpiModal(id); }

/* ============================================
   GESTION DES SITES (périmètres configurables)
============================================ */
let sitesDraft = []; // copie de travail éditée dans la modale

function slugifySite(name) {
  const base = (name || "site").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "site";
  let key = base, n = 2;
  while (sitesDraft.some(s => s.key === key)) key = base + "_" + (n++);
  return key;
}

function renderSitesList() {
  const list = document.getElementById("sitesList");
  if (!list) return;
  list.innerHTML = "";
  sitesDraft.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "site-row";
    row.innerHTML = `
      <input type="color" class="site-color" value="${esc(s.color || "#64748B")}" title="Couleur">
      <input type="text" class="modal-input site-name" placeholder="Nom du site" value="${esc(s.name || "")}">
      <input type="text" class="modal-input site-badge" placeholder="Badge" value="${esc(s.badge || "")}" maxlength="8">
      <button type="button" class="btn-tool btn-tool-danger site-del" title="Supprimer ce site">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>`;
    row.querySelector(".site-color").addEventListener("input", e => sitesDraft[i].color = e.target.value);
    row.querySelector(".site-name").addEventListener("input",  e => sitesDraft[i].name  = e.target.value);
    row.querySelector(".site-badge").addEventListener("input", e => sitesDraft[i].badge = e.target.value);
    row.querySelector(".site-del").addEventListener("click", () => {
      if (confirm(`Supprimer le site « ${sitesDraft[i].name || "sans nom"} » ?\nLes liens déjà saisis pour ce site resteront masqués mais ne seront pas perdus.`)) {
        sitesDraft.splice(i, 1);
        renderSitesList();
      }
    });
    list.appendChild(row);
  });
}

function openSitesModal() {
  sitesDraft = JSON.parse(JSON.stringify(activeSites()));
  renderSitesList();
  document.getElementById("sitesModal").classList.remove("hidden");
}
function closeSitesModal() { document.getElementById("sitesModal").classList.add("hidden"); }

function saveSitesFromModal() {
  // Nettoie : nom obligatoire, clé stable conservée, badge/couleur par défaut si vide
  const cleaned = [];
  sitesDraft.forEach(s => {
    const name = (s.name || "").trim();
    if (!name) return; // ignore les lignes sans nom
    const key = s.key || slugifySite(name);
    // Reprend la date existante si le site est inchangé, sinon l'horodate maintenant
    const prev = sites.find(p => p.key === key);
    const changed = !prev || prev.name !== name ||
                    prev.badge !== ((s.badge || "").trim() || name.toUpperCase().slice(0, 6)) ||
                    prev.color !== (s.color || (prev && prev.color));
    cleaned.push({
      key,
      name,
      badge: (s.badge || "").trim() || name.toUpperCase().slice(0, 6),
      color: s.color || SITE_PALETTE[cleaned.length % SITE_PALETTE.length],
      _mtime: changed ? now() : (prev._mtime || now()),
      _deleted: false
    });
  });
  if (!cleaned.length) { showToast("⚠️ Gardez au moins un site", 2600); return; }

  // Sites retirés dans la modale : on les conserve comme marqueurs « supprimés »
  // datés, pour que la suppression se propage au lieu de « ressusciter » via l'autre poste.
  const keptKeys = new Set(cleaned.map(s => s.key));
  sites.forEach(old => {
    if (!keptKeys.has(old.key) && !old._deleted) {
      cleaned.push({ ...old, _deleted: true, _mtime: now() });
    } else if (!keptKeys.has(old.key) && old._deleted) {
      cleaned.push(old); // déjà supprimé, on garde le marqueur
    }
  });

  sites = cleaned;
  saveSites(true);
  rebuildData(true);       // rafraîchit les cartes avec les nouveaux périmètres
  // Si la modale KPI est ouverte, on régénère ses champs de liens
  if (!document.getElementById("kpiModal").classList.contains("hidden")) {
    syncInputsIntoSlot(modalCurrentFreq);
    buildLinkFields();
    loadSlotIntoInputs(modalCurrentFreq);
  }
  closeSitesModal();
  showToast("✅ Sites mis à jour");
}

document.getElementById("manageSitesBtn")?.addEventListener("click", openSitesModal);
document.getElementById("closeSitesModalBtn")?.addEventListener("click", closeSitesModal);
document.getElementById("cancelSitesBtn")?.addEventListener("click", closeSitesModal);
document.getElementById("saveSitesBtn")?.addEventListener("click", saveSitesFromModal);
document.getElementById("addSiteBtn")?.addEventListener("click", () => {
  const color = SITE_PALETTE[sitesDraft.length % SITE_PALETTE.length];
  sitesDraft.push({ key: slugifySite("site"), name: "", badge: "", color });
  renderSitesList();
});
document.getElementById("sitesModal")?.addEventListener("click", e => {
  if (e.target === document.getElementById("sitesModal")) closeSitesModal();
});
// Accès aussi depuis la modale KPI ("⚙ Gérer les sites")
document.getElementById("manageSitesBtn2")?.addEventListener("click", openSitesModal);



// Boutons d'ouverture / actions de la modale
document.getElementById("addKpiBtn")?.addEventListener("click", () => openKpiModal());
document.getElementById("fabAddBtn")?.addEventListener("click", () => openKpiModal());
document.getElementById("closeKpiModalBtn")?.addEventListener("click", closeKpiModal);
document.getElementById("cancelKpiBtn")?.addEventListener("click", closeKpiModal);
document.getElementById("saveKpiBtn")?.addEventListener("click", saveKpiForm);

// Onglets de temporalité dans la modale
document.querySelectorAll(".freq-tab").forEach(btn => {
  btn.addEventListener("click", () => switchFreqTab(btn.dataset.freq));
});
// Case « cette temporalité existe » : active/désactive les champs
document.getElementById("freqActiveToggle")?.addEventListener("change", function () {
  modalSlots[modalCurrentFreq].active = this.checked;
  const ff = document.getElementById("freqFields");
  ff.style.opacity = this.checked ? "1" : "0.45";
  ff.style.pointerEvents = this.checked ? "" : "none";
  renderFreqTabs();
});
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
    const prev = el.value; // conserve le filtre actif
    const first = el.options[0];
    el.innerHTML = "";
    el.appendChild(first);
    const values = [...new Set(arr.filter(Boolean))].sort();
    values.forEach(v => {
      const o = document.createElement("option");
      o.textContent = v;
      el.appendChild(o);
    });
    // Restaure la sélection si elle existe toujours
    if (prev && values.includes(prev)) el.value = prev;
  };
  makeOptions([...data, ...personalEntries].map(d => d.process), processFilter);
  makeOptions([...data, ...personalEntries].map(d => d.ritual),  ritualFilter);
}

function resetFilters() {
  searchInput.value = "";
  processFilter.selectedIndex = 0;
  ritualFilter.selectedIndex = 0;
  filterData();
  showToast("Filtres réinitialisés");
}

function getViewSource() {
  return currentView === "perso" ? personalEntries
       : currentView === "fav"   ? [...data, ...personalEntries]
       : data;
}

// Une variante correspond-elle aux filtres/recherche actifs ?
function variantMatches(d, s, p, r) {
  if (currentView === "fav" && !isFavorite(d.id)) return false;
  return (!p || d.process === p) &&
         (!r || d.ritual === r) &&
         (!s ||
           (d.title   || "").toLowerCase().includes(s) ||
           (d.desc    || "").toLowerCase().includes(s) ||
           (d.ritual  || "").toLowerCase().includes(s) ||
           (d.process || "").toLowerCase().includes(s) ||
           (d.type    || "").toLowerCase().includes(s));
}

function filterData() {
  const s = searchInput.value.toLowerCase().trim();
  const p = processFilter.value;
  const r = ritualFilter.value;

  // Regroupe TOUTES les temporalités par intitulé : le KPI reste entier
  const groupsMap = new Map();
  getViewSource().forEach(k => {
    const key = titleKey(k.title);
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(k);
  });

  // Conserve les groupes dont au moins une temporalité correspond
  const groups = [];
  let matchCount = 0;
  groupsMap.forEach((variants, key) => {
    const matching = variants.filter(v => variantMatches(v, s, p, r));
    if (!matching.length) return;
    matchCount += matching.length;
    variants.sort((a, b) => freqRank(a.freq) - freqRank(b.freq));
    groups.push({ key, variants, matchIds: new Set(matching.map(m => m.id)) });
  });

  // Groupes contenant un favori (sur une variante correspondante) en premier
  groups.sort((a, b) => {
    const favA = a.variants.some(v => a.matchIds.has(v.id) && isFavorite(v.id));
    const favB = b.variants.some(v => b.matchIds.has(v.id) && isFavorite(v.id));
    return favB - favA;
  });

  render(groups, matchCount);
}

/* ============================================
   COMPTEURS
============================================ */
// Nombre de fiches distinctes (regroupées par intitulé), pas de temporalités
function countFiches(list) {
  return new Set(list.map(k => titleKey(k.title))).size;
}

function updateCounts() {
  countAll.textContent = countFiches(data);
  // Favoris : compter les FICHES ayant au moins une temporalité en favori,
  // toutes sources confondues (annuaire + personnel)
  const favTitles = new Set();
  [...data, ...personalEntries].forEach(k => {
    if (favorites.includes(k.id)) favTitles.add(titleKey(k.title));
  });
  countFav.textContent = favTitles.size;
  const cp = document.getElementById("countPerso");
  if (cp) cp.textContent = countFiches(personalEntries);
}

/* ============================================
   OPEN KPI
============================================ */
// Ouvre le rapport sélectionné dans un nouvel onglet, sans recharger l'app
function openReport(selectId, ev) {
  if (ev) { ev.preventDefault(); ev.stopPropagation(); }
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const url = opt && opt.dataset ? opt.dataset.url : "";
  if (!url) { showToast("Sélectionnez d'abord un rapport"); return; }
  window.open(url, "_blank", "noopener,noreferrer");
}

// Mémorise le SITE choisi (pas l'URL) pour le conserver en changeant de temporalité
function onReportSelect(selId, key) {
  const sel = document.getElementById(selId);
  if (sel) groupReport[key] = sel.value;
}

/* ============================================
   RENDER
============================================ */
// Ordre d'affichage des temporalités : Mensuelle → Hebdomadaire → Quotidienne
const FREQ_ORDER = { "mensuelle": 1, "hebdomadaire": 2, "quotidienne": 3 };
function freqRank(f) { return FREQ_ORDER[(f || "").toLowerCase().trim()] || 9; }
function titleKey(t) { return (t || "").toLowerCase().trim(); }

// Classe de couleur du tag Processus : réception / distribution se distinguent des sites
function processTagClass(p) {
  const v = (p || "").toLowerCase();
  if (v.includes("récept") || v.includes("recept")) return "tag tag-process tag-reception";
  if (v.includes("distrib")) return "tag tag-process tag-distribution";
  return "tag tag-process";
}

// Classe de couleur du tag Type : contractuel / non contractuel / opérationnel
function typeTagClass(t) {
  const v = (t || "").toLowerCase();
  if (v.includes("non") && v.includes("contract")) return "tag tag-type tag-noncontract";
  if (v.includes("contract"))  return "tag tag-type tag-contract";
  if (v.includes("opérat") || v.includes("operat")) return "tag tag-type tag-operationnel";
  return "tag tag-type";
}

let kpiGroups = {}; // gid → { key, variants } (reconstruit à chaque rendu)
let groupSel = {};  // titleKey → id de la variante sélectionnée (persiste entre rendus)
let groupReport = {}; // titleKey → site de rapport choisi (logistiport/armement/…)
let animateNextRender = true; // anime l'entrée des cartes seulement quand utile (pas sur simple mise à jour)

// Corps d'une carte pour UNE variante de KPI (grouped = true si la carte
// regroupe plusieurs temporalités : la fréquence est alors dans le sélecteur)
function cardBody(kpi, grouped, freqSelectorHtml = "", key = "") {
  const isFav  = isFavorite(kpi.id);
  const selId  = "sel_" + kpi.id.replace(/[^a-zA-Z0-9_]/g, "_");
  const safeId = esc(kpi.id).replace(/'/g, "\\'");
  const safeKey = esc(key).replace(/'/g, "\\'");

  // Périmètres présents pour ce KPI, dans l'ordre de la config des sites
  const present = activeSites().filter(s => kpi[s.key]);
  const siteBadges = present.map(s =>
    `<span class="site-badge" style="background:${esc(s.color || "#64748B")}"><span class="dot"></span>${esc(siteBadgeLabel(s))}</span>`
  ).join("");

  // Options de rapport : value = clé du site, data-url = lien de CETTE temporalité
  const savedSite = groupReport[key];
  const options = present.map(s =>
    `<option value="${esc(s.key)}" data-url="${esc(kpi[s.key])}"${s.key === savedSite ? " selected" : ""}>${esc(s.name)}</option>`
  ).join("");

  return `
      ${isFav ? `<div class="fav-ribbon">⭐ Favori</div>` : ""}

      <div class="card-header">
        <div class="card-title">${esc(kpi.title)}</div>
        <div class="card-tools">
          <button type="button" class="btn-tool" onclick="editKPI('${safeId}')" title="Modifier">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button type="button" class="btn-tool btn-tool-danger" onclick="deleteKPI('${safeId}')" title="Supprimer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <button type="button" class="btn-fav${isFav ? " active" : ""}" onclick="toggleFavorite('${safeId}')" title="${isFav ? "Retirer des favoris" : "Ajouter aux favoris"}">⭐</button>
        </div>
      </div>

      ${(kpi.type || kpi.process || kpi.ritual) ? `
      <div class="card-tags">
        ${kpi.type    ? `<span class="${typeTagClass(kpi.type)}">${esc(kpi.type)}</span>` : ""}
        ${kpi.process ? `<span class="${processTagClass(kpi.process)}">${esc(kpi.process)}</span>` : ""}
        ${kpi.ritual  ? `<span class="tag tag-ritual">${esc(kpi.ritual)}</span>` : ""}
      </div>` : ""}

      ${siteBadges ? `<div class="card-sites">${siteBadges}</div>` : ""}

      ${kpi.desc ? `<p class="card-desc">${esc(kpi.desc)}</p>` : ""}

      ${options ? `
      <div class="card-action">
        <select id="${selId}" onchange="onReportSelect('${selId}','${safeKey}')">
          <option value="">Choisir un rapport</option>
          ${options}
        </select>
        <button type="button" class="btn-open" onclick="openReport('${selId}', event)">
          Ouvrir
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </button>
      </div>` : ""}

      ${freqSelectorHtml}
  `;
}

// Changement de temporalité dans une carte groupée
function changeGroupFreq(gid, idx) {
  const grp = kpiGroups[gid];
  if (!grp) return;
  const variant = grp.variants[+idx];
  if (!variant) return;
  groupSel[grp.key] = variant.id;
  const body = document.getElementById("body_" + gid);
  if (body) {
    body.innerHTML = cardBody(variant, true, freqSelectorHtml(gid, grp.variants, +idx), grp.key);
    const card = body.closest(".card");
    if (card) card.classList.toggle("favorite", isFavorite(variant.id));
  }
}

// Génère le sélecteur de temporalité (placé en bas de carte, sous le sélecteur de rapport)
function freqSelectorHtml(gid, variants, selIdx) {
  return `
      <div class="card-freq">
        <span class="card-freq-label">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Temporalité
        </span>
        <select onchange="changeGroupFreq('${gid}', this.value)">
          ${variants.map((v, vi) => `<option value="${vi}"${vi === selIdx ? " selected" : ""}>${esc(v.freq || "Sans fréquence")}</option>`).join("")}
        </select>
      </div>`;
}

function render(groups, matchCount) {
  // Mémorise le défilement pour ne pas revenir en haut après une mise à jour
  const prevScroll = container.scrollTop;
  const animate = animateNextRender;
  animateNextRender = true; // par défaut, les rendus suivants animent
  container.innerHTML = "";
  kpiGroups = {};

  if (!groups.length) {
    const msg = currentView === "perso"
      ? { icon: "🔒", title: personalEntries.length ? "Aucun résultat" : "Espace personnel vide", sub: personalEntries.length ? "Essayez d'autres mots-clés ou réinitialisez les filtres" : "Créez un signet avec le bouton + : il ne sera visible que par vous" }
      : data.length === 0
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

  // Compteurs
  const totalGroups = new Set(getViewSource().map(k => titleKey(k.title))).size;
  searchCount.textContent = groups.length !== totalGroups ? `${groups.length} résultat${groups.length > 1 ? "s" : ""}` : "";
  topbarBadge.textContent = `${groups.length} KPI${groups.length > 1 ? "s" : ""}${matchCount !== groups.length ? ` · ${matchCount} variantes` : ""}`;

  groups.forEach((g, i) => {
    const { key, variants, matchIds } = g;

    // Variante affichée : sélection mémorisée si elle correspond, sinon 1ʳᵉ correspondante
    let selIdx = variants.findIndex(v => v.id === groupSel[key] && matchIds.has(v.id));
    if (selIdx < 0) selIdx = variants.findIndex(v => matchIds.has(v.id));
    if (selIdx < 0) selIdx = 0;
    const selected = variants[selIdx];
    groupSel[key] = selected.id; // verrouille la temporalité affichée (survit aux re-rendus)

    const gid = "g" + i + "_" + key.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
    kpiGroups[gid] = { key, variants };

    const card = document.createElement("div");
    card.className = "card" + (isFavorite(selected.id) ? " favorite" : "") + (animate ? "" : " no-anim");
    if (animate) card.style.animationDelay = `${Math.min(i * 30, 180)}ms`;

    if (variants.length > 1) {
      card.innerHTML = `<div class="group-body" id="body_${gid}">${cardBody(selected, true, freqSelectorHtml(gid, variants, selIdx), key)}</div>`;
    } else {
      card.innerHTML = cardBody(selected, false, "", key);
    }

    container.appendChild(card);
  });

  // Rétablit le défilement là où l'utilisateur était (évite le retour en haut)
  container.scrollTop = prevScroll;
}



/* ============================================
   EVENTS
============================================ */
searchInput.addEventListener("input", filterData);
processFilter.addEventListener("change", filterData);
ritualFilter.addEventListener("change", filterData);
refreshBtn.addEventListener("click", () => { loadSavedFile(); showToast("🔄 Données rafraîchies"); });

/* ============================================
   SYNCHRONISATION CLOUD (Firebase Firestore)
============================================ */

/* ─────────────────────────────────────────────────────────────
   CONFIGURATION INTÉGRÉE — À REMPLIR UNE SEULE FOIS PAR L'ADMIN
   Collez ci-dessous la config de VOTRE projet Firebase (onglet
   Paramètres du projet › Vos applications › SDK) et choisissez un
   code de synchronisation. Une fois rempli et l'application
   redistribuée, TOUS les PC se synchronisent automatiquement :
   plus aucune saisie de config sur les nouveaux appareils.
   (Cette config web n'est pas secrète : la sécurité est assurée
   par les règles Firestore, pas par sa dissimulation.)
   ───────────────────────────────────────────────────────────── */
const BUILTIN_FIREBASE_CONFIG = {
  // apiKey: "AIza…",
  // authDomain: "mon-projet.firebaseapp.com",
  // projectId: "mon-projet",
  // storageBucket: "mon-projet.appspot.com",
  // messagingSenderId: "0000000000",
  // appId: "1:0000000000:web:xxxxxxxxxxxx"
};
const BUILTIN_SYNC_CODE = "idea-kpi-2026";

const hasBuiltinConfig = () =>
  BUILTIN_FIREBASE_CONFIG && !!BUILTIN_FIREBASE_CONFIG.projectId && !!BUILTIN_FIREBASE_CONFIG.apiKey;

const LS_SYNC = "kpiSyncConfig";
const LS_SYNC_OPTOUT = "kpiSyncOptOut"; // l'utilisateur a désactivé la sync sur CET appareil
const getSyncConfig = () => { try { return JSON.parse(localStorage.getItem(LS_SYNC)); } catch { return null; } };
const setSyncConfig = cfg => cfg ? localStorage.setItem(LS_SYNC, JSON.stringify(cfg)) : localStorage.removeItem(LS_SYNC);

// Sur un nouvel appareil : si aucune config locale et qu'une config est
// intégrée à l'application, on l'installe automatiquement (sync activée).
function ensureBuiltinConfig() {
  if (getSyncConfig()) return;                          // déjà configuré ici
  if (localStorage.getItem(LS_SYNC_OPTOUT)) return;     // désactivé volontairement
  if (!hasBuiltinConfig()) return;                       // aucune config intégrée
  setSyncConfig({ config: { ...BUILTIN_FIREBASE_CONFIG }, code: BUILTIN_SYNC_CODE, enabled: true });
}

let fbApp = null, fbDb = null, fbUnsub = null;
let syncDebounceHandle = null;
let lastSyncPushAt = 0;
let lastAppliedSyncAt = 0;
let connectedSyncCode = null;
let applyingRemoteSync = false;
let localUpdatedAt = +(localStorage.getItem("kpiLocalUpdatedAt") || 0); // dernière modif locale
let isBooting = true;   // pendant le chargement initial : aucune modification "réelle", donc aucun envoi
let clockOffset = +(localStorage.getItem("kpiClockOffset") || 0); // écart horloge poste ↔ serveur

// Heure corrigée de l'écart avec le serveur (évite qu'un PC mal réglé gagne tous les arbitrages)
function now() { return Date.now() + clockOffset; }

/* ============================================
   MOTEUR DE FUSION (par élément, pas en bloc)
   Chaque fiche porte sa propre date de modification :
   deux personnes peuvent modifier deux KPIs différents
   en même temps sans que l'un efface le travail de l'autre.
============================================ */

// Estampille une fiche comme modifiée maintenant, par l'utilisateur courant
function stamp(entry) {
  entry._mtime = now();
  entry._by = currentUser || "?";
  return entry;
}

// Les fonctions de fusion (mergeEntries, mergeDeleted, mergeFavorites,
// mergeOverrides, mergeActivity, normalizeDeleted) vivent dans js/merge.js :
// logique pure, sans DOM ni stockage, couverte par merge.test.js.

// Métadonnées locales de fusion (horodatages des blocs non listés)
function getMeta() {
  try { return JSON.parse(localStorage.getItem("kpiMeta")) || {}; } catch { return {}; }
}
function setMeta(m) { localStorage.setItem("kpiMeta", JSON.stringify(m)); }
function touchMeta(key) { const m = getMeta(); m[key] = now(); setMeta(m); return m; }
let pendingPush = false;    // un envoi n'a pas pu aboutir (hors-ligne) et devra être rejoué
let netHandlersBound = false;

function markLocalChange() {
  localUpdatedAt = Date.now();
  localStorage.setItem("kpiLocalUpdatedAt", String(localUpdatedAt));
}

let lastSyncState = "off";
function setSyncStatusUI(state, detail) {
  lastSyncState = state;
  const map = {
    off:       { text: "⚪ Synchronisation non configurée", cls: "",          pill: "Sync off",   show: false },
    connected: { text: "🟢 Connecté — synchronisation active", cls: "connected", pill: "Synchronisé", show: true  },
    syncing:   { text: "🔄 Synchronisation…", cls: "syncing",                 pill: "Sync…",      show: true  },
    offline:   { text: "🟠 Hors ligne — reprise automatique au retour du réseau", cls: "offline", pill: "Hors ligne", show: true },
    error:     { text: "🔴 Erreur : " + (detail || "voir console"), cls: "error", pill: "Erreur",   show: true  }
  };
  const s = map[state] || map.off;

  const el = document.getElementById("syncStatus");
  if (el) { el.textContent = s.text; el.className = "sync-status " + s.cls; }

  // Pilule discrète dans la barre du haut
  const pill = document.getElementById("syncPill");
  const pillText = document.getElementById("syncPillText");
  if (pill) {
    pill.style.display = s.show ? "" : "none";
    pill.className = "sync-pill " + s.cls;
    if (pillText) pillText.textContent = s.pill;
  }
}

function syncDocRef(code) {
  return fbDb.collection("kpi_sync").doc(code);
}

function buildSyncPayload() {
  const meta = getMeta();
  const favoritesByUser = JSON.parse(localStorage.getItem("kpiSyncFavorites") || "{}");
  const favoritesMeta   = JSON.parse(localStorage.getItem("kpiFavMeta") || "{}");
  favoritesByUser[currentUser] = favorites;
  favoritesMeta[currentUser]   = meta.favAt || now();
  localStorage.setItem("kpiSyncFavorites", JSON.stringify(favoritesByUser));
  localStorage.setItem("kpiFavMeta", JSON.stringify(favoritesMeta));

  return {
    kpiExcel: excelData,          // bloc Excel, arbitré par excelAt
    excelAt: meta.excelAt || 0,
    kpiManual: manualEntries,     // fusionnées fiche par fiche
    kpiOverrides: overrides,
    kpiDeleted: deletedIds,
    kpiSites: sites,
    kpiPurged: purgedIds,
    kpiActivity: activityLog,
    favoritesByUser,
    favoritesMeta,
    updatedAt: now()
  };
}

function scheduleAutoSync() {
  const cfg = getSyncConfig();
  // Pendant le démarrage, rien n'a été modifié par l'utilisateur : on n'envoie rien
  if (!cfg || !cfg.enabled || applyingRemoteSync || isBooting) return;
  markLocalChange();
  if (!fbDb || !navigator.onLine) { pendingPush = true; if (!navigator.onLine) setSyncStatusUI("offline"); return; }
  clearTimeout(syncDebounceHandle);
  syncDebounceHandle = setTimeout(() => pushToCloud(false), 1500);
}

async function pushToCloud(manual) {
  const cfg = getSyncConfig();
  if (!cfg || !fbDb) { pendingPush = true; return; }
  if (!navigator.onLine) { pendingPush = true; setSyncStatusUI("offline"); return; }
  setSyncStatusUI("syncing");
  try {
    const payload = buildSyncPayload();
    lastSyncPushAt = payload.updatedAt;
    await syncDocRef(cfg.code).set(payload);
    pendingPush = false;
    setSyncStatusUI("connected");
    if (manual) showToast("Synchronisé ☁️ — données envoyées", 2500);
  } catch (err) {
    pendingPush = true;
    setSyncStatusUI(navigator.onLine ? "error" : "offline", err.message);
    if (manual) showToast("❌ Erreur de synchronisation", 3000);
  }
}

/** Intègre le bloc Excel distant s'il est plus récent que le nôtre. */
function mergeRemoteExcel(payload, meta) {
  const remoteExcel = Array.isArray(payload.kpiExcel) ? payload.kpiExcel
                    : (Array.isArray(payload.kpiData) ? payload.kpiData.filter(d => !d.manual) : null);
  if (!remoteExcel) return;
  if ((payload.excelAt || 0) > (meta.excelAt || 0)) {
    excelData = remoteExcel;
    meta.excelAt = payload.excelAt || 0;
  } else if (!excelData.length) {
    excelData = remoteExcel; // on n'avait rien : on prend ce qui existe
  }
}

/** Fusionne fiches manuelles, surcharges, suppressions, purges et journal. */
function mergeRemoteContent(payload) {
  const remoteManual = Array.isArray(payload.kpiManual) ? payload.kpiManual
                     : (Array.isArray(payload.kpiData) ? payload.kpiData.filter(d => d.manual) : null);
  if (remoteManual) {
    manualEntries = mergeEntries(manualEntries, remoteManual);
    saveManualEntries(false);
  }
  if (payload.kpiOverrides && typeof payload.kpiOverrides === "object") {
    overrides = mergeOverrides(overrides, payload.kpiOverrides);
    saveOverrides(false);
  }
  if (Array.isArray(payload.kpiDeleted)) {
    deletedIds = mergeDeleted(deletedIds, normalizeDeleted(payload.kpiDeleted));
    saveDeletedIds(false);
  }
  if (Array.isArray(payload.kpiPurged)) {
    purgedIds = [...new Set([...(purgedIds || []), ...payload.kpiPurged])];
    savePurged(false);
  }
  if (Array.isArray(payload.kpiActivity)) {
    activityLog = mergeActivity(activityLog, payload.kpiActivity, MAX_ACTIVITY);
    saveActivity(false);
  }
}

/**
 * Fusionne la configuration des sites CLÉ PAR CLÉ (comme les KPIs).
 * Un site ajouté sur un poste et un autre ajouté ailleurs coexistent
 * désormais : plus d'écrasement de toute la liste. Pour chaque clé,
 * la version la plus récente gagne, y compris les marqueurs de suppression.
 */
function mergeRemoteSites(payload) {
  if (!Array.isArray(payload.kpiSites) || !payload.kpiSites.length) return;
  const map = new Map();
  // On part des sites distants…
  payload.kpiSites.forEach(s => { if (s && s.key) map.set(s.key, s); });
  // …puis on garde la version locale quand elle est plus récente
  sites.forEach(s => {
    if (!s || !s.key) return;
    const other = map.get(s.key);
    if (!other || (s._mtime || 0) >= (other._mtime || 0)) map.set(s.key, s);
  });
  sites = [...map.values()];
  saveSites(false);
}

/** Fusionne les favoris utilisateur par utilisateur. */
function mergeRemoteFavorites(payload) {
  if (!payload.favoritesByUser) return;
  const localMap  = Store.readJSON(Store.KEYS.SYNC_FAV, {});
  const localMeta = Store.readJSON(Store.KEYS.FAV_META, {});
  const { map, meta: fmeta } =
    mergeFavorites(localMap, localMeta, payload.favoritesByUser, payload.favoritesMeta);
  Store.writeJSON(Store.KEYS.SYNC_FAV, map);
  Store.writeJSON(Store.KEYS.FAV_META, fmeta);
  if (map[currentUser]) { favorites = map[currentUser]; saveFavoritesLocalOnly(); }
}

/**
 * Intègre les données reçues du cloud par FUSION (jamais par écrasement).
 * Un instantané local est pris au préalable : il permet de revenir en
 * arrière si la fusion produit un résultat inattendu.
 */
function applyRemoteData(payload, fromSync) {
  pushSnapshot(fromSync ? "avant réception cloud" : "avant récupération manuelle");
  applyingRemoteSync = true;
  const meta = getMeta();

  mergeRemoteExcel(payload, meta);
  mergeRemoteContent(payload);
  mergeRemoteSites(payload);
  mergeRemoteFavorites(payload);

  setMeta(meta);
  rebuildData(false);
  applyingRemoteSync = false;

  if (payload.updatedAt) {
    localUpdatedAt = Math.max(localUpdatedAt, payload.updatedAt);
    Store.writeRaw(Store.KEYS.LOCAL_AT, String(localUpdatedAt));
  }
  if (!fromSync) showToast("✅ Données récupérées depuis le cloud", 2500);
}

// Récupère et fusionne les données du cloud (bouton « Récupérer »).
// Utilise le même moteur de fusion : rien n'est écrasé sans arbitrage.
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
    setSyncStatusUI(navigator.onLine ? "error" : "offline", err.message);
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

// Premier échange à la connexion : récupère si le cloud est plus récent,
// envoie si nos données locales sont plus récentes (ou si le cloud est vide).
// Mesure l'écart entre l'horloge du poste et celle du serveur Firestore.
// Sans ça, un PC mal réglé (avance de plusieurs heures) gagnerait tous les arbitrages.
async function syncClockOffset(code) {
  try {
    const ref = syncDocRef(code + "__clock");
    await ref.set({ t: firebase.firestore.FieldValue.serverTimestamp() });
    const snap = await ref.get();
    const t = snap.data() && snap.data().t;
    if (t && typeof t.toMillis === "function") {
      const offset = t.toMillis() - Date.now();
      // On n'applique une correction que si l'écart est significatif (> 5 s)
      clockOffset = Math.abs(offset) > 5000 ? offset : 0;
      localStorage.setItem("kpiClockOffset", String(clockOffset));
      if (Math.abs(offset) > 60000) {
        console.warn("Horloge du poste décalée de", Math.round(offset / 1000), "s — correction appliquée.");
      }
    }
  } catch (err) {
    // Non bloquant, mais on trace : un échec répété fausserait l'arbitrage temporel
    console.warn("[Sync] Mesure de l'horloge serveur impossible, horloge locale conservée.", err);
  }
}

async function initialSync(code, manual) {
  if (!fbDb || !navigator.onLine) { if (!navigator.onLine) setSyncStatusUI("offline"); return; }
  setSyncStatusUI("syncing");
  try {
    await syncClockOffset(code);
    const snap = await syncDocRef(code).get();
    const remote = snap.exists ? snap.data() : null;
    const cfg = getSyncConfig();
    const canPush = cfg && cfg.enabled;

    if (!remote) {
      // Rien dans le cloud : on y dépose nos données locales
      if (canPush) await pushToCloud(false);
    } else {
      // Fusion systématique : personne n'écrase personne.
      // On intègre le distant chez nous, puis on renvoie le résultat fusionné
      // pour que les autres postes reçoivent aussi nos apports.
      lastAppliedSyncAt = remote.updatedAt || 0;
      applyRemoteData(remote, true);
      if (canPush) await pushToCloud(false);
    }
    setSyncStatusUI("connected");
  } catch (err) {
    setSyncStatusUI(navigator.onLine ? "error" : "offline", err.message);
    if (manual) showToast("❌ Erreur de synchronisation", 3000);
  }
}

// Reprise automatique : retour du réseau + retour sur l'onglet
function bindNetworkHandlers() {
  if (netHandlersBound) return;
  netHandlersBound = true;

  window.addEventListener("online", () => {
    const cfg = getSyncConfig();
    if (!cfg || !cfg.enabled) return;
    setSyncStatusUI("syncing");
    // Reconnecte si besoin, puis rejoue un envoi en attente
    if (!connectedSyncCode) connectSync(false);
    else {
      initialSync(cfg.code, false);
      if (pendingPush) pushToCloud(false);
    }
    showToast("🔄 Connexion rétablie — synchronisation…", 2500);
  });

  window.addEventListener("offline", () => {
    const cfg = getSyncConfig();
    if (cfg && cfg.enabled) setSyncStatusUI("offline");
  });

  // Reprise sur l'onglet : on renvoie seulement d'éventuelles modifications en attente.
  // (L'écoute temps réel onSnapshot garde déjà les données à jour, inutile de tout re-rendre.)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const cfg = getSyncConfig();
    if (!cfg || !cfg.enabled || !fbDb || !navigator.onLine) return;
    if (pendingPush) pushToCloud(false);
  });
}

function connectSync(manual) {
  try {
    ensureBuiltinConfig(); // nouvel appareil : installe la config intégrée si dispo
    const cfg = getSyncConfig();
    if (!cfg || !cfg.config || !cfg.code) { setSyncStatusUI("off"); return; }
    // Firebase refuse les origines "file://" : inutile d'essayer, on l'explique clairement
    if (isFileProtocol()) {
      setSyncStatusUI("error", "impossible en mode fichier local (file://). Ouvrez l'application via son adresse https://…");
      if (manual) showToast("⚠️ Synchro impossible en local (file://) — utilisez l'adresse https", 4000);
      return;
    }
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
    connectedSyncCode = cfg.code;
    bindNetworkHandlers();
    if (cfg.enabled) {
      // Échange initial : on décide d'envoyer ou de récupérer selon l'ancienneté
      initialSync(cfg.code, manual);
      // Écoute temps réel des changements des autres appareils
      listenForRemoteChanges(cfg.code);
    }
    setSyncStatusUI(navigator.onLine ? "connected" : "offline");
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
  localStorage.setItem(LS_SYNC_OPTOUT, "1"); // n'auto-réinstalle pas la config intégrée ici
  setSyncStatusUI("off");
  showToast("Synchronisation désactivée", 2200);
}

function isFileProtocol() { return location.protocol === "file:"; }

// Panneau de diagnostic : où sont stockées les données, et vers quel cloud on pointe
function renderSyncDiag() {
  const el = document.getElementById("syncDiag");
  if (!el) return;
  const cfg = getSyncConfig();
  const origin = isFileProtocol() ? "fichier local (file://)" : location.origin;
  const proj = cfg?.config?.projectId || "—";
  const code = cfg?.code || "—";
  const auto = cfg?.enabled ? "activée" : "en pause";

  // Analyse fiches vs variantes (temporalités)
  const all = [...data, ...personalEntries];
  const fiches = countFiches(all);
  const variantes = all.length;
  const anomalies = findVariantAnomalies(all);

  el.innerHTML = `
    <div class="diag-row"><span>Emplacement des données</span><b>${esc(origin)}</b></div>
    <div class="diag-row"><span>Projet Firebase</span><b>${esc(proj)}</b></div>
    <div class="diag-row"><span>Code de synchro</span><b>${esc(code)}</b></div>
    <div class="diag-row"><span>Synchro automatique</span><b>${auto}</b></div>
    <div class="diag-row"><span>Fiches (KPIs)</span><b>${fiches}</b></div>
    <div class="diag-row"><span>Variantes (temporalités)</span><b>${variantes}</b></div>
    ${anomalies.length
      ? `<div class="diag-row" style="color:var(--gold)"><span>⚠️ Anomalies détectées</span><b>${anomalies.length}</b></div>`
      : `<div class="diag-row" style="color:var(--green)"><span>✓ Aucune anomalie</span><b>—</b></div>`}`;

  const box = document.getElementById("variantAnomalies");
  if (box) {
    if (!anomalies.length) { box.innerHTML = ""; box.style.display = "none"; }
    else {
      box.style.display = "";
      const hasDuplicates = anomalies.some(a => a.reason.includes("double"));
      box.innerHTML = `<p class="modal-hint" style="margin:8px 0 6px"><b>Fiches à vérifier :</b></p>` +
        anomalies.map(a =>
          `<div class="diag-anomaly">
             <b>${esc(a.title)}</b> — ${a.count} variantes
             <span>${esc(a.reason)}</span>
           </div>`).join("") +
        (hasDuplicates
          ? `<button type="button" id="cleanDupBtn" class="btn-primary" style="margin-top:10px;width:100%">
               🧹 Nettoyer les temporalités en double
             </button>`
          : "");
    }
  }

  const warn = document.getElementById("fileProtocolWarning");
  if (warn) warn.style.display = isFileProtocol() ? "" : "none";
}

// Repère les fiches dont le nombre de temporalités est anormal :
// doublons exacts de temporalité, fréquences non standard, ou plus de 3 variantes.
function findVariantAnomalies(list) {
  const byTitle = new Map();
  list.forEach(k => {
    const key = titleKey(k.title);
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(k);
  });

  const anomalies = [];
  byTitle.forEach(variants => {
    const freqs = variants.map(v => (v.freq || "").trim());
    const title = variants[0].title;

    // Doublons : deux variantes avec la même temporalité
    const seen = {}, dups = [];
    freqs.forEach(f => { const l = f.toLowerCase(); if (seen[l]) dups.push(f || "(vide)"); seen[l] = true; });

    // Fréquences hors des trois standard
    const nonStd = freqs.filter(f => !STD_FREQS.some(s => s.toLowerCase() === f.toLowerCase()));

    if (dups.length) {
      anomalies.push({ title, count: variants.length, reason: `temporalité en double : ${[...new Set(dups)].join(", ")}` });
    } else if (nonStd.length) {
      anomalies.push({ title, count: variants.length, reason: `temporalité non standard : ${[...new Set(nonStd)].map(f => f || "(vide)").join(", ")}` });
    } else if (variants.length > STD_FREQS.length) {
      anomalies.push({ title, count: variants.length, reason: `plus de ${STD_FREQS.length} temporalités` });
    }
  });
  return anomalies;
}

/**
 * Nettoie les temporalités en double : pour chaque fiche, si une même
 * temporalité (ex. « Mensuelle ») apparaît plusieurs fois, on GARDE la
 * variante la plus récente (_mtime le plus grand) et on retire les autres.
 * Les fiches Excel supprimées reçoivent un marqueur (comme une suppression
 * normale) ; les fiches manuelles/perso sont retirées directement.
 * @returns {number} nombre de doublons retirés
 */
function cleanDuplicateVariants() {
  const all = [...data, ...personalEntries];
  const byTitle = new Map();
  all.forEach(k => {
    const key = titleKey(k.title);
    if (!byTitle.has(key)) byTitle.set(key, []);
    byTitle.get(key).push(k);
  });

  const toRemove = []; // variantes en trop à supprimer
  byTitle.forEach(variants => {
    const perFreq = new Map(); // temporalité (minuscule) → variante gardée
    variants.forEach(v => {
      const f = (v.freq || "").trim().toLowerCase();
      const kept = perFreq.get(f);
      if (!kept) { perFreq.set(f, v); return; }
      // Doublon : on garde la plus récente, l'autre part
      const keepNew = (v._mtime || 0) >= (kept._mtime || 0);
      if (keepNew) { toRemove.push(kept); perFreq.set(f, v); }
      else         { toRemove.push(v); }
    });
  });

  if (!toRemove.length) return 0;

  let touchedShared = false, touchedPerso = false;
  toRemove.forEach(v => {
    const kind = classifyId(v.id);
    if (kind === "perso") {
      personalEntries = personalEntries.filter(k => k.id !== v.id);
      touchedPerso = true;
    } else if (kind === "excel") {
      markDeleted(v.id, v);
      delete overrides[v.id];
      touchedShared = true;
    } else { // manual
      markDeleted(v.id, v);
      touchedShared = true;
    }
    favorites = favorites.filter(f => f !== v.id);
  });

  saveFavoritesLocalOnly();
  if (touchedPerso) savePersonalEntries();
  if (touchedShared) { saveOverrides(false); saveDeletedIds(false); saveManualEntries(false); }
  logActivity("delete", `${toRemove.length} doublon(s) de temporalité`, "nettoyage automatique");
  rebuildData(true);
  return toRemove.length;
}

function initSyncModal() {
  ensureBuiltinConfig();
  const cfg = getSyncConfig();
  const usingBuiltin = hasBuiltinConfig() &&
    cfg?.config?.projectId === BUILTIN_FIREBASE_CONFIG.projectId;

  document.getElementById("syncConfigInput").value = cfg?.config ? JSON.stringify(cfg.config, null, 2) : "";
  document.getElementById("syncCodeInput").value   = cfg?.code || "";
  document.getElementById("syncEnabledToggle").checked = !!cfg?.enabled;

  // Config intégrée : on masque la saisie JSON et on montre un bandeau rassurant
  const banner   = document.getElementById("builtinConfigBanner");
  const configRow = document.getElementById("syncConfigRow");
  const advToggle = document.getElementById("advancedSyncToggle");
  if (usingBuiltin) {
    banner.style.display   = "";
    configRow.style.display = "none";      // rien à saisir
    advToggle.style.display = "";           // possibilité de basculer en manuel
    advToggle.textContent   = "⚙️ Paramètres avancés (changer de projet)";
  } else {
    banner.style.display   = hasBuiltinConfig() ? "" : "none";
    configRow.style.display = "";
    advToggle.style.display = "none";
  }

  if (cfg && cfg.config && cfg.code) connectSync(false); else setSyncStatusUI("off");
  renderSyncDiag();
  renderSnapshotList();
}

// Bouton « Paramètres avancés » : révèle la saisie manuelle de config
document.getElementById("advancedSyncToggle")?.addEventListener("click", function () {
  const row = document.getElementById("syncConfigRow");
  const shown = row.style.display !== "none";
  row.style.display = shown ? "none" : "";
  this.textContent = shown ? "⚙️ Paramètres avancés (changer de projet)" : "▲ Masquer les paramètres avancés";
});

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
  localStorage.removeItem(LS_SYNC_OPTOUT); // reconnexion volontaire
  setSyncConfig({ config: parsedConfig, code, enabled: true });
  connectSync(true);
});

document.getElementById("syncEnabledToggle")?.addEventListener("change", function () {
  const c = getSyncConfig();
  if (!c) return;
  c.enabled = this.checked;
  setSyncConfig(c);
  if (c.enabled) {
    // Réactivation : on rétablit l'échange initial et l'écoute temps réel
    if (fbDb && c.code) {
      initialSync(c.code, false);
      listenForRemoteChanges(c.code);
      setSyncStatusUI("connected");
    } else {
      connectSync(false);
    }
    showToast("Synchronisation activée", 2200);
  } else {
    // Mise en pause : on coupe l'écoute (la connexion reste pour l'usage manuel)
    if (fbUnsub) { fbUnsub(); fbUnsub = null; }
    clearTimeout(syncDebounceHandle);
    setSyncStatusUI("connected");
    showToast("Synchronisation en pause", 2200);
  }
});

// La pilule de la barre du haut ouvre la modale de synchronisation
document.getElementById("syncPill")?.addEventListener("click", () => {
  initSyncModal();
  syncModal.classList.remove("hidden");
});

document.getElementById("pushSyncBtn")?.addEventListener("click", () => pushToCloud(true));
document.getElementById("pullSyncBtn")?.addEventListener("click", () => {
  if (confirm("Ceci va remplacer vos données locales par celles du cloud. Continuer ?")) pullFromCloud(true);
});
document.getElementById("disconnectSyncBtn")?.addEventListener("click", () => {
  if (confirm("Désactiver la synchronisation cloud sur cet appareil ?")) disconnectSync();
});

/* ============================================
   INSTANTANÉS DE SÉCURITÉ (historique local)
   Une copie est prise AVANT toute opération
   destructive (réception cloud, import, reset).
============================================ */
const LS_SNAPSHOTS = "kpiSnapshots";
const MAX_SNAPSHOTS = 12;

function getSnapshots() {
  try { return JSON.parse(localStorage.getItem(LS_SNAPSHOTS)) || []; } catch { return []; }
}

function pushSnapshot(reason) {
  try {
    const snap = {
      at: Date.now(),
      reason: reason || "sauvegarde",
      user: currentUser,
      counts: {
        excel: excelData.length,
        manual: manualEntries.length,
        perso: personalEntries.length
      },
      excelData, manualEntries, personalEntries,
      overrides, deletedIds, sites,
      purgedIds, activityLog, meta: getMeta(),
      favorites
    };
    const list = getSnapshots();
    // Évite les doublons rapprochés (moins de 5 s avec le même motif)
    if (list.length && list[0].reason === snap.reason && snap.at - list[0].at < 5000) return;
    list.unshift(snap);
    while (list.length > MAX_SNAPSHOTS) list.pop();
    try {
      localStorage.setItem(LS_SNAPSHOTS, JSON.stringify(list));
    } catch (e) {
      // Espace saturé : on réduit l'historique et on réessaie
      while (list.length > 3) { list.pop(); }
      try {
        localStorage.setItem(LS_SNAPSHOTS, JSON.stringify(list));
      } catch (err2) {
        console.error("[Instantanés] Stockage saturé : impossible d'enregistrer un instantané.", err2);
        if (typeof showToast === "function") showToast("⚠️ Stockage saturé — instantané non enregistré", 4000);
      }
    }
  } catch (e) { console.error("pushSnapshot:", e); }
}

function restoreSnapshot(index) {
  const list = getSnapshots();
  const s = list[index];
  if (!s) return;
  const d = new Date(s.at);
  if (!confirm(
    `Restaurer la version du ${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR").slice(0,5)} ?\n` +
    `(${s.counts.excel} KPIs Excel, ${s.counts.manual} manuels, ${s.counts.perso} personnels)\n\n` +
    "L'état actuel sera lui-même sauvegardé avant restauration."
  )) return;

  pushSnapshot("avant restauration");

  if (Array.isArray(s.excelData))       excelData = s.excelData;
  if (Array.isArray(s.manualEntries))   manualEntries = s.manualEntries;
  if (Array.isArray(s.personalEntries)) personalEntries = s.personalEntries;
  if (Array.isArray(s.deletedIds))      deletedIds = normalizeDeleted(s.deletedIds);
  if (Array.isArray(s.sites) && s.sites.length) sites = s.sites;
  if (Array.isArray(s.purgedIds))       { purgedIds = s.purgedIds; savePurged(false); }
  if (Array.isArray(s.activityLog))     { activityLog = s.activityLog; saveActivity(false); }
  if (s.meta && typeof s.meta === "object") setMeta(s.meta);
  if (s.overrides && typeof s.overrides === "object") overrides = s.overrides;
  if (Array.isArray(s.favorites))       { favorites = s.favorites; saveFavoritesLocalOnly(); }

  saveManualEntries(false); savePersonalEntries(); saveOverrides(false);
  saveDeletedIds(false); saveSites(false);
  markLocalChange();     // cette version devient la plus récente
  rebuildData(true);     // et repart vers le cloud si la synchro est active
  renderSnapshotList();
  renderSyncDiag();
  showToast("↩ Version restaurée", 3000);
}

function renderSnapshotList() {
  const el = document.getElementById("snapshotList");
  if (!el) return;
  const list = getSnapshots();
  if (!list.length) {
    el.innerHTML = `<p class="modal-hint" style="margin:0">Aucune version enregistrée pour l'instant.</p>`;
    return;
  }
  el.innerHTML = "";
  list.forEach((s, i) => {
    const d = new Date(s.at);
    const row = document.createElement("div");
    row.className = "snap-row";
    row.innerHTML = `
      <div class="snap-info">
        <b>${d.toLocaleDateString("fr-FR")} ${d.toLocaleTimeString("fr-FR").slice(0,5)}</b>
        <span>${esc(s.reason)} · ${s.counts.excel} Excel · ${s.counts.manual} manuels · ${s.counts.perso} perso</span>
      </div>
      <button type="button" class="btn-secondary snap-restore">↩ Restaurer</button>`;
    row.querySelector(".snap-restore").addEventListener("click", () => restoreSnapshot(i));
    el.appendChild(row);
  });
}

/* ============================================
   DÉPANNAGE : réinitialisation + sauvegarde locale
============================================ */

// Coupe tout lien cloud et efface la config (les KPIs locaux sont conservés)
function resetSyncCompletely() {
  if (!confirm(
    "Réinitialiser complètement la synchronisation ?\n\n" +
    "• Le lien avec le projet cloud actuel sera coupé\n" +
    "• La configuration enregistrée sera effacée\n" +
    "• Vos KPIs présents sur cet appareil sont CONSERVÉS\n\n" +
    "Vous pourrez ensuite reconnecter le bon projet."
  )) return;

  if (fbUnsub) { fbUnsub(); fbUnsub = null; }
  fbApp = null; fbDb = null; connectedSyncCode = null;
  pendingPush = false;
  clearTimeout(syncDebounceHandle);
  localStorage.removeItem(LS_SYNC);
  localStorage.setItem(LS_SYNC_OPTOUT, "1"); // évite la réinstallation auto de la config intégrée
  localStorage.removeItem("kpiLocalUpdatedAt");
  localUpdatedAt = 0;
  lastSyncPushAt = 0; lastAppliedSyncAt = 0;
  setSyncStatusUI("off");
  renderSyncDiag();
  initSyncModal();
  showToast("🧨 Synchronisation réinitialisée", 3000);
}

// Exporte TOUTES les données locales dans un fichier JSON
function exportBackup() {
  const backup = {
    _format: "annuaire-kpi-backup",
    _version: 1,
    exportedAt: new Date().toISOString(),
    exportedFrom: isFileProtocol() ? "file://" : location.origin,
    user: currentUser,
    excelData, manualEntries, overrides, deletedIds, sites,
    personalEntries, purgedIds, activityLog, meta: getMeta(),
    favoritesMeta: JSON.parse(localStorage.getItem("kpiFavMeta") || "{}"),
    favoritesByUser: JSON.parse(localStorage.getItem("kpiSyncFavorites") || "{}")
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `annuaire-kpi-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast("💾 Sauvegarde exportée", 2500);
}

// Restaure une sauvegarde JSON (remplace les données de cet appareil)
function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let b;
    try { b = JSON.parse(reader.result); }
    catch { showToast("❌ Fichier illisible", 3000); return; }
    if (!b || b._format !== "annuaire-kpi-backup") {
      showToast("❌ Ce fichier n'est pas une sauvegarde de l'annuaire", 3200); return;
    }
    if (!confirm(
      `Restaurer la sauvegarde du ${(b.exportedAt || "").slice(0, 10)} ` +
      `(${(b.excelData?.length || 0) + (b.manualEntries?.length || 0)} KPIs) ?\n\n` +
      "Les données actuelles de cet appareil seront remplacées."
    )) return;

    pushSnapshot("avant import de sauvegarde");

    if (Array.isArray(b.excelData))       excelData = b.excelData;
    if (Array.isArray(b.manualEntries))   manualEntries = b.manualEntries;
    if (Array.isArray(b.personalEntries)) personalEntries = b.personalEntries;
    if (Array.isArray(b.deletedIds))      deletedIds = normalizeDeleted(b.deletedIds);
    if (Array.isArray(b.purgedIds))       { purgedIds = b.purgedIds; savePurged(false); }
    if (Array.isArray(b.activityLog))     { activityLog = b.activityLog; saveActivity(false); }
    if (b.meta && typeof b.meta === "object") setMeta(b.meta);
    if (b.favoritesMeta) localStorage.setItem("kpiFavMeta", JSON.stringify(b.favoritesMeta));
    if (Array.isArray(b.sites) && b.sites.length) sites = b.sites;
    if (b.overrides && typeof b.overrides === "object") overrides = b.overrides;
    if (b.favoritesByUser) {
      localStorage.setItem("kpiSyncFavorites", JSON.stringify(b.favoritesByUser));
      if (b.favoritesByUser[currentUser]) { favorites = b.favoritesByUser[currentUser]; saveFavoritesLocalOnly(); }
    }
    saveManualEntries(false); savePersonalEntries(); saveOverrides(false);
    saveDeletedIds(false); saveSites(false);
    markLocalChange();          // la restauration devient la version la plus récente
    rebuildData(true);          // ré-envoie vers le cloud si la synchro est active
    renderSyncDiag();
    showToast("✅ Sauvegarde restaurée", 3000);
  };
  reader.readAsText(file);
}

document.getElementById("resetSyncBtn")?.addEventListener("click", resetSyncCompletely);

// Bouton « Nettoyer les doublons » : recréé à chaque diagnostic, on écoute
// donc le conteneur parent plutôt que le bouton lui-même.
document.getElementById("variantAnomalies")?.addEventListener("click", e => {
  if (e.target && e.target.id === "cleanDupBtn") {
    const anomalies = findVariantAnomalies([...data, ...personalEntries]);
    const dups = anomalies.filter(a => a.reason.includes("double"));
    if (!confirm(
      `Nettoyer les temporalités en double sur ${dups.length} fiche(s) ?\n\n` +
      "Pour chaque temporalité présente en double, la version la plus récente est " +
      "conservée et les autres sont retirées (récupérables dans la corbeille).\n\n" +
      "Vos fiches et leurs liens ne sont pas perdus."
    )) return;
    const n = cleanDuplicateVariants();
    renderSyncDiag();
    showToast(n ? `🧹 ${n} doublon(s) retiré(s)` : "Aucun doublon à nettoyer", 3000);
  }
});
document.getElementById("exportBackupBtn")?.addEventListener("click", exportBackup);
document.getElementById("importBackupBtn")?.addEventListener("click", () => {
  document.getElementById("backupFileInput").click();
});
document.getElementById("backupFileInput")?.addEventListener("change", function () {
  if (this.files && this.files[0]) importBackup(this.files[0]);
  this.value = "";
});

/* ============================================
   TUTORIEL ANIMÉ + AIDE POWER BI
   Les deux utilisent la même fabrique (js/carousel.js) :
   navigation, points, clavier, tactile et fermeture y sont
   écrits une seule fois.
============================================ */
const tutoCarousel = createCarousel({
  modalId: "tutorialModal", trackId: "tutoTrack", dotsId: "tutoDots",
  prevId: "tutoPrev", nextId: "tutoNext", closeId: "closeTutorialBtn",
  lastLabel: "Terminer ✓"
});
function openTutorial() { tutoCarousel.open(); }
document.getElementById("tutorialBtn")?.addEventListener("click", openTutorial);

const pbiCarousel = createCarousel({
  modalId: "pbiHelpModal", trackId: "pbiTrack", dotsId: "pbiDots",
  prevId: "pbiPrev", nextId: "pbiNext", closeId: "closePbiHelpBtn",
  lastLabel: "Compris ✓"
});
document.getElementById("pbiHelpBtn")?.addEventListener("click", () => pbiCarousel.open());

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
