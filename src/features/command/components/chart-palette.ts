/**
 * Colours validated against the card surface (#121216): colour-blind separation, normal-vision separation and
 * 3:1 contrast all pass. The order is fixed, and a track or holding keeps its colour for as long as it exists.
 * Kept apart from the charts, so a page using only these colours doesn't download the chart library.
 */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
export const OTHER_COLOR = "#8a8580";

/** Income and spending keep the same colour wherever they appear. */
export const INCOME_COLOR = SERIES_COLORS[0];
export const EXPENSE_COLOR = SERIES_COLORS[1];

/** A gain and a loss, wherever they're charted. */
export const GAIN_COLOR = SERIES_COLORS[0];
export const LOSS_COLOR = SERIES_COLORS[1];
