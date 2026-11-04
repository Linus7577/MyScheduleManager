/**
 * The Home painting is one picture, with the dragon painted into the sky. To bring it to life, soft-edged copies of its
 * parts lie exactly on top of it and move a little. These outlines say where those parts are, in the painting's own pixels.
 * `scripts/prepare-art.mjs` cuts the copies from them, and the Home page puts each copy back in the same place.
 */
export const PAINTING_SIZE = { width: 1024, height: 572 } as const;

/** How soft a copy's edges are, so it fades into the painting beneath it with no visible seam. */
export const LAYER_FEATHER = 10;

export type PaintingLayer = {
  id: "wing-left" | "wing-right" | "body" | "claw-left" | "claw-right" | "head";
  /** The outline, going around the part. The wings go around the towers standing in front of them, so those stay still. */
  points: readonly (readonly [number, number])[];
  /** The point it turns or grows from. */
  pivot: readonly [number, number];
};

/** Listed back to front. */
export const PAINTING_LAYERS: readonly PaintingLayer[] = [
  {
    id: "wing-left",
    points: [[110, 0], [425, 0], [440, 90], [395, 110], [372, 130], [352, 70], [332, 130], [318, 200], [265, 235], [205, 190], [130, 130]],
    pivot: [432, 100],
  },
  {
    id: "wing-right",
    points: [[600, 0], [905, 0], [905, 140], [830, 175], [770, 240], [720, 230], [712, 190], [690, 130], [668, 190], [650, 235], [630, 180], [600, 110], [585, 90]],
    pivot: [598, 100],
  },
  {
    id: "body",
    points: [[420, 250], [600, 240], [640, 300], [612, 390], [612, 450], [540, 458], [498, 400], [430, 372], [395, 320]],
    pivot: [490, 320],
  },
  {
    id: "claw-left",
    points: [[400, 285], [425, 345], [395, 395], [322, 392], [285, 345], [310, 300]],
    pivot: [408, 320],
  },
  {
    id: "claw-right",
    points: [[600, 268], [655, 255], [708, 285], [714, 372], [652, 402], [600, 388], [582, 330]],
    pivot: [596, 325],
  },
  {
    id: "head",
    points: [[395, 122], [582, 122], [592, 232], [548, 340], [490, 368], [440, 340], [385, 232]],
    pivot: [487, 330],
  },
];

/** Where the glowing parts are, as a share of the head's box. They sit inside it, so they move with the head. */
export const PAINTING_GLOWS = { eyes: [[466, 200], [519, 204]], maw: [485, 282] } as const;

/** The part of the painting a layer's file covers: its outline, plus room for the soft edge. */
export function layerBox(points: PaintingLayer["points"]) {
  const margin = LAYER_FEATHER * 2;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const left = Math.max(Math.min(...xs) - margin, 0);
  const top = Math.max(Math.min(...ys) - margin, 0);
  const right = Math.min(Math.max(...xs) + margin, PAINTING_SIZE.width);
  const bottom = Math.min(Math.max(...ys) + margin, PAINTING_SIZE.height);
  return { left, top, width: right - left, height: bottom - top };
}
