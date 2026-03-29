// ============================================================
// dh-unidentified | main.mjs
// Module entry point.
// ============================================================

import { onRenderItemSheet }       from "./sheet-hook.mjs";
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
  log("ready");
  _registerHooks();
  game.modules.get(MODULE_ID).api = { isUnidentified, getFlags };
});

// ── Runtime hooks ─────────────────────────────────────────────

function _registerHooks() {

  Hooks.on("renderHandlebarsApplication", (app, element) => {
    onRenderItemSheet(app, element);
    _handleActorSheetRender(app, element);
  });

  // Data-layer guard: block non-GM edits on unidentified items
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

  // GM-only context menu injection (Mystify / Identify entries)
  patchActorSheetContextMenus(app, element);

  // Teal outline on unidentified rows — visible to BOTH GM and player
  _markUnidentifiedRows(actor, element);

  // Hide mechanical details — player only
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

// ── Hide details (player only) ────────────────────────────────

function _hideUnidentifiedDetails(actor, element) {
  element.querySelectorAll("li.inventory-item[data-item-id]").forEach(li => {
    const item = actor.items.get(li.dataset.itemId);
    if (!item || !isUnidentified(item)) return;

    // Expandable description row ("Heavy: -1 to Evasion", invetory-description)
    li.querySelectorAll(".inventory-item-content, .invetory-description").forEach(el => {
      el.style.setProperty("display", "none", "important");
    });

    // Item tags (Base Score, Thresholds, damage dice)
    li.querySelectorAll(".item-tags").forEach(el => {
      el.style.setProperty("display", "none", "important");
    });

    // Expand icon (pointless with content hidden)
    li.querySelectorAll(".expanded-icon").forEach(el => {
      el.style.setProperty("display", "none", "important");
    });

    // "More Options" three-dots button — opens context menu with Edit
    // Selector confirmed from template inventory-item-V2.hbs line 127
    li.querySelectorAll("[data-action='triggerContextMenu']").forEach(el => {
      el.style.setProperty("display", "none", "important");
    });

    // Remove toggleExtended so clicking the row header does nothing
    const header = li.querySelector(".inventory-item-header[data-action='toggleExtended']");
    if (header) header.removeAttribute("data-action");
  });
}

// ── Sidebar tooltip: real name for GM ────────────────────────
//
// The ItemDirectory sidebar uses data-entry-id (confirmed from
// actor-document-partial.hbs). The name lives inside a.entry-name > span.
// We use mouseenter to activate the Foundry tooltip manually via game.tooltip,
// which is more reliable than data-tooltip in the sidebar context.

Hooks.on("renderItemDirectory", (_app, html) => {
  if (!game.user.isGM) return;

  // V13: html may be HTMLElement or jQuery
  const root = html instanceof HTMLElement ? html : html[0];
  if (!root) return;

  // Foundry core ItemDirectory uses data-entry-id on the li
  root.querySelectorAll("li.directory-item[data-entry-id]").forEach(li => {
    const itemId = li.dataset.entryId;
    const item   = game.items.get(itemId);
    if (!item || !isUnidentified(item)) return;

    const flags    = getFlags(item);
    const realName = flags.realName ?? "?";

    // Add teal dot visual cue before the item name
    const nameEl = li.querySelector("a.entry-name span, .document-name");
    if (nameEl && !li.querySelector(".dhui-sidebar-dot")) {
      const dot = document.createElement("i");
      dot.className = "dhui-sidebar-dot fas fa-circle";
      li.querySelector("a.entry-name")?.insertBefore(dot, nameEl);
    }

    // Use mouseenter + game.tooltip.activate for reliable tooltip display
    // data-tooltip alone may not fire in sidebar due to DhTooltipManager
    if (!li.dataset.dhuiTooltipBound) {
      li.dataset.dhuiTooltipBound = "1";
      li.addEventListener("mouseenter", () => {
        game.tooltip.activate(li, {
          text: `Real name: "${realName}"`,
          direction: "RIGHT",
        });
      });
      li.addEventListener("mouseleave", () => {
        game.tooltip.deactivate();
      });
    }
  });
});
