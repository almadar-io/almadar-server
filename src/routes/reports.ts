/**
 * Report Export Route (Express)
 *
 * `POST /export` with `{ format: 'csv'|'xlsx'|'pdf', title, columns, rows }`
 * renders the tabular report server-side and streams the file back with a
 * download disposition. Mount under the authenticated `/api` scope — reports
 * expose business data. Hono twin in `@almadar/server-hono`.
 *
 * @packageDocumentation
 */

import { Router, type Request, type Response } from 'express';
import {
  renderReport,
  reportFilename,
  REPORT_CONTENT_TYPES,
  type ReportFormat,
  type ReportTable,
} from '../lib/reportExport.js';

const router: ReturnType<typeof Router> = Router();

router.post('/export', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { format?: string; title?: string; columns?: ReportTable['columns']; rows?: ReportTable['rows'] };
  const format = body.format as ReportFormat;
  if (!['csv', 'xlsx', 'pdf'].includes(format)) {
    res.status(400).json({ error: `format must be csv, xlsx, or pdf (got ${body.format ?? 'nothing'})` });
    return;
  }
  if (!Array.isArray(body.columns) || body.columns.length === 0 || !Array.isArray(body.rows)) {
    res.status(400).json({ error: 'columns (non-empty) and rows arrays are required' });
    return;
  }

  const table: ReportTable = {
    title: body.title || 'Report',
    columns: body.columns,
    rows: body.rows,
  };
  const file = await renderReport(format, table);
  res
    .status(200)
    .set('Content-Type', REPORT_CONTENT_TYPES[format])
    .set('Content-Disposition', `attachment; filename="${reportFilename(table.title, format)}"`)
    .send(file);
});

export { router as reportsRouter };
