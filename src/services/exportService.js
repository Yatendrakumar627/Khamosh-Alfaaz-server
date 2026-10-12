import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Footer, PageNumber } from "docx";
import { tmpdir } from "node:os";
import { writeFile, rm } from "node:fs/promises";
import path from "node:path";

/**
 * Normalizes and sorts entries date-wise:
 * - "newest" (default): Recent date first -> Oldest date last (descending)
 * - "oldest": Oldest date first -> Recent date last (ascending)
 * Primary sort: entryDate (fallback to createdAt)
 * Secondary tie-breaker: createdAt
 */
export function normalizeAndSortEntries(entries = [], sortOrder = "newest") {
  if (!Array.isArray(entries)) return [];
  const isOldestFirst =
    String(sortOrder).toLowerCase() === "oldest" ||
    String(sortOrder).toLowerCase() === "asc";

  return [...entries].sort((a, b) => {
    const timeA = new Date(a?.entryDate || a?.createdAt || 0).getTime();
    const timeB = new Date(b?.entryDate || b?.createdAt || 0).getTime();
    if (timeB !== timeA) {
      return isOldestFirst ? timeA - timeB : timeB - timeA;
    }
    const createdA = new Date(a?.createdAt || 0).getTime();
    const createdB = new Date(b?.createdAt || 0).getTime();
    return isOldestFirst ? createdA - createdB : createdB - createdA;
  });
}

function formatEntryDate(dateVal) {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  try {
    return d.toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d.toISOString().split("T")[0];
  }
}

function formatShortDate(dateVal) {
  if (!dateVal) return "";
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  try {
    return d.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d.toISOString().split("T")[0];
  }
}

