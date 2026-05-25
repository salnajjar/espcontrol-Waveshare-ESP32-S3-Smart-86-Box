// ── Backup contract ───────────────────────────────────────────────────

var BACKUP_CONFIG_VERSION = EspControlModel.BACKUP_CONFIG_VERSION;
var BACKUP_FORMAT = EspControlModel.BACKUP_FORMAT;

function backupConfigError(message) {
  var err = new Error(message);
  err.backupMessage = message;
  return err;
}

function backupEmptyButtonConfig() {
  return EspControlModel.emptyCardConfig();
}

function backupNormalizeButtonConfig(button) {
  return normalizeButtonConfig(EspControlModel.cloneCardConfig(button || {}));
}

function backupSerializeGrid(grid, sizes) {
  return EspControlModel.serializeGridOrder(grid, sizes || {});
}

function backupSerializeSubpages(subpages) {
  var out = {};
  subpages = subpages || {};
  for (var key in subpages) {
    var sp = subpages[key];
    if (!sp) continue;
    var hasButtons = sp.buttons && sp.buttons.length > 0;
    var hasOrder = (sp.order && sp.order.length > 0) || (sp.grid && sp.grid.length > 0);
    if (hasButtons || hasOrder) out[key] = serializeSubpageConfig(sp);
  }
  return out;
}

function backupSource(data, slots) {
  return EspControlModel.backupSource(data || {}, slots);
}

function createBackupConfig(snapshot) {
  snapshot = snapshot || {};
  var buttons = (snapshot.buttons || []).map(backupNormalizeButtonConfig);
  return EspControlModel.createBackupEnvelope(snapshot, {
    buttons: buttons,
    subpages: backupSerializeSubpages(snapshot.subpages),
    button_order: snapshot.button_order != null
      ? String(snapshot.button_order)
      : backupSerializeGrid(snapshot.grid || [], snapshot.sizes || {}),
  });
}

function normalizeBackupConfig(data) {
  data = EspControlModel.validateBackupEnvelope(data);

  var buttons = data.buttons.map(backupNormalizeButtonConfig);
  var subpages = {};
  if (data.subpages && typeof data.subpages === "object") {
    for (var key in data.subpages) {
      var parsed = parseSubpageConfig(String(data.subpages[key] || ""));
      subpages[key] = serializeSubpageConfig(parsed);
    }
  }

  return EspControlModel.normalizeBackupEnvelope(data, {
    buttons: buttons,
    subpages: subpages,
  });
}

function backupOrderUsedSlots(order, importedCount) {
  return EspControlModel.backupOrderUsedSlots(order, importedCount);
}

function backupPlaceSlotAt(grid, slot, pos, size, maxSlots) {
  EspControlModel.backupPlaceSlotAt(grid, slot, pos, size, maxSlots, GRID_COLS);
}

function planBackupImport(data, targetDevice) {
  var config = normalizeBackupConfig(data);
  targetDevice = targetDevice || {};
  var targetSlots = parseInt(targetDevice.slots, 10) || NUM_SLOTS;
  var targetDeviceId = targetDevice.device || DEVICE_ID;
  var importedCount = config.buttons.length;
  var warnings = [];

  if (config.device && config.device !== targetDeviceId) {
    warnings.push("Config was exported from a different panel (" + config.device + ") - layout may look different");
  }
  if (importedCount !== targetSlots) {
    warnings.push("Backup has " + importedCount + " slots, current config has " + targetSlots + " - adapting");
  }

  var layoutPlan = EspControlModel.planBackupButtonLayout(
    config.buttons,
    config.button_order,
    targetSlots,
    GRID_COLS
  );

  var subpages = {};
  for (var sourceKey in config.subpages) {
    var mappedKey = layoutPlan.slotMap[sourceKey];
    if (!mappedKey) continue;
    var subpage = parseSubpageConfig(config.subpages[sourceKey]);
    subpage.sizes = {};
    buildSubpageGrid(subpage);
    subpages[String(mappedKey)] = subpage;
  }

  return {
    config: config,
    warnings: warnings,
    importedCount: importedCount,
    buttons: layoutPlan.buttons.map(backupNormalizeButtonConfig),
    button_order: layoutPlan.button_order,
    importedSizes: layoutPlan.importedSizes,
    subpages: subpages,
    settings: config.settings,
    screen: config.screen,
  };
}
