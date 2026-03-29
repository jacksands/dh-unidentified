// ============================================================
// dh-unidentified | sheet-hook.mjs
// Intercepts item sheet rendering:
//
// GM view (item unidentified):
//   - Banner inside .window-content showing masked name
//   - Action buttons inside that banner (Identify / Re-mystify)
//   - Banner is NOT in .window-header — avoids the z-index/overflow
//     clipping issue caused by position:absolute on .window-header
//
// GM view (item identified):
//   - Small "Mystify" button inside the sheet content area
//
// Player view (item unidentified):
//   - Purple "Unidentified" badge inside .window-content
//   - All inputs inside .window-content are disabled
//   - Transparent overlay inside .window-content blocks interaction
//   - .window-header is NOT touched — close (X) button always works
// ============================================================

import { isUnidentified, isSupported, openMystifyDialog, identifyItem, getFlags } from "./unidentified.mjs";

// ── Main entry point ──────────────────────────────────────────

export function onRenderItemSheet(app, element) {
  const item = app.document ?? app.item ?? app.object;
  if (!(item instanceof Item)) return;
  if (!isSupported(item)) return;

  // app.element = the full application frame (form).
  // menu.controls-dropdown is the native Foundry/DH dropdown (the three-dots
  // menu) — it already contains "Configure Sheet" and "Configure Attribution".
  // We inject our GM entries there so they sit naturally alongside the others,
  // with no z-index or overflow issues.
  const frame = app.element;
  if (!frame) return;

  // Guard: only act when the frame is fully in the DOM
  const controlsMenu = frame.querySelector("menu.controls-dropdown");
  if (!controlsMenu) return;

  const content = frame.querySelector("section.window-content, .window-content");

  if (isUnidentified(item)) {
    game.user.isGM ? _applyGMViewUnidentified(app, frame, controlsMenu, content, item)
                   : _applyPlayerView(app, frame, content);
  } else {
    if (game.user.isGM) _injectGMMystifyEntry(controlsMenu, app, item);
  }
}

// ── GM View — item IS unidentified ───────────────────────────

function _applyGMViewUnidentified(app, frame, controlsMenu, content, item) {
  // Banner inside window-content (shows masked name to GM)
  if (content) _injectGMBanner(app, content, item);
  // Action entries inside the controls-dropdown menu
  _injectGMMenuEntries(controlsMenu, app, item, { identified: false });
}

function _injectGMBanner(app, content, item) {
  if (content.querySelector(".dhui-gm-banner")) return;

  const flags  = getFlags(item);
  const masked = flags.maskedName ?? "?";
  const real   = flags.realName   ?? item.name ?? "?";

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

// ── GM View — item IS identified (just a small Mystify shortcut) ─

function _injectGMMystifyEntry(controlsMenu, app, item) {
  _injectGMMenuEntries(controlsMenu, app, item, { identified: true });
}

/**
 * Inject GM entries into menu.controls-dropdown.
 * The menu already contains li.header-control items ("Configure Sheet", etc).
 * We append a separator + our entries in the same format.
 */
function _injectGMMenuEntries(controlsMenu, app, item, { identified }) {
  if (controlsMenu.querySelector(".dhui-menu-entry")) return;

  // Separator
  const sep = document.createElement("li");
  sep.className = "dhui-menu-sep";
  sep.setAttribute("role", "separator");
  controlsMenu.appendChild(sep);

  if (!identified) {
    // Identify
    controlsMenu.appendChild(_makeMenuEntry(
      "fas fa-eye", "Identify Item",
      async () => { await identifyItem(item); app.render({ force: true }); }
    ));
    // Re-mystify
    controlsMenu.appendChild(_makeMenuEntry(
      "fas fa-pen-to-square", "Re-mystify",
      async () => { await openMystifyDialog(item); app.render({ force: true }); }
    ));
  } else {
    // Mystify
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
  li.querySelector("button").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return li;
}

// ── Player View ───────────────────────────────────────────────

function _applyPlayerView(app, frame, content) {
  _injectPlayerBadge(content);
  _lockContent(content);
  // .window-header is outside .window-content — not locked.
  // Safety net: restore header buttons using the full frame.
  _restoreHeaderButtons(app, frame);
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

  // Disable all form controls
  content.querySelectorAll("input, select, textarea").forEach(el => {
    el.disabled = true;
    el.readOnly = true;
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("cursor",          "default", "important");
  });

  // Disable buttons inside content
  content.querySelectorAll("button").forEach(el => {
    el.disabled = true;
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("cursor",          "default", "important");
  });

  // Disable rich-text editors
  content.querySelectorAll("[contenteditable]").forEach(el => {
    el.setAttribute("contenteditable", "false");
    el.style.setProperty("pointer-events", "none", "important");
  });

  // Remove tab navigation (Description / Settings / Actions / Effects)
  // Player must not switch tabs and see mechanical stats
  content.querySelectorAll(".tabs .tab, [data-action='tab'], nav.tabs a, .tab-navigation a").forEach(el => {
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("cursor", "default", "important");
  });

  // Hide armor/weapon feature descriptions ("Heavy: -1 to Evasion")
  // Generated by getDescriptionData() and injected before the main description
  content.querySelectorAll(".item-description-outer-container, .item-description-container").forEach(el => {
    el.style.setProperty("display", "none", "important");
  });

  // Transparent click-blocker overlay inside content only
  if (!content.querySelector(".dhui-lock-overlay")) {
    content.style.position = "relative";
    const overlay = document.createElement("div");
    overlay.className = "dhui-lock-overlay";
    content.appendChild(overlay);
  }
}

/**
 * Restore any header-area buttons that may have been caught by the lock.
 * This is a safety net — since we only lock .window-content the header
 * should already be untouched, but if the system renders close/controls
 * inside the content area this fixes it.
 */
function _restoreHeaderButtons(app, frame) {
  const header = frame.querySelector(".window-header, header");
  if (!header) return;

  if (!header) return;
  header.querySelectorAll("button, a").forEach(btn => {
    btn.disabled = false;
    btn.style.removeProperty("pointer-events");
    btn.style.removeProperty("cursor");
  });

  // Re-attach close action in case
  const closeBtn = header.querySelector("[data-action='close'], .window-close");
  if (closeBtn && !closeBtn.dataset.dhuiRestored) {
    closeBtn.dataset.dhuiRestored = "1";
    closeBtn.addEventListener("click", e => {
      e.stopPropagation();
      app.close();
    });
  }
}

function _escInner(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