export async function buildDocxBuffer({ title, entries, visitorName, sortOrder = "newest" }) {
  const sorted = normalizeAndSortEntries(entries, sortOrder);
  const vName = visitorName || "Anonymous Writer";
  const exportDate = formatShortDate(new Date());
  const isOldestFirst =
    String(sortOrder).toLowerCase() === "oldest" ||
    String(sortOrder).toLowerCase() === "asc";
  const sortLabel = isOldestFirst ? "Oldest to Recent" : "Recent to Oldest";

  const children = [
    new Paragraph({
      children: [
        new TextRun({
          text: "Khamosh Alfaaz",
          bold: true,
          size: 36,
          font: "Playfair Display",
          color: "2C1E14",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `A quiet diary of ${vName}`,
          italics: true,
          size: 22,
          font: "Playfair Display",
          color: "8B6F47",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${sorted.length} ${sorted.length === 1 ? "entry" : "entries"}  •  Exported on ${exportDate}  •  ${sortLabel}`,
          size: 18,
          color: "9E9284",
          font: "Inter",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }),

    new Paragraph({
      children: [
        new TextRun({
          text: "—  ✦  —",
          size: 20,
          color: "D8CEBE",
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
    }),
  ];

  sorted.forEach((entry, idx) => {
    // Entry Heading / Title
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: entry.title || "Untitled Entry",
            bold: true,
            size: 28,
            font: "Playfair Display",
            color: "2C1E14",
          }),
        ],
        spacing: { before: idx === 0 ? 120 : 360, after: 80 },
      }),
    );

    // Date & Type
    const dateFormatted = formatEntryDate(entry.entryDate || entry.createdAt);
    const typeLabel = entry.type ? `  •  ${entry.type.toUpperCase()}` : "";
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${dateFormatted}${typeLabel}`,
            italics: true,
            size: 20,
            color: "8B6F47",
            font: "Inter",
          }),
        ],
        spacing: { after: 80 },
      }),
    );

    // Tags
    if (entry.tags?.length) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Tags: ", bold: true, size: 18, color: "6E6259" }),
            new TextRun({
              text: entry.tags.map((t) => `#${t.replace(/^#/, "")}`).join("  "),
              size: 18,
              color: "8C7E72",
              italics: true,
            }),
          ],
          spacing: { after: 160 },
        }),
      );
    } else {
      children.push(new Paragraph({ spacing: { after: 80 } }));
    }

    // Content paragraphs
    const lines = String(entry.content || "").split(/\r?\n/);
    lines.forEach((line) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line || "",
              size: 22,
              font: "Georgia",
              color: "241C15",
            }),
          ],
          spacing: { line: 280, after: line ? 120 : 60 },
        }),
      );
    });

    // Divider between entries
    if (idx < sorted.length - 1) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "—  ✦  —",
              size: 20,
              color: "D8CEBE",
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 240, after: 240 },
        }),
      );
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Khamosh Alfaaz  •  Page ", size: 16, color: "9E9284" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "9E9284" }),
                  new TextRun({ text: " of ", size: 16, color: "9E9284" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "9E9284" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export async function buildPdfBuffer({ title, entries, visitorName, sortOrder = "newest" }) {
  const sorted = normalizeAndSortEntries(entries, sortOrder);
  const vName = visitorName || "Anonymous Writer";
  const exportDate = formatShortDate(new Date());
  const isOldestFirst =
    String(sortOrder).toLowerCase() === "oldest" ||
    String(sortOrder).toLowerCase() === "asc";
  const sortLabel = isOldestFirst ? "Oldest to Recent" : "Recent to Oldest";

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 54, bottom: 54, left: 54, right: 54 },
    bufferPages: true,
  });

  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Top header banner
  doc.font("Helvetica-Bold").fontSize(24).fillColor("#2C1E14").text("Khamosh Alfaaz", { align: "center" });
  doc.moveDown(0.2);
  doc.font("Helvetica-Oblique").fontSize(12).fillColor("#8B6F47").text(`A quiet diary of ${vName}`, { align: "center" });
  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(9).fillColor("#9E9284").text(
    `${sorted.length} ${sorted.length === 1 ? "entry" : "entries"}  •  Exported on ${exportDate}  •  ${sortLabel}`,
    { align: "center" },
  );
  doc.moveDown(0.8);

  // Decorative hairline divider under header
  const startX = doc.page.margins.left;
  const endX = doc.page.width - doc.page.margins.right;
  doc.strokeColor("#D8CEBE").lineWidth(0.75).moveTo(startX, doc.y).lineTo(endX, doc.y).stroke();
  doc.moveDown(1.2);

  sorted.forEach((entry, idx) => {
    // Prevent orphan heading near bottom of page
    if (doc.y > doc.page.height - 130) {
      doc.addPage();
    }

    // Title
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#2C1E14").text(entry.title || "Untitled Entry");
    doc.moveDown(0.25);

    // Date & Type
    const dateFormatted = formatEntryDate(entry.entryDate || entry.createdAt);
    const typeLabel = entry.type ? `  •  [${entry.type.toUpperCase()}]` : "";
    doc.font("Helvetica").fontSize(10).fillColor("#8B6F47").text(`${dateFormatted}${typeLabel}`);

    // Tags
    if (entry.tags?.length) {
      doc.moveDown(0.2);
      const tagStr = entry.tags.map((t) => `#${t.replace(/^#/, "")}`).join("  ");
      doc.font("Helvetica-Oblique").fontSize(9).fillColor("#6E6259").text(`Tags: ${tagStr}`);
    }

    doc.moveDown(0.6);

    // Body content
    doc.font("Helvetica").fontSize(10.5).fillColor("#241C15").text(String(entry.content || ""), {
      lineGap: 4.5,
      paragraphGap: 6,
      align: "left",
    });

    doc.moveDown(1);

    // Divider between entries (if not last)
    if (idx < sorted.length - 1) {
      if (doc.y <= doc.page.height - 80) {
        const midX = doc.page.width / 2;
        doc.strokeColor("#E5DDCF").lineWidth(0.5).moveTo(midX - 100, doc.y).lineTo(midX + 100, doc.y).stroke();
        doc.moveDown(1.2);
      }
    }
  });

  // Stamp footers on all pages without triggering auto-pagination
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let i = range.start; i < range.start + totalPages; i++) {
    doc.switchToPage(i);
    const prevBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8).fillColor("#9E9284").text(
      `Khamosh Alfaaz  •  Page ${i + 1} of ${totalPages}`,
      doc.page.margins.left,
      doc.page.height - 30,
      {
        align: "center",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        lineBreak: false,
      },
    );
    doc.page.margins.bottom = prevBottomMargin;
  }

  doc.end();
  return done;
}

