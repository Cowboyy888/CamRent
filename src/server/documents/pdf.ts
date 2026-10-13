import PDFDocument from "pdfkit";
import { dominantScript, fontFiles, splitRuns, type Script } from "./fonts";

/**
 * A small layout layer over pdfkit: A4 pages, a header with the agency and
 * document reference, key/value blocks, tables, notes, page numbers. Text is
 * written in per-script runs so Khmer, Chinese and Latin can share a line.
 */
const MARGIN = 48;
const COLORS = { ink: "#0b1f2a", muted: "#5b6670", line: "#ddd3c3", brand: "#0e5e6f", note: "#f4efe7" };

export interface WriterOptions {
  title: string;
  reference: string;
  agency: string;
  /** Printed under the title, e.g. issue date. */
  subtitleLines: string[];
  /** Text for the footer, e.g. "Confidential". */
  footer: string;
  /** "Page {page} of {total}" already translated, with placeholders. */
  pageTemplate: string;
  /** Extra header label shown above the title (e.g. DRAFT). */
  banner?: string;
}

export class DocWriter {
  readonly doc: InstanceType<typeof PDFDocument>;
  private readonly chunks: Buffer[] = [];
  private readonly width: number;

  constructor(private readonly opts: WriterOptions) {
    this.doc = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      bufferPages: true,
      info: { Title: `${opts.title} ${opts.reference}`, Author: opts.agency, Producer: "CamRent" },
    });
    this.width = this.doc.page.width - MARGIN * 2;
    this.doc.on("data", (c: Buffer) => this.chunks.push(c));
    const scripts = Object.keys(fontFiles) as Script[];
    for (const s of scripts) {
      this.doc.registerFont(`${s}-r`, fontFiles[s].regular);
      this.doc.registerFont(`${s}-b`, fontFiles[s].bold);
    }
    this.header();
  }

  private header() {
    const { doc, opts } = this;
    if (opts.banner) {
      this.runs(opts.banner, MARGIN, undefined, { size: 9, bold: true, color: "#b42318" });
      doc.moveDown(0.3);
    }
    this.runs(opts.agency, MARGIN, undefined, { size: 10, color: COLORS.brand, bold: true });
    doc.moveDown(0.2);
    this.runs(opts.title, MARGIN, undefined, { size: 20, bold: true, color: COLORS.ink, width: this.width });
    doc.moveDown(0.3);
    for (const line of opts.subtitleLines) {
      this.runs(line, MARGIN, undefined, { size: 9.5, color: COLORS.muted, width: this.width });
    }
    doc.moveDown(0.5);
    this.rule();
  }

  /** Writes one string as script runs. `x`/`y` apply to the first run only. */
  private runs(
    text: string,
    x: number | undefined,
    y: number | undefined,
    o: { size?: number; bold?: boolean; color?: string; width?: number; align?: "left" | "right" } = {},
  ) {
    const { doc } = this;
    const runs = splitRuns(text);
    doc.fontSize(o.size ?? 10).fillColor(o.color ?? COLORS.ink);
    runs.forEach((run, i) => {
      doc.font(`${run.script}-${o.bold ? "b" : "r"}`);
      const last = i === runs.length - 1;
      const options = { continued: !last, width: o.width, align: o.align ?? "left", lineGap: 2 };
      if (i === 0 && x !== undefined) {
        if (y !== undefined) doc.text(run.text, x, y, options);
        else doc.text(run.text, x, doc.y, options);
      } else {
        doc.text(run.text, options);
      }
    });
    if (runs.length === 0) doc.text("", x ?? MARGIN, y ?? doc.y);
  }

  /** Width of a string written as script runs, so right-aligned text can be placed by its start. */
  private runsWidth(text: string, size: number, bold = false): number {
    let total = 0;
    for (const run of splitRuns(text)) {
      this.doc.font(`${run.script}-${bold ? "b" : "r"}`).fontSize(size);
      total += this.doc.widthOfString(run.text);
    }
    return total;
  }

  private height(text: string, width: number, size: number, bold = false) {
    const s = dominantScript(text);
    this.doc.font(`${s}-${bold ? "b" : "r"}`).fontSize(size);
    return this.doc.heightOfString(text || " ", { width, lineGap: 2 });
  }

  private ensure(space: number) {
    if (this.doc.y + space > this.doc.page.height - MARGIN - 28) this.doc.addPage();
  }

  rule() {
    const y = this.doc.y;
    this.doc.moveTo(MARGIN, y).lineTo(MARGIN + this.width, y).strokeColor(COLORS.line).lineWidth(0.8).stroke();
    this.doc.moveDown(0.6);
  }

  section(title: string) {
    this.ensure(40);
    this.doc.moveDown(0.6);
    this.runs(title, MARGIN, undefined, { size: 12, bold: true, color: COLORS.brand, width: this.width });
    this.doc.moveDown(0.3);
  }

  paragraph(text: string, o: { muted?: boolean; size?: number } = {}) {
    if (!text) return;
    const size = o.size ?? 10;
    this.ensure(this.height(text, this.width, size) + 6);
    this.runs(text, MARGIN, undefined, {
      size,
      color: o.muted ? COLORS.muted : COLORS.ink,
      width: this.width,
    });
    this.doc.moveDown(0.5);
  }

  /** A shaded box for disclaimers and notes. */
  note(text: string) {
    const pad = 8;
    const h = this.height(text, this.width - pad * 2, 9) + pad * 2;
    this.ensure(h + 8);
    const y = this.doc.y;
    this.doc.save().rect(MARGIN, y, this.width, h).fill(COLORS.note).restore();
    this.runs(text, MARGIN + pad, y + pad, { size: 9, color: COLORS.ink, width: this.width - pad * 2 });
    this.doc.y = y + h + 8;
  }

  /** Label/value rows in two columns. Rows with no value are skipped by the caller. */
  keyValues(rows: Array<[string, string]>) {
    const labelW = 150;
    for (const [label, value] of rows) {
      const h = Math.max(
        this.height(label, labelW, 9.5, true),
        this.height(value, this.width - labelW - 10, 10),
      );
      this.ensure(h + 6);
      const y = this.doc.y;
      this.runs(label, MARGIN, y, { size: 9.5, bold: true, color: COLORS.muted, width: labelW });
      this.runs(value, MARGIN + labelW + 10, y, { size: 10, width: this.width - labelW - 10 });
      this.doc.y = y + h + 5;
    }
  }

  table(
    columns: Array<{ label: string; width: number; align?: "left" | "right" }>,
    rows: string[][],
  ) {
    const total = columns.reduce((s, c) => s + c.width, 0);
    const scale = this.width / total;
    const widths = columns.map((c) => c.width * scale);
    const draw = (cells: string[], bold: boolean, shade: boolean) => {
      const h =
        Math.max(...cells.map((c, i) => this.height(c, widths[i]! - 8, 9, bold))) + 8;
      this.ensure(h);
      const y = this.doc.y;
      if (shade) this.doc.save().rect(MARGIN, y, this.width, h).fill(COLORS.note).restore();
      let x = MARGIN;
      cells.forEach((cell, i) => {
        this.runs(cell, x + 4, y + 4, {
          size: 9,
          bold,
          color: bold ? COLORS.muted : COLORS.ink,
          width: widths[i]! - 8,
          align: columns[i]!.align ?? "left",
        });
        x += widths[i]!;
      });
      this.doc.y = y + h;
      this.doc
        .moveTo(MARGIN, this.doc.y)
        .lineTo(MARGIN + this.width, this.doc.y)
        .strokeColor(COLORS.line)
        .lineWidth(0.5)
        .stroke();
    };
    draw(columns.map((c) => c.label), true, true);
    for (const row of rows) draw(row, false, false);
    this.doc.moveDown(0.5);
  }

  /** Finishes the document with footers on every page and returns the PDF bytes. */
  async finish(): Promise<Buffer> {
    const { doc, opts } = this;
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const y = doc.page.height - MARGIN + 6;
      doc.page.margins.bottom = 0; // allow writing in the footer band
      const page = opts.pageTemplate
        .replace("{page}", String(i + 1))
        .replace("{total}", String(range.count));
      const pageWidthReserve = this.runsWidth(page, 8) + 16;
      this.runs(`${opts.reference}  ·  ${opts.footer}`, MARGIN, y, {
        size: 8,
        color: COLORS.muted,
        width: this.width - pageWidthReserve,
      });
      const pageWidth = this.runsWidth(page, 8) + 2;
      this.runs(page, MARGIN + this.width - pageWidth, y, {
        size: 8,
        color: COLORS.muted,
        width: pageWidth + 4,
      });
    }
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => resolve(Buffer.concat(this.chunks)));
      doc.on("error", reject);
    });
    doc.end();
    return done;
  }
}
