/* ============================================
   ÉTAT GLOBAL
============================================ */
let data = [];          // Liste affichée = excelData (+ surcharges) + manualEntries
let excelData = [];     // KPIs issus du fichier Excel (version d'origine, jamais modifiée)
let manualEntries = []; // KPIs créés directement dans l'application (partagés)
let personalEntries = []; // Signets personnels de l'utilisateur (locaux, jamais synchronisés)
let overrides = {};     // Modifications apportées aux KPIs Excel, par id
let deletedIds = [];    // Fiches Excel supprimées dans l'app (masquées même après ré-import)
let currentUser = localStorage.getItem("kpiUser");
let favorites = [];
let currentView = "all"; // "all" | "fav"
let editingKpiId = null; // id de référence du KPI en cours d'édition (pour Supprimer/Restaurer)

// ─── État de la modale multi-temporalités ───
const STD_FREQS = ["Mensuelle", "Hebdomadaire", "Quotidienne"];
let modalSlots = {};        // freq → { id, active, ritual, logistiport, armement, armateur, global }
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
  loadManualEntries();
  loadPersonalEntries();
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
  personalEntries = [];
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
   ESPACE PERSONNEL
   Signets propres à l'utilisateur connecté :
   stockés en local par identifiant, jamais envoyés
   dans la synchronisation cloud partagée.
============================================ */
function loadPersonalEntries() {
  try {
    personalEntries = JSON.parse(localStorage.getItem("kpiPersonal_" + currentUser)) || [];
  } catch { personalEntries = []; }
}

function savePersonalEntries() {
  localStorage.setItem("kpiPersonal_" + currentUser, JSON.stringify(personalEntries));
}

function deletePersonalKpi(id) {
  const kpi = personalEntries.find(k => k.id === id);
  if (!kpi) return;
  if (!confirm(`Supprimer le signet personnel « ${kpi.title} » ?`)) return;
  personalEntries = personalEntries.filter(k => k.id !== id);
  favorites = favorites.filter(f => f !== id);
  saveFavoritesLocalOnly();
  savePersonalEntries();
  initFilters();
  updateCounts();
  filterData();
  showToast("🗑 Signet personnel supprimé");
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
  if (personalEntries.some(k => k.id === id)) deletePersonalKpi(id);
  else if (manualEntries.some(k => k.id === id)) deleteManualKpi(id);
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
  fill("typeList",    [...data, ...personalEntries].map(d => d.type));
  fill("processList", [...data, ...personalEntries].map(d => d.process));
  fill("ritualList",  [...data, ...personalEntries].map(d => d.ritual));
}

function emptySlot() {
  return { id: null, active: false, ritual: "", logistiport: "", armement: "", armateur: "", global: "" };
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
      modalSlots[f] = {
        id: v.id, active: true,
        ritual: v.ritual || "",
        logistiport: v.logistiport || "", armement: v.armement || "",
        armateur: v.armateur || "", global: v.global || ""
      };
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
  document.getElementById("kpiLinkLog").value       = slot.logistiport;
  document.getElementById("kpiLinkArmement").value  = slot.armement;
  document.getElementById("kpiLinkArmateur").value  = slot.armateur;
  document.getElementById("kpiLinkGlobal").value    = slot.global;
  document.getElementById("ritualScope").textContent = "(" + freq.toLowerCase() + ")";
  const ff = document.getElementById("freqFields");
  ff.style.opacity = slot.active ? "1" : "0.45";
  ff.style.pointerEvents = slot.active ? "" : "none";
}

