// ============================================================
// dh-unidentified | unidentified.mjs
// Core logic: mystify, identify, flag read/write helpers
// ============================================================

const MODULE_ID = "dh-unidentified";

// Item types that support the unidentified workflow
export const SUPPORTED_TYPES = ["weapon", "armor", "loot", "consumable"];

const FLAG = {
  IDENTIFIED: "identified",
  REAL_NAME:  "realName",
  REAL_IMG:   "realImg",
  REAL_DESC:  "realDescription",
  MASK_NAME:  "maskedName",
  MASK_IMG:   "maskedImg",
  MASK_DESC:  "maskedDescription",
};

// ── Helpers ──────────────────────────────────────────────────

export function isSupported(item) {
  return SUPPORTED_TYPES.includes(item?.type);
}

export function isUnidentified(item) {
  const f = item?.flags?.[MODULE_ID];
  return f !== undefined && f[FLAG.IDENTIFIED] === false;
}

export function getFlags(item) {
  return item?.flags?.[MODULE_ID] ?? {};
}

// ── Mystify ──────────────────────────────────────────────────

export async function openMystifyDialog(item) {
  if (!game.user.isGM) return;
  if (!isSupported(item)) {
    ui.notifications.warn(`[DH Unidentified] Item type "${item.type}" is not supported.`);
    return;
  }

  const existing         = getFlags(item);
  const defaultMaskedName = existing[FLAG.MASK_NAME] ?? `Unidentified ${_capitalize(item.type)}`;
  const defaultMaskedDesc = existing[FLAG.MASK_DESC] ?? "The nature of this item is unknown.";
  // Default icon = current item icon — GM just accepts if they want to keep same art
  const defaultMaskedImg  = existing[FLAG.MASK_IMG]  ?? item.img ?? "icons/svg/item-bag.svg";

  const content = `
    <div id="dhui-mystify-root">
      <p class="dhui-hint">Configure what the <strong>player sees</strong> while the item is unidentified.</p>
      <div class="dhui-field">
        <label>Masked Name</label>
        <input type="text" name="maskedName" value="${_esc(defaultMaskedName)}" placeholder="Unidentified Ring" />
      </div>
      <div class="dhui-field dhui-field--img">
        <label>Masked Icon Path</label>
        <input type="text" name="maskedImg" value="${_esc(defaultMaskedImg)}" placeholder="icons/svg/item-bag.svg" />
        <button type="button" id="dhui-pick-img" title="Browse files"><i class="fas fa-folder-open"></i></button>
      </div>
      <div class="dhui-field">
        <label>Masked Description (visible to player)</label>
        <textarea name="maskedDesc" rows="4" placeholder="A mysterious item. Its nature is unknown.">${_esc(defaultMaskedDesc)}</textarea>
      </div>
    </div>
  `;

  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: "Mystify Item — DH Unidentified", id: "dhui-mystify-dialog" },
    position: { width: 440 },
    content,
    buttons: [
      {
        action: "confirm",
        label: "Mystify",
        default: true,
        callback: (_event, button) => {
          const els = button.form.elements;
          return {
            maskedName: els.maskedName?.value?.trim() || defaultMaskedName,
            maskedImg:  els.maskedImg?.value?.trim()  || defaultMaskedImg,
            maskedDesc: els.maskedDesc?.value?.trim() || defaultMaskedDesc,
          };
        },
      },
      { action: "cancel", label: "Cancel", callback: () => null },
    ],
    render: (_event, dialog) => {
      dialog.element.querySelector("#dhui-pick-img")?.addEventListener("click", () => {
        const input = dialog.element.querySelector("input[name='maskedImg']");
        new FilePicker({
          type: "imagevideo",
          current: input?.value ?? "",
          callback: path => { if (input) input.value = path; },
        }).render(true);
      });
    },
  }).catch(() => null);

  if (!result) return;
  await applyMystify(item, result);
}

export async function applyMystify(item, { maskedName, maskedImg, maskedDesc }) {
  // Capture real description from system data
  const realDesc = item.system?.description ?? item.system?.details?.description ?? "";

  await item.update({
    name: maskedName,
    img:  maskedImg,
    "system.description": maskedDesc,
    [`flags.${MODULE_ID}.${FLAG.IDENTIFIED}`]: false,
    [`flags.${MODULE_ID}.${FLAG.REAL_NAME}`]:  item.name,
    [`flags.${MODULE_ID}.${FLAG.REAL_IMG}`]:   item.img,
    [`flags.${MODULE_ID}.${FLAG.REAL_DESC}`]:  realDesc,
    [`flags.${MODULE_ID}.${FLAG.MASK_NAME}`]:  maskedName,
    [`flags.${MODULE_ID}.${FLAG.MASK_IMG}`]:   maskedImg,
    [`flags.${MODULE_ID}.${FLAG.MASK_DESC}`]:  maskedDesc,
  });

  ui.notifications.info(`[DH Unidentified] "${maskedName}" is now unidentified.`);
}

// ── Identify ─────────────────────────────────────────────────

export async function identifyItem(item) {
  if (!game.user.isGM) return;

  const flags = getFlags(item);
  if (!flags || flags[FLAG.IDENTIFIED] !== false) {
    ui.notifications.warn("[DH Unidentified] This item is already identified.");
    return;
  }

  const realName = flags[FLAG.REAL_NAME] ?? item.name;
  const realImg  = flags[FLAG.REAL_IMG]  ?? item.img;
  const realDesc = flags[FLAG.REAL_DESC] ?? "";

  await item.update({
    name: realName,
    img:  realImg,
    "system.description": realDesc,
    [`flags.${MODULE_ID}.${FLAG.IDENTIFIED}`]: true,
  });

  ui.notifications.info(`[DH Unidentified] "${realName}" has been identified!`);
}

// ── Internal ─────────────────────────────────────────────────

function _capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

export function _esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
