import { decodeConfigField, encodeConfigField } from "./card";

export interface BackOrderToken {
  token: string;
  label: string;
}

export interface ParsedSubpageOrder {
  order: string[];
  backLabel: string;
}

const BACK_TOKENS = new Set(["B", "Bd", "Bw", "Bb", "Bt", "Bx"]);

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
