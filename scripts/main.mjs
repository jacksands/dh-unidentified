// ============================================================
// dh-unidentified | main.mjs
// Module entry point.
//
// ARCHITECTURE (v2 — non-destructive):
//   The item document in the database is NEVER modified.
//   All masking is DOM-only. If the module is disabled,
//   all items remain intact with their real data.
// ============================================================

import { onRenderItemSheet }           from "./sheet-hook.mjs";
import { patchActorSheetContextMenus } from "./context-menu.mjs";
import { isUnidentified, getFlags }    from "./unidentified.mjs";

const MODULE_ID = "dh-unidentified";

function log(...args) { console.log(`[${MODULE_ID}]`, ...args); }

// ── init ─────────────────────────────────────────────────────

Hooks.once("init", () => { log("init"); });

// ── ready ─────────────────────────────────────────────────────

Hooks.once("ready", () => {
  if (typeof libWrapper === "undefined") {
    ui.notifications.error("[DH Unidentified] Requires the lib-wrapper module to be active.");
    return;
  }
  log("ready — v2 non-destructive architecture active.");
  _registerHooks();
  game.modules.get(MODULE_ID).api = { isUnidentified, getFlags };
});

// ── Runtime hooks ─────────────────────────────────────────────

function _registerHooks() {

  // ── Item + Actor sheet rendering ──────────────────────────
  Hooks.on("renderHandlebarsApplication", (app, element) => {
    onRenderItemSheet(app, element);
    _handleActorSheetRender(app, element);
  });

  // ── Sidebar: mask item name for players, tooltip for GM ──
  Hooks.on("renderItemDirectory", (_app, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;

    root.querySelectorAll("li.directory-item[data-entry-id]").forEach(li => {
      const item = game.items.get(li.dataset.entryId);
      if (!item || !isUnidentified(item)) return;

      const flags      = getFlags(item);
      const maskedName = flags.maskedName ?? "Unidentified Item";
      const maskedImg  = flags.maskedImg  ?? "icons/svg/item-bag.svg";

      if (game.user.isGM) {
        // GM: teal dot + hover tooltip with real name
        const nameEl = li.querySelector("a.entry-name span");
        if (nameEl && !li.querySelector(".dhui-sidebar-dot")) {
          const dot = document.createElement("i");
          dot.className = "dhui-sidebar-dot fas fa-circle";
          li.querySelector("a.entry-name")?.insertBefore(dot, nameEl);
        }

        if (!li.dataset.dhuiTooltipBound) {
          li.dataset.dhuiTooltipBound = "1";
          li.addEventListener("mouseenter", () => {
            game.tooltip.activate(li, {
              text: `Real name: "${item.name}"`,
              direction: "RIGHT",
            });
          });
          li.addEventListener("mouseleave", () => game.tooltip.deactivate());
        }

      } else {
        // Player: replace name and icon in the DOM with masked values
        const nameSpan = li.querySelector("a.entry-name span");
        if (nameSpan) nameSpan.textContent = maskedName;

        const img = li.querySelector("img.thumbnail");
        if (img) img.src = maskedImg;
      }
    });
  });

  // ── Data-layer guard: block non-GM writes on unidentified items ──
  // Since we no longer write to item.name/img/description, the main
  // risk here is a player modifying flags or system fields directly.
  // We block ALL updates from non-GMs on unidentified items.
  Hooks.on("preUpdateItem", (item, changes, _options, _userId) => {
    if (game.user.isGM) return true;
    if (!isUnidentified(item)) return true;

    const touchesEquip = changes?.system?.equipped !== undefined;
    ui.notifications.warn(touchesEquip
      ? "[DH Unidentified] Only the GM can equip or unequip unidentified items."
      : "[DH Unidentified] This item cannot be edited while unidentified."
    );
    return false;
  });

  log("hooks registered.");
}

// ── Actor sheet ───────────────────────────────────────────────

function _handleActorSheetRender(app, element) {
  const actor = app.document ?? app.actor ?? app.object;
  if (!(actor instanceof Actor)) return;

  // GM-only context menu entries (Mystify / Identify)
  patchActorSheetContextMenus(app, element);

  // Teal outline on unidentified rows — both GM and player
  _markUnidentifiedRows(actor, element);

  // Hide/mask details in the inventory list — player only
  if (!game.user.isGM) {
    _hideUnidentifiedDetails(actor, element);
  }
}

// ── Teal outline (GM + player) ────────────────────────────────

function _markUnidentifiedRows(actor, element) {
  element.querySelectorAll("li.inventory-item[data-item-id]").forEach(li => {
    const item = actor.items.get(li.dataset.itemId);
    if (!item || !isUnidentified(item)) return;
    li.classList.add("dhui-unidentified-row");
  });
}

// ── Hide/mask inventory details (player only) ─────────────────

function _hideUnidentifiedDetails(actor, element) {
  element.querySelectorAll("li.inventory-item[data-item-id]").forEach(li => {
    const item = actor.items.get(li.dataset.itemId);
    if (!item || !isUnidentified(item)) return;

    const flags      = getFlags(item);
    const maskedName = flags.maskedName ?? "Unidentified Item";
    const maskedImg  = flags.maskedImg  ?? "icons/svg/item-bag.svg";

    // Replace visible name with masked name
    // Template: span.item-name inside div.item-label
    const nameEl = li.querySelector(".item-name");
    if (nameEl) {
      // Keep only the text node — remove expand icon child if present
      nameEl.textContent = maskedName;
    }

    // Replace icon with masked icon
    li.querySelectorAll("img.item-img").forEach(img => { img.src = maskedImg; });

    // Hide item-tags (Base Score, Thresholds, damage dice)
    li.querySelectorAll(".item-tags").forEach(el => {
      el.style.setProperty("display", "none", "important");
    });

    // Hide expandable description row
    li.querySelectorAll(".inventory-item-content, .invetory-description").forEach(el => {
      el.style.setProperty("display", "none", "important");
    });

    // Hide "More Options" three-dots button
    li.querySelectorAll("[data-action='triggerContextMenu']").forEach(el => {
      el.style.setProperty("display", "none", "important");
    });

    // Hide expand icon (no content to expand)
    li.querySelectorAll(".expanded-icon").forEach(el => {
      el.style.setProperty("display", "none", "important");
    });

    // Remove toggleExtended so clicking the row does nothing
    const header = li.querySelector(".inventory-item-header[data-action='toggleExtended']");
    if (header) header.removeAttribute("data-action");
  });
}
