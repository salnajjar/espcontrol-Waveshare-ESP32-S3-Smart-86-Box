import { decodeConfigField, encodeConfigField } from "./card";
import { applySpans, sizeFromToken, sizeToken, type SlotSizeMap } from "./grid";

export interface BackOrderToken {
  token: string;
  label: string;
}

export interface ParsedSubpageOrder {
  order: string[];
  backLabel: string;
}

export interface SubpageGridSource {
  order?: readonly string[];
  grid?: readonly number[];
  sizes?: SlotSizeMap;
  buttons?: readonly unknown[];
  backLabel?: string;
}

const BACK_TOKENS = new Set(["B", "Bd", "Bw", "Bb", "Bt", "Bx"]);

export function isBackOrderToken(token: string | null | undefined): boolean {
  return BACK_TOKENS.has(String(token || ""));
}

export function parseBackOrderToken(value: string | null | undefined): BackOrderToken {
  const raw = String(value || "").trim();
  const eq = raw.indexOf("=");
  const token = eq >= 0 ? raw.substring(0, eq) : raw;
  const label = eq >= 0 ? decodeConfigField(raw.substring(eq + 1)) : "Back";
  if (!BACK_TOKENS.has(token)) {
    return { token: raw, label: "Back" };
  }
  return { token, label: label || "Back" };
}

export function backOrderToken(baseToken: string, label: string | null | undefined): string {
  const token = parseBackOrderToken(baseToken).token;
  const text = label || "Back";
  return text === "Back" ? token : token + "=" + encodeConfigField(text);
}

export function backLabelFromOrder(order: readonly string[] | null | undefined): string {
  for (const item of order || []) {
    const parsed = parseBackOrderToken(item);
    if (BACK_TOKENS.has(parsed.token)) {
      return parsed.label || "Back";
    }
  }
  return "Back";
}

export function parseSubpageOrder(orderStr: string | null | undefined): ParsedSubpageOrder {
  const order: string[] = [];
  let backLabel = "Back";
  if (orderStr) {
    const parts = orderStr.split(",");
    for (const part of parts) {
      const parsed = parseBackOrderToken(part);
      order.push(parsed.token);
      if (BACK_TOKENS.has(parsed.token)) {
        backLabel = parsed.label || "Back";
      }
    }
  }
  return { order, backLabel };
}

export function subpageOrderForSerialize(
  order: readonly string[] | null | undefined,
  backLabel?: string | null,
): string[] {
  const out: string[] = [];
  for (const item of order || []) {
    const parsed = parseBackOrderToken(item);
    if (BACK_TOKENS.has(parsed.token)) {
      out.push(backOrderToken(parsed.token, backLabel || parsed.label || "Back"));
    } else {
      out.push(parsed.token);
    }
  }
  return out;
}

export function buildSubpageGrid(
  subpage: SubpageGridSource,
  maxSlots: number,
  gridCols: number,
): { grid: number[]; sizes: SlotSizeMap } {
  const grid = Array<number>(maxSlots).fill(0);
  const sizes: SlotSizeMap = { ...(subpage.sizes || {}) };
  const order = subpage.order || [];
  const buttonCount = (subpage.buttons || []).length;
  if (order.length > 0) {
    const hasBack = order.some((item) => isBackOrderToken(parseBackOrderToken(item).token));
    if (hasBack) {
      for (let i = 0; i < order.length && i < maxSlots; i += 1) {
        const token = parseBackOrderToken(order[i]).token;
        if (!token) continue;
        if (isBackOrderToken(token)) {
          grid[i] = -2;
          const backSize = sizeFromToken(token.charAt(1));
          if (backSize > 1) sizes[String(-2)] = backSize;
          else delete sizes[String(-2)];
          continue;
        }
        const last = token.charAt(token.length - 1);
        const parsedSize = sizeFromToken(last);
        const slot = parseInt(token, 10);
        if (slot >= 1 && slot <= buttonCount && !Number.isNaN(slot)) {
          grid[i] = slot;
          if (parsedSize > 1) sizes[String(slot)] = parsedSize;
        }
      }
    } else {
      grid[0] = -2;
      delete sizes[String(-2)];
      for (let i = 0; i < order.length && i + 1 < maxSlots; i += 1) {
        const token = parseBackOrderToken(order[i]).token;
        if (!token) continue;
        const last = token.charAt(token.length - 1);
        const parsedSize = sizeFromToken(last);
        const slot = parseInt(token, 10);
        if (slot >= 1 && slot <= buttonCount && !Number.isNaN(slot)) {
          grid[i + 1] = slot;
          if (parsedSize > 1) sizes[String(slot)] = parsedSize;
        }
      }
    }
  } else {
    grid[0] = -2;
    delete sizes[String(-2)];
  }
  applySpans(grid, sizes, maxSlots, gridCols);
  return { grid, sizes };
}

export function serializeSubpageGrid(
  grid: readonly number[],
  sizes: SlotSizeMap,
  backLabel?: string | null,
): string[] {
  let last = -1;
  for (let i = grid.length - 1; i >= 0; i -= 1) {
    const slot = grid[i] ?? 0;
    if (slot > 0 || slot === -2) {
      last = i;
      break;
    }
  }
  if (last < 0) return [];
  const order: string[] = [];
  for (let i = 0; i <= last; i += 1) {
    const slot = grid[i] ?? 0;
    if (slot === -2) {
      order.push(backOrderToken("B" + sizeToken(sizes[String(-2)]), backLabel || "Back"));
    } else if (slot <= 0) {
      order.push("");
    } else {
      order.push(String(slot) + sizeToken(sizes[String(slot)]));
    }
  }
  return order;
}
