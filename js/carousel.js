/* ============================================================
   CARROUSEL RÉUTILISABLE
   ------------------------------------------------------------
   Remplace les deux implémentations quasi identiques (tutoriel
   et aide Power BI) qui totalisaient ~90 lignes dupliquées.

   Gère : navigation par boutons, points cliquables, flèches du
   clavier, glissement tactile, fermeture (Échap, clic sur le
   fond, bouton de fermeture).

   Chargé en <script> classique : expose createCarousel().
   ============================================================ */
(function (root) {
  "use strict";

  /**
   * @param {Object}  opt
   * @param {string}  opt.modalId    conteneur .modal-overlay
   * @param {string}  opt.trackId    piste contenant les diapositives
   * @param {string}  opt.dotsId     conteneur des points de navigation
   * @param {string}  opt.prevId     bouton précédent
   * @param {string}  opt.nextId     bouton suivant
   * @param {string} [opt.closeId]   bouton de fermeture
   * @param {string} [opt.lastLabel] libellé du bouton sur la dernière diapo
   * @returns {{open:Function, close:Function, go:Function}}
   */
  function createCarousel(opt) {
    const el = id => (id ? document.getElementById(id) : null);
    const modal = el(opt.modalId);
    const track = el(opt.trackId);
    if (!modal || !track) return { open() {}, close() {}, go() {} };

    const dots = el(opt.dotsId);
    const prev = el(opt.prevId);
    const next = el(opt.nextId);
    const lastLabel = opt.lastLabel || "Terminer ✓";

    let index = 0;
    let count = 0;

    function paint() {
      track.style.transform = `translateX(-${index * 100}%)`;
      if (dots) {
        Array.from(dots.children).forEach((d, i) => d.classList.toggle("active", i === index));
      }
      if (prev) prev.style.visibility = index === 0 ? "hidden" : "visible";
      if (next) next.textContent = index === count - 1 ? lastLabel : "Suivant →";
    }

    function go(i) {
      index = Math.max(0, Math.min(count - 1, i));
      paint();
    }

    function buildDots() {
      if (!dots) return;
      dots.innerHTML = "";
      for (let i = 0; i < count; i++) {
        const d = document.createElement("span");
        d.addEventListener("click", () => go(i));
        dots.appendChild(d);
      }
    }

    function open() {
      count = track.children.length;
      buildDots();
      go(0);
      modal.classList.remove("hidden");
    }

    function close() { modal.classList.add("hidden"); }
    const isOpen = () => !modal.classList.contains("hidden");

    // ─── Câblage (écrit une seule fois pour tous les carrousels) ───
    if (prev) prev.addEventListener("click", () => go(index - 1));
    if (next) next.addEventListener("click", () => {
      if (index === count - 1) close(); else go(index + 1);
    });
    const closeBtn = el(opt.closeId);
    if (closeBtn) closeBtn.addEventListener("click", close);

    modal.addEventListener("click", e => { if (e.target === modal) close(); });

    document.addEventListener("keydown", e => {
      if (!isOpen()) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (e.key === "Escape") close();
    });

    // Glissement tactile
    const viewport = modal.querySelector(".tuto-viewport") || track.parentElement;
    if (viewport) {
      let x0 = null;
      viewport.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
      viewport.addEventListener("touchend", e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1));
        x0 = null;
      }, { passive: true });
    }

    return { open, close, go };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { createCarousel };
  else root.createCarousel = createCarousel;
})(typeof globalThis !== "undefined" ? globalThis : this);
