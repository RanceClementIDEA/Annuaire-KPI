let data = [];
let currentUser = localStorage.getItem("kpiUser");
let favorites = [];

/* =======================
   ELEMENTS
======================= */
const loginScreen = document.getElementById("loginScreen");
const loginBtn = document.getElementById("loginBtn");
const usernameInput = document.getElementById("usernameInput");

const container = document.getElementById("kpiContainer");
const fileInput = document.getElementById("fileInput");
const refreshBtn = document.getElementById("refreshBtn");

const searchInput = document.getElementById("search");
const processFilter = document.getElementById("processFilter");
const freqFilter = document.getElementById("freqFilter");
const ritualFilter = document.getElementById("ritualFilter");

const userInfo = document.getElementById("userInfo");
const logoutBtn = document.getElementById("logoutBtn");

/* =======================
   LOGIN
======================= */
function login(user) {
  currentUser = user;
  localStorage.setItem("kpiUser", user);

  loginScreen.style.display = "none";
  userInfo.textContent = "👤 " + user;

  loadFavorites();

  // ✅ charge fichier en mémoire si existe
  loadSavedFile();
}

loginBtn.addEventListener("click", () => {
  const user = usernameInput.value.trim();
  if (!user) return alert("Entrez un nom");
  login(user);
});

if (currentUser) {
  loginScreen.style.display = "none";
  userInfo.textContent = "👤 " + currentUser;
  loadFavorites();
}

/* ✅ logout propre */
logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("kpiUser");

  data = [];
  favorites = [];
  container.innerHTML = "";

  loginScreen.style.display = "flex";
  userInfo.textContent = "";
  usernameInput.value = "";
});

/* =======================
   FAVORIS
======================= */
function loadFavorites() {
  favorites = JSON.parse(localStorage.getItem("kpiFav_" + currentUser)) || [];
}

function saveFavorites() {
  localStorage.setItem("kpiFav_" + currentUser, JSON.stringify(favorites));
}

function toggleFavorite(id) {
  if (favorites.includes(id)) {
    favorites = favorites.filter(f => f !== id);
  } else {
    favorites.push(id);
  }

  saveFavorites();
  render(data);
}

function isFavorite(id) {
  return favorites.includes(id);
}

/* =======================
   EXCEL IMPORT + SAUVEGARDE
======================= */
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = (evt) => {
    const arrayBuffer = evt.target.result;

    // ✅ sauvegarde
    localStorage.setItem(
      "kpiFile",
      JSON.stringify(Array.from(new Uint8Array(arrayBuffer)))
    );

    loadWorkbook(arrayBuffer);
  };

  reader.readAsArrayBuffer(file);
});

/* =======================
   CHARGEMENT FICHIER MEMOIRE
======================= */
function loadSavedFile() {
  const stored = localStorage.getItem("kpiFile");
  if (!stored) {
    fileInput.click(); // première fois
    return;
  }

  const bytes = new Uint8Array(JSON.parse(stored));
  loadWorkbook(bytes);
}

/* =======================
   CHARGEMENT WORKBOOK
======================= */
function loadWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  transformData(sheet, raw);
}

/* =======================
   EXTRACTION LIENS
======================= */
function extractLinksByColumn(sheet, headers, rowIndex) {
  const links = {
    logistiport: "",
    armement: "",
    armateur: "",
    global: ""
  };

  headers.forEach((header, colIndex) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: colIndex })];

    if (cell && cell.l && cell.l.Target) {
      const url = cell.l.Target.replace(/&amp;/g, "&");
      const h = header.toLowerCase();

      if (h.includes("log")) links.logistiport = url;
      else if (h.includes("armement") || h.includes("mg")) links.armement = url;
      else if (h.includes("armateur")) links.armateur = url;
      else if (h.includes("global")) links.global = url;
    }
  });

  return links;
}

/* =======================
   TRANSFORMATION
======================= */
function transformData(sheet, rawData) {
  const headers = rawData[0];

  data = rawData.slice(1).map((row, idx) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));

    const id = (obj["Intitulé"] || "") + "_" + idx;
    const links = extractLinksByColumn(sheet, headers, idx + 1);

    return {
      id,
      title: obj["Intitulé"] || "",
      type: obj["Type KPI"] || "",
      process: obj["Processus"] || "",
      freq: obj["Fréquence"] || "",
      ritual: obj["Rituel"] || "",
      desc: obj["Description / Mode de calcul"] || "",
      ...links
    };
  });

  initFilters();
  render(data);
}

