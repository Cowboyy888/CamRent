import path from "node:path";

/**
 * Fonts embedded in generated PDFs. Latin is Noto Sans, Khmer is Kantumruy
 * Pro (the same family as the website) and Simplified Chinese is Noto Sans
 * SC. All three are SIL OFL licensed (see src/fonts/pdf/LICENSE-*). WOFF
 * files are used because pdfkit's font reader handles them correctly; the
 * WOFF2 builds of the same fonts render garbled glyphs in PDFs.
 *
 * Khmer shaping (consonant clusters, subscripts, vowel positioning) is done
 * by pdfkit's fontkit layout engine; Khmer and Chinese text is wrapped by
 * the PDF layout at word/character boundaries.
 */
export type Script = "latin" | "khmer" | "han";

const dir = path.join(process.cwd(), "src", "fonts", "pdf");

export const fontFiles: Record<Script, { regular: string; bold: string }> = {
  latin: {
    regular: path.join(dir, "noto-sans-latin-400-normal.woff"),
    bold: path.join(dir, "noto-sans-latin-700-normal.woff"),
  },
  khmer: {
    regular: path.join(dir, "kantumruy-pro-khmer-400-normal.woff"),
    bold: path.join(dir, "kantumruy-pro-khmer-700-normal.woff"),
  },
  han: {
    regular: path.join(dir, "noto-sans-sc-chinese-simplified-400-normal.woff"),
    bold: path.join(dir, "noto-sans-sc-chinese-simplified-700-normal.woff"),
  },
};

function classify(cp: number): Script | null {
  if ((cp >= 0x1780 && cp <= 0x17ff) || (cp >= 0x19e0 && cp <= 0x19ff)) return "khmer";
  if (
    (cp >= 0x2e80 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xff00 && cp <= 0xffef) ||
    (cp >= 0x3000 && cp <= 0x303f) ||
    (cp >= 0x20000 && cp <= 0x2ffff)
  ) {
    return "han";
  }
  // Separators the Khmer font does not have (middle dot, bullet, dashes, ellipsis).
  if (cp === 0xb7 || cp === 0x2022 || cp === 0x2013 || cp === 0x2014 || cp === 0x2026) return "latin";
  // Letters and digits of other scripts use the Latin font.
  if (/[\p{L}\p{N}]/u.test(String.fromCodePoint(cp))) return "latin";
  return null; // spaces and punctuation: take the neighbouring script
}

export interface Run {
  script: Script;
  text: string;
}

/** Splits text into runs that each use one font. Neutral characters join the run before them. */
export function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  let pending = ""; // neutral characters before the first strong one
  for (const ch of text) {
    const script = classify(ch.codePointAt(0)!);
    const last = runs[runs.length - 1];
    if (script === null) {
      if (last) last.text += ch;
      else pending += ch;
      continue;
    }
    if (last && last.script === script) {
      last.text += ch;
    } else {
      runs.push({ script, text: (runs.length === 0 ? pending : "") + ch });
      pending = "";
    }
  }
  if (runs.length === 0 && pending) runs.push({ script: "latin", text: pending });
  return runs;
}

/** The font that best represents a string, for measuring its height. */
export function dominantScript(text: string): Script {
  let han = 0;
  let khmer = 0;
  for (const ch of text) {
    const s = classify(ch.codePointAt(0)!);
    if (s === "han") han++;
    else if (s === "khmer") khmer++;
  }
  if (khmer > 0 && khmer >= han) return "khmer";
  if (han > 0) return "han";
  return "latin";
}