// Sauvegarde les champs courants dans l'emplacement de la temporalité affichée
function syncInputsIntoSlot(freq) {
  const slot = modalSlots[freq];
  slot.active      = document.getElementById("freqActiveToggle").checked;
  slot.ritual      = document.getElementById("kpiRitualInput").value.trim();
  slot.logistiport = normalizeUrl(document.getElementById("kpiLinkLog").value);
  slot.armement    = normalizeUrl(document.getElementById("kpiLinkArmement").value);
  slot.armateur    = normalizeUrl(document.getElementById("kpiLinkArmateur").value);
  slot.global      = normalizeUrl(document.getElementById("kpiLinkGlobal").value);
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

function saveKpiForm() {
  const title = document.getElementById("kpiTitleInput").value.trim();
  if (!title) {
    showToast("⚠️ L'intitulé est obligatoire", 2600);
    document.getElementById("kpiTitleInput").focus();
    return;
  }
  // Fige les valeurs de la temporalité affichée avant de tout parcourir
  syncInputsIntoSlot(modalCurrentFreq);

  const shared = {
    title,
    type:    document.getElementById("kpiTypeInput").value.trim(),
    process: document.getElementById("kpiProcessInput").value.trim(),
    desc:    document.getElementById("kpiDescInput").value.trim()
  };
  const space = document.getElementById("kpiSpaceInput").value; // "shared" | "perso"

  let created = 0, updated = 0, removed = 0;
  let touchesShared = false, touchesPerso = false;

  STD_FREQS.forEach(freq => {
    const slot = modalSlots[freq];
    const initialId = modalInitialIds[freq] || null;
    const kind = initialId ? classifyId(initialId) : null;

    // Temporalité désactivée : supprimer la variante qui existait
    if (!slot.active) {
      if (initialId) {
        removed++;
        if (kind === "excel") {
          if (!deletedIds.includes(initialId)) deletedIds.push(initialId);
          delete overrides[initialId];
          touchesShared = true;
        } else if (kind === "perso") {
          personalEntries = personalEntries.filter(k => k.id !== initialId);
          touchesPerso = true;
        } else if (kind === "manual") {
          manualEntries = manualEntries.filter(k => k.id !== initialId);
          touchesShared = true;
        }
        favorites = favorites.filter(f => f !== initialId);
        saveFavoritesLocalOnly();
      }
      return;
    }

    // Temporalité active : construire la variante
    const fields = {
      ...shared, freq,
      ritual: slot.ritual,
      logistiport: slot.logistiport, armement: slot.armement,
      armateur: slot.armateur, global: slot.global
    };

    // Variante Excel existante → surcharge (préserve l'original au ré-import)
    if (kind === "excel" && space === "shared") {
      overrides[initialId] = fields;
      touchesShared = true;
      updated++;
      return;
    }

    // Sinon : fiche manuelle ou personnelle (création ou mise à jour)
    const targetPerso = space === "perso";
    const entry = {
      id: initialId && kind !== "excel" ? initialId : ((targetPerso ? "perso_" : "manual_") + Date.now() + "_" + freq),
      manual: true,
      ...(targetPerso ? { personal: true } : {}),
      ...fields
    };
    // Retire l'ancienne occurrence des deux espaces (gère le déplacement)
    manualEntries   = manualEntries.filter(k => k.id !== entry.id);
    personalEntries = personalEntries.filter(k => k.id !== entry.id);
    if (targetPerso) { personalEntries.push(entry); touchesPerso = true; }
    else             { manualEntries.push(entry);   touchesShared = true; }
    if (initialId) updated++; else created++;
  });

  // Persiste selon les espaces touchés
  if (touchesPerso)  savePersonalEntries();
  if (touchesShared) { saveManualEntries(false); saveOverrides(false); saveDeletedIds(false); }
  rebuildData(true);

  const parts = [];
  if (created) parts.push(`${created} créée${created > 1 ? "s" : ""}`);
  if (updated) parts.push(`${updated} modifiée${updated > 1 ? "s" : ""}`);
  if (removed) parts.push(`${removed} retirée${removed > 1 ? "s" : ""}`);
  showToast("✅ Temporalités : " + (parts.join(", ") || "aucun changement"), 2800);
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
    const first = el.options[0];
    el.innerHTML = "";
    el.appendChild(first);
    [...new Set(arr.filter(Boolean))].sort().forEach(v => {
      const o = document.createElement("option");
      o.textContent = v;
      el.appendChild(o);
    });
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
function updateCounts() {
  countAll.textContent = data.length;
  countFav.textContent = favorites.length;
  const cp = document.getElementById("countPerso");
  if (cp) cp.textContent = personalEntries.length;
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

// Corps d'une carte pour UNE variante de KPI (grouped = true si la carte
// regroupe plusieurs temporalités : la fréquence est alors dans le sélecteur)
function cardBody(kpi, grouped, freqSelectorHtml = "", key = "") {
  const isFav  = isFavorite(kpi.id);
  const selId  = "sel_" + kpi.id.replace(/[^a-zA-Z0-9_]/g, "_");
  const safeId = esc(kpi.id).replace(/'/g, "\\'");
  const safeKey = esc(key).replace(/'/g, "\\'");

  const siteBadges = [
    kpi.logistiport ? `<span class="site-badge logistiport"><span class="dot"></span>LOG</span>` : "",
    kpi.armement    ? `<span class="site-badge armement"><span class="dot"></span>MG+D</span>` : "",
    kpi.armateur    ? `<span class="site-badge armateur"><span class="dot"></span>ATEUR</span>` : "",
    kpi.global      ? `<span class="site-badge global"><span class="dot"></span>GLOBAL</span>` : ""
  ].join("");

  // Options de rapport : value = SITE, data-url = lien de CETTE temporalité
  const sites = [
    kpi.logistiport && { k: "logistiport", label: "Logistiport", url: kpi.logistiport },
    kpi.armement    && { k: "armement",    label: "MG + Débords", url: kpi.armement },
    kpi.armateur    && { k: "armateur",    label: "Armateur",     url: kpi.armateur },
    kpi.global      && { k: "global",      label: "Global",       url: kpi.global }
  ].filter(Boolean);
  const savedSite = groupReport[key];
  const options = sites.map(s =>
    `<option value="${s.k}" data-url="${esc(s.url)}"${s.k === savedSite ? " selected" : ""}>${s.label}</option>`
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

    const gid = "g" + i + "_" + key.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 40);
    kpiGroups[gid] = { key, variants };

    const card = document.createElement("div");
    card.className = "card" + (isFavorite(selected.id) ? " favorite" : "");
    card.style.animationDelay = `${Math.min(i * 30, 180)}ms`;

    if (variants.length > 1) {
      card.innerHTML = `<div class="group-body" id="body_${gid}">${cardBody(selected, true, freqSelectorHtml(gid, variants, selIdx), key)}</div>`;
    } else {
      card.innerHTML = cardBody(selected, false, "", key);
    }

    container.appendChild(card);
  });
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
    updatedAt: localUpdatedAt || Date.now()
  };
}

function scheduleAutoSync() {
  const cfg = getSyncConfig();
  if (!cfg || !cfg.enabled || applyingRemoteSync) return;
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
  if (payload.updatedAt) {
    localUpdatedAt = payload.updatedAt;
    localStorage.setItem("kpiLocalUpdatedAt", String(localUpdatedAt));
  }
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

// Premier échange à la connexion : récupère si le cloud est plus récent,
// envoie si nos données locales sont plus récentes (ou si le cloud est vide).
async function initialSync(code, manual) {
  if (!fbDb || !navigator.onLine) { if (!navigator.onLine) setSyncStatusUI("offline"); return; }
  setSyncStatusUI("syncing");
  try {
    const snap = await syncDocRef(code).get();
    const remote = snap.exists ? snap.data() : null;
    const remoteAt = remote?.updatedAt || 0;
    const cfg = getSyncConfig();
    const canPush = cfg && cfg.enabled;

    if (!remote) {
      // Rien dans le cloud : on y dépose nos données locales
      if (canPush) await pushToCloud(false);
    } else if (remoteAt > localUpdatedAt) {
      // Le cloud est plus récent : on récupère
      applyRemoteData(remote, true);
    } else if (localUpdatedAt > remoteAt && canPush) {
      // Nos données locales sont plus récentes : on envoie
      await pushToCloud(false);
    } else {
      // À égalité : on s'aligne sur le cloud sans rien réécrire
      lastAppliedSyncAt = remoteAt;
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

  // Reprise sur l'onglet : on récupère les éventuels changements manqués
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const cfg = getSyncConfig();
    if (!cfg || !cfg.enabled || !fbDb || !navigator.onLine) return;
    if (pendingPush) pushToCloud(false);
    else pullFromCloud(false);
  });
}

function connectSync(manual) {
  try {
    ensureBuiltinConfig(); // nouvel appareil : installe la config intégrée si dispo
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