export function buildTxtBuffer({ entries, visitorName, sortOrder = "newest" }) {
  const sorted = normalizeAndSortEntries(entries, sortOrder);
  const vName = visitorName || "Anonymous Writer";
  const exportDate = formatEntryDate(new Date());
  const isOldestFirst =
    String(sortOrder).toLowerCase() === "oldest" ||
    String(sortOrder).toLowerCase() === "asc";
  const sortLabel = isOldestFirst ? "Oldest date first" : "Recent date first";

  let out = "";
  out += "================================================================================\n";
  out += "                                 KHAMOSH ALFAAZ\n";
  out += `                          A quiet diary of ${vName}\n`;
  out += "================================================================================\n";
  out += `Exported on: ${exportDate}\n`;
  out += `Total Entries: ${sorted.length} (Chronological: ${sortLabel})\n`;
  out += "================================================================================\n\n";

  sorted.forEach((entry, idx) => {
    const dateFormatted = formatEntryDate(entry.entryDate || entry.createdAt);
    out += `[${idx + 1}] ${entry.title || "Untitled Entry"}\n`;
    out += `${"-".repeat(80)}\n`;
    out += `Date:     ${dateFormatted}\n`;
    if (entry.type) out += `Type:     ${entry.type}\n`;
    if (entry.tags?.length) out += `Tags:     ${entry.tags.map((t) => `#${t.replace(/^#/, "")}`).join(", ")}\n`;
    out += `${"-".repeat(80)}\n\n`;
    out += `${String(entry.content || "").trim()}\n\n`;
    if (idx < sorted.length - 1) {
      out += `\n${"=".repeat(80)}\n\n`;
    }
  });

  return Buffer.from(out, "utf-8");
}

export function buildMdBuffer({ entries, visitorName, sortOrder = "newest" }) {
  const sorted = normalizeAndSortEntries(entries, sortOrder);
  const vName = visitorName || "Anonymous Writer";
  const exportDate = formatEntryDate(new Date());
  const isOldestFirst =
    String(sortOrder).toLowerCase() === "oldest" ||
    String(sortOrder).toLowerCase() === "asc";
  const sortLabel = isOldestFirst ? "Oldest date to recent date" : "Recent date to oldest date";

  let out = "";
  out += `# Khamosh Alfaaz\n\n`;
  out += `*A quiet diary of ${vName}*\n\n`;
  out += `> **Exported:** ${exportDate}  \n`;
  out += `> **Total Entries:** ${sorted.length}  \n`;
  out += `> **Order:** ${sortLabel}  \n\n`;
  out += `---\n\n`;

  sorted.forEach((entry) => {
    const dateFormatted = formatEntryDate(entry.entryDate || entry.createdAt);
    out += `## ${entry.title || "Untitled Entry"}\n\n`;
    out += `**Date:** ${dateFormatted}`;
    if (entry.type) out += ` | **Type:** \`${entry.type}\``;
    out += `  \n`;
    if (entry.tags?.length) {
      out += `**Tags:** ${entry.tags.map((t) => `\`#${t.replace(/^#/, "")}\``).join(" ")}  \n`;
    }
    out += `\n${String(entry.content || "").trim()}\n\n`;
    out += `---\n\n`;
  });

  return Buffer.from(out, "utf-8");
}

export async function writeTemp(buffer, ext) {
  const file = path.join(tmpdir(), `khamosh-alfaaz-export-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  await writeFile(file, buffer);
  return { file, cleanup: () => rm(file, { force: true }) };
}