/* =======================
   FILTRES
======================= */
function initFilters() {
  processFilter.innerHTML = `<option value="">Processus</option>`;
  freqFilter.innerHTML = `<option value="">Fréquence</option>`;
  ritualFilter.innerHTML = `<option value="">Rituel</option>`;

  [...new Set(data.map(d => d.process))].forEach(p =>
    processFilter.innerHTML += `<option>${p}</option>`
  );

  [...new Set(data.map(d => d.freq))].forEach(f =>
    freqFilter.innerHTML += `<option>${f}</option>`
  );

  [...new Set(data.map(d => d.ritual))].forEach(r =>
    ritualFilter.innerHTML += `<option>${r}</option>`
  );
}

/* =======================
   OPEN KPI
======================= */
function openKPI(selectId) {
  const url = document.getElementById(selectId).value;
  if (!url) return alert("Choisir un rapport");
  window.open(url, "_blank");
}

/* =======================
   RENDER
======================= */
function render(list) {
  const sorted = [...list].sort(
    (a, b) => isFavorite(b.id) - isFavorite(a.id)
  );

  container.innerHTML = "";

  sorted.forEach(kpi => {
    const isFav = isFavorite(kpi.id);

    const selectId = "select_" + kpi.id;

    const badges = `
      <div class="site-badges">
        ${kpi.logistiport ? `<span class="site logistiport">LOG</span>` : ""}
        ${kpi.armement ? `<span class="site armement">ARM</span>` : ""}
        ${kpi.armateur ? `<span class="site armateur">ATEUR</span>` : ""}
        ${kpi.global ? `<span class="site global">GLOBAL</span>` : ""}
      </div>
    `;

    let options = "";
    if (kpi.logistiport) options += `<option value="${kpi.logistiport}">Logistiport</option>`;
    if (kpi.armement) options += `<option value="${kpi.armement}">Armement</option>`;
    if (kpi.armateur) options += `<option value="${kpi.armateur}">Armateur</option>`;
    if (kpi.global) options += `<option value="${kpi.global}">Global</option>`;

    const card = document.createElement("div");
    card.className = isFav ? "card favorite" : "card";

    card.innerHTML = `
      ${isFav ? `<div class="favorite-badge">⭐ Favori</div>` : ""}

      <h3>
        ${kpi.title}
        <span class="fav ${isFav ? "active" : ""}" onclick="toggleFavorite('${kpi.id}')">⭐</span>
      </h3>

      <div>
        <span class="tag type">${kpi.type}</span>
        <span class="tag process">${kpi.process}</span>
        <span class="tag freq">${kpi.freq}</span>
        ${kpi.ritual ? `<span class="tag ritual">${kpi.ritual}</span>` : ""}
      </div>

      ${badges}

      <p>${kpi.desc}</p>

      ${options ? `
      <div class="kpi-select">
        <select id="${selectId}">
          <option value="">Choisir un rapport</option>
          ${options}
        </select>
        <button onclick="openKPI('${selectId}')">Ouvrir</button>
      </div>` : ""}
    `;

    container.appendChild(card);
  });
}

/* =======================
   FILTRE
======================= */
function filterData() {
  const s = searchInput.value.toLowerCase();
  const p = processFilter.value;
  const f = freqFilter.value;
  const r = ritualFilter.value;

  const filtered = data.filter(d =>
    (!p || d.process === p) &&
    (!f || d.freq === f) &&
    (!r || d.ritual === r) &&
    (d.title.toLowerCase().includes(s) || d.desc.toLowerCase().includes(s))
  );

  render(filtered);
}

/* =======================
   EVENTS
======================= */
searchInput.addEventListener("input", filterData);
processFilter.addEventListener("change", filterData);
freqFilter.addEventListener("change", filterData);
ritualFilter.addEventListener("change", filterData);

/* ✅ refresh intelligent */
refreshBtn.addEventListener("click", loadSavedFile);