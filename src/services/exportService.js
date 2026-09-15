import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { tmpdir } from "node:os";
import { writeFile, rm } from "node:fs/promises";
import path from "node:path";

export async function buildDocxBuffer({ title, entries, visitorName }) {
  const children = [
    new Paragraph({
      children: [new TextRun({ text: "Khamosh Alfaaz", bold: true, size: 32, font: "Playfair Display" })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [new TextRun({ text: `A quiet diary of ${visitorName}`, italics: true, size: 24 })],
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ children: [new TextRun({ text: "", break: 1 })] }),
  ];

  for (const entry of entries) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: entry.title,
            bold: true,
            size: 28,
            font: "Playfair Display",
          }),
        ],
      }),
    );
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: new Date(entry.entryDate).toLocaleDateString("en-IN", {
              year: "numeric",
              month: "long",
              day: "numeric",
            }),
            italics: true,
            size: 20,
            color: "8B7355",
          }),
        ],
      }),
    );
    if (entry.tags?.length) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "Tags: ", bold: true, size: 20 }),
            new TextRun({ text: entry.tags.join(", "), size: 20, color: "6B7280" }),
          ],
        }),
      );
    }
    children.push(new Paragraph({ children: [new TextRun({ text: "", break: 1 })] }));
    for (const line of String(entry.content).split("\n")) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: line || " ", size: 22, font: "Inter" })],
        }),
      );
    }
    children.push(new Paragraph({ children: [new TextRun({ text: "", break: 1 })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: "—", size: 20, color: "B0A080" })] }));
    children.push(new Paragraph({ children: [new TextRun({ text: "", break: 1 })] }));
  }

  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Packer.toBuffer(doc);
}

export async function buildPdfBuffer({ title, entries, visitorName }) {
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ size: "A4", margins: { top: 72, bottom: 72, left: 72, right: 72 } });
  const chunks = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Helvetica-Bold").fontSize(24).fillColor("#3B2A18").text("Khamosh Alfaaz", { align: "center" });
  doc.font("Helvetica-Oblique").fontSize(12).fillColor("#8B7355").text(`A quiet diary of ${visitorName}`, { align: "center" });
  doc.moveDown(1.5);

  for (const entry of entries) {
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#3B2A18").text(entry.title);
    doc.font("Helvetica").fontSize(10).fillColor("#8B7355").text(
      new Date(entry.entryDate).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
    );
    if (entry.tags?.length) {
      doc.font("Helvetica").fontSize(10).fillColor("#6B7280").text(`Tags: ${entry.tags.join(", ")}`);
    }
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(11).fillColor("#1F2937").text(String(entry.content), { lineGap: 4 });
    doc.moveDown(1);
    doc.font("Helvetica-Oblique").fontSize(9).fillColor("#B0A080").text("—");
    doc.moveDown(1);
  }

  doc.end();
  return done;
}

export function buildTxtBuffer({ entries, visitorName }) {
  let out = `Khamosh Alfaaz\nA quiet diary of ${visitorName}\n\n`;
  for (const entry of entries) {
    out += `# ${entry.title}\n`;
    out += `${new Date(entry.entryDate).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}\n`;
    if (entry.tags?.length) out += `Tags: ${entry.tags.join(", ")}\n`;
    out += `${"-".repeat(40)}\n`;
    out += `${String(entry.content)}\n\n`;
  }
  return Buffer.from(out, "utf-8");
}

export async function writeTemp(buffer, ext) {
  const file = path.join(tmpdir(), `khamosh-alfaaz-export-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  await writeFile(file, buffer);
  return { file, cleanup: () => rm(file, { force: true }) };
}