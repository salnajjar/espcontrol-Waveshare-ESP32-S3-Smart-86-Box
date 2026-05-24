// Momentary trigger card: stored as "push" for config compatibility.
// Fires an esphome.push_button_pressed event with no toggle state.
var PUSH_CARD_METADATA = {
  icon: {
    pickerIdSuffix: "icon-picker",
    idSuffix: "icon",
    field: "icon",
    fallback: "Auto",
  },
  preview: {
    badge: "gesture-tap",
  },
};

registerButtonType("push", {
  label: "Trigger",
  allowInSubpage: true,
  labelPlaceholder: "e.g. Doorbell",
  cardMetadata: PUSH_CARD_METADATA,
  onSelect: function (b) {
    b.entity = ""; b.sensor = ""; b.unit = ""; b.icon_on = "Auto";
    b.icon = "Gesture Tap";
  },
  renderSettings: function (panel, b, slot, helpers) {
    helpers.renderCardIconPicker(panel, b, helpers, PUSH_CARD_METADATA.icon);
  },
  renderPreview: function (b, helpers) {
    var label = b.label || "Trigger";
    var iconName = b.icon && b.icon !== "Auto" ? iconSlug(b.icon) : "gesture-tap";
    return {
      iconHtml: '<span class="sp-btn-icon mdi mdi-' + iconName + '"></span>',
      labelHtml: cardBadgeLabelHtml(helpers, label, PUSH_CARD_METADATA.preview.badge),
    };
  },
});
