/**
 * Server-side report export — the "exportable reports (Excel/PDF)" half of
 * the client platform spec. Deliberately NOT an integrator: rendering a
 * tabular report to a file is a server capability, not an external service
 * (campaign decision, W5). CSV needs no dependency; XLSX renders via exceljs;
 * PDF via pdfkit.
 *
 * @packageDocumentation
 */

import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export type ReportCell = string | number | boolean | null;

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportTable {
  title: string;
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCell>>;
}

export type ReportFormat = 'csv' | 'xlsx' | 'pdf';

export const REPORT_CONTENT_TYPES: Record<ReportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

function csvCell(value: ReportCell | undefined): string {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export function renderCsv(table: ReportTable): Buffer {
  const lines = [table.columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of table.rows) {
    lines.push(table.columns.map((c) => csvCell(row[c.key])).join(','));
  }
  return Buffer.from(lines.join('\r\n') + '\r\n', 'utf8');
}

export async function renderXlsx(table: ReportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(table.title.slice(0, 31) || 'Report');
  sheet.columns = table.columns.map((c) => ({ header: c.label, key: c.key, width: Math.max(12, c.label.length + 2) }));
  for (const row of table.rows) {
    sheet.addRow(row);
  }
  sheet.getRow(1).font = { bold: true };
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}

export function renderPdf(table: ReportTable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: table.columns.length > 6 ? 'landscape' : 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidth = pageWidth / Math.max(1, table.columns.length);
    const rowHeight = 18;

    doc.fontSize(14).font('Helvetica-Bold').text(table.title);
    doc.moveDown(0.5);

    const drawRow = (cells: string[], bold: boolean) => {
      if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
      }
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      cells.forEach((cell, index) => {
        doc.text(cell, doc.page.margins.left + index * colWidth, y, {
          width: colWidth - 4,
          height: rowHeight,
          ellipsis: true,
          lineBreak: false,
        });
      });
      doc.y = y + rowHeight;
      doc.x = doc.page.margins.left;
    };

    drawRow(table.columns.map((c) => c.label), true);
    for (const row of table.rows) {
      drawRow(
        table.columns.map((c) => {
          const value = row[c.key];
          return value === undefined || value === null ? '' : String(value);
        }),
        false,
      );
    }

    doc.end();
  });
}

export async function renderReport(format: ReportFormat, table: ReportTable): Promise<Buffer> {
  switch (format) {
    case 'csv':
      return renderCsv(table);
    case 'xlsx':
      return renderXlsx(table);
    case 'pdf':
      return renderPdf(table);
  }
}

export function reportFilename(title: string, format: ReportFormat): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';
  return `${slug}.${format}`;
}
