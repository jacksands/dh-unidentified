// ============================================================
// dh-unidentified | sheet-hook.mjs
// Intercepts item sheet rendering to mask data in the DOM.
//
// ARCHITECTURE (v2 — non-destructive):
//   The item's real name/img/description are never changed in DB.
//   When the sheet renders, we overwrite what is DISPLAYED in the
//   DOM with the masked values from flags. The underlying document
//   data remains real at all times.
//
// GM view (unidentified):
//   - Sheet shows REAL data (the document is real — nothing to do)
//   - Teal banner shows both masked name and real name
//   - ⋮ menu gets Identify + Re-mystify entries
//
// GM view (identified / never mystified):
//   - ⋮ menu gets Mystify entry
//
// Player view (unidentified):
//   - DOM is patched: name, img, description replaced with masked values
//   - All inputs locked, overlay blocks interaction
//   - Close (X) button preserved
// ============================================================

import { isUnidentified, isSupported, openMystifyDialog, identifyItem, getFlags, FLAG } from "./unidentified.mjs";

// ── Main entry point ──────────────────────────────────────────

export function onRenderItemSheet(app, element) {
  const item = app.document ?? app.item ?? app.object;
  if (!(item instanceof Item)) return;
  if (!isSupported(item)) return;

  const frame = app.element;
  if (!frame) return;

  const controlsMenu = frame.querySelector("menu.controls-dropdown");
  if (!controlsMenu) return;

  const content = frame.querySelector("section.window-content, .window-content");

  if (isUnidentified(item)) {
    if (game.user.isGM) {
      // GM sees real data — just inject banner + menu entries
      _applyGMViewUnidentified(app, controlsMenu, content, item);
    } else {
      // Player sees masked data — patch the DOM
      _applyPlayerView(app, frame, content, item);
    }
  } else {
    // Identified: GM gets Mystify entry in menu
    if (game.user.isGM) _injectGMMystifyEntry(controlsMenu, app, item);
  }
}

// ── GM View ───────────────────────────────────────────────────

function _applyGMViewUnidentified(app, controlsMenu, content, item) {
  if (content) _injectGMBanner(content, item);
  _injectGMMenuEntries(controlsMenu, app, item, { identified: false });
}

function _injectGMBanner(content, item) {
  if (content.querySelector(".dhui-gm-banner")) return;

  const flags  = getFlags(item);
  // Real name = item.name (document is untouched)
  // Masked name = from flags
  const masked = flags.maskedName ?? "?";
  const real   = item.name;

  const banner = document.createElement("div");
  banner.className = "dhui-gm-banner";
  banner.innerHTML = `
    <i class="fas fa-eye-slash dhui-gm-banner__icon"></i>
    <div class="dhui-gm-banner__text">
      <span class="dhui-gm-banner__row">
        <strong>Unidentified</strong>
        <span class="dhui-gm-banner__hint">(use the ⋮ menu to identify)</span>
      </span>
      <span class="dhui-gm-banner__row dhui-gm-banner__names">
        <span class="dhui-gm-banner__label">Players see:</span>
        <em class="dhui-masked">"${_escInner(masked)}"</em>
        <span class="dhui-gm-banner__label">Real name:</span>
        <em class="dhui-real">"${_escInner(real)}"</em>
      </span>
    </div>
  `;

  content.insertBefore(banner, content.firstChild);
}

// ── Player View ───────────────────────────────────────────────

function _applyPlayerView(app, frame, content, item) {
  if (!content) return;

  const flags = getFlags(item);

  // 1. Patch the DOM to show masked values
  _maskSheetDOM(frame, content, flags);

  // 2. Show the "Unidentified" badge
  _injectPlayerBadge(content);

  // 3. Lock all inputs
  _lockContent(content);

  // 4. Restore close button (safety net)
  _restoreHeaderButtons(app, frame);
}

/**
 * Overwrite the visible DOM elements with masked values.
 * The document's real data is untouched — only what is rendered changes.
 */
function _maskSheetDOM(frame, content, flags) {
  const maskedName = flags.maskedName ?? "Unidentified Item";
  const maskedImg  = flags.maskedImg  ?? "icons/svg/item-bag.svg";
  const maskedDesc = flags.maskedDesc ?? "The nature of this item is unknown.";

  // ── Name: the h1 input in the item sheet header ──
  // Confirmed from armor/header.hbs: <input type='text' name='name' value='{{source.name}}' />
  frame.querySelectorAll("input[name='name'], h1.item-name, .item-name input").forEach(el => {
    if (el.tagName === "INPUT") el.value = maskedName;
    else el.textContent = maskedName;
  });

  // ── Window title (shown in browser tab / taskbar) ──
  const titleEl = frame.querySelector(".window-title");
  if (titleEl) titleEl.textContent = maskedName;

  // ── Icon: the profile img ──
  // Confirmed from header.hbs: <img class='profile' src='{{source.img}}' />
  frame.querySelectorAll("img.profile, .item-sheet-header img.profile").forEach(el => {
    el.src = maskedImg;
  });

  // ── Description: the ProseMirror / toggled field ──
  // tab-description.hbs uses {{formInput systemFields.description ...toggled=true}}
  // This renders as a div.editor or similar containing the description HTML.
  // We replace the text content to show the masked description.
  content.querySelectorAll(
    ".editor-content, [data-field='system.description'] .editor-content, " +
    "prose-mirror .editor-content, div[contenteditable]"
  ).forEach(el => {
    el.innerHTML = `<p>${_escInner(maskedDesc)}</p>`;
  });

  // Also hide the armor features section ("Heavy: -1 to Evasion")
  content.querySelectorAll(".item-description-outer-container, .item-description-container").forEach(el => {
    el.style.setProperty("display", "none", "important");
  });
}

function _injectPlayerBadge(content) {
  if (content.querySelector(".dhui-player-badge")) return;
  const badge = document.createElement("div");
  badge.className = "dhui-player-badge";
  badge.innerHTML = `<i class="fas fa-question-circle"></i> Unidentified`;
  content.insertBefore(badge, content.firstChild);
}

function _lockContent(content) {
  if (!content) return;

  content.querySelectorAll("input, select, textarea").forEach(el => {
    el.disabled = true;
    el.readOnly = true;
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("cursor",          "default", "important");
  });

  content.querySelectorAll("button").forEach(el => {
    el.disabled = true;
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("cursor",          "default", "important");
  });

  content.querySelectorAll("[contenteditable]").forEach(el => {
    el.setAttribute("contenteditable", "false");
    el.style.setProperty("pointer-events", "none", "important");
  });

  // Block tab navigation (Settings / Actions / Effects)
  content.querySelectorAll(".tabs .tab, [data-action='tab'], nav.tabs a, .tab-navigation a").forEach(el => {
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("cursor", "default", "important");
  });

  // Overlay to catch anything else
  if (!content.querySelector(".dhui-lock-overlay")) {
    content.style.position = "relative";
    const overlay = document.createElement("div");
    overlay.className = "dhui-lock-overlay";
    content.appendChild(overlay);
  }
}

function _restoreHeaderButtons(app, frame) {
  const header = frame.querySelector(".window-header, header");
  if (!header) return;

  header.querySelectorAll("button, a").forEach(btn => {
    btn.disabled = false;
    btn.style.removeProperty("pointer-events");
    btn.style.removeProperty("cursor");
  });

  const closeBtn = header.querySelector("[data-action='close'], .window-close");
  if (closeBtn && !closeBtn.dataset.dhuiRestored) {
    closeBtn.dataset.dhuiRestored = "1";
    closeBtn.addEventListener("click", e => { e.stopPropagation(); app.close(); });
  }
}

// ── GM controls-dropdown entries ─────────────────────────────

function _injectGMMystifyEntry(controlsMenu, app, item) {
  _injectGMMenuEntries(controlsMenu, app, item, { identified: true });
}

function _injectGMMenuEntries(controlsMenu, app, item, { identified }) {
  if (controlsMenu.querySelector(".dhui-menu-entry")) return;

  const sep = document.createElement("li");
  sep.className = "dhui-menu-sep";
  sep.setAttribute("role", "separator");
  controlsMenu.appendChild(sep);

  if (!identified) {
    controlsMenu.appendChild(_makeMenuEntry(
      "fas fa-eye", "Identify Item",
      async () => { await identifyItem(item); app.render({ force: true }); }
    ));
    controlsMenu.appendChild(_makeMenuEntry(
      "fas fa-pen-to-square", "Re-mystify",
      async () => { await openMystifyDialog(item); app.render({ force: true }); }
    ));
  } else {
    controlsMenu.appendChild(_makeMenuEntry(
      "fas fa-eye-slash", "Mystify Item",
      async () => { await openMystifyDialog(item); app.render({ force: true }); }
    ));
  }
}

function _makeMenuEntry(iconClass, label, onClick) {
  const li = document.createElement("li");
  li.className = "header-control dhui-menu-entry";
  li.innerHTML = `
    <button type="button" class="control">
      <i class="${iconClass}"></i>
      <span class="control-label">${label}</span>
    </button>
  `;
  li.querySelector("button").addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return li;
}

// ── Utilities ─────────────────────────────────────────────────

function _escInner(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
