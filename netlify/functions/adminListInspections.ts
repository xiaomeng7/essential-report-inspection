/**
 * Admin API: List inspections with pagination, search, and date filtering.
 * Route: /api/admin/inspections (add redirect in netlify.toml).
 * Auth: Bearer ADMIN_TOKEN (same as admin.ts).
 */

import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { sql, isDbConfigured } from "./lib/db";

function checkAuth(event: HandlerEvent): boolean {
  const auth = event.headers.authorization || event.headers.Authorization;
  const token = process.env.ADMIN_TOKEN || "admin-secret-token-change-me";
  return auth === `Bearer ${token}`;
}

function json(body: unknown, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (!checkAuth(event)) {
    return json({ error: "Unauthorized" }, 401);
  }

  if (event.httpMethod !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!isDbConfigured()) {
    return json({ error: "Database not configured (NEON_DATABASE_URL)" }, 503);
  }

  try {
    const params = event.queryStringParameters ?? {};
    const limit = Math.min(100, Math.max(1, parseInt(params.limit ?? "50", 10) || 50));
    const q = (params.q ?? "").trim();
    const fromDate = params.from_date ? params.from_date.trim() : null;
    const toDate = params.to_date ? params.to_date.trim() : null;

    const db = sql();
    
    // Build WHERE conditions using Neon's sql template
    const searchPattern = q ? `%${q}%` : null;
    
    // Get total count (approximate)
    let countResult;
    if (q && fromDate && toDate) {
      countResult = await db`
        SELECT COUNT(*) as total
        FROM inspections
        WHERE (property_address ILIKE ${searchPattern} OR inspection_id ILIKE ${searchPattern})
          AND assessment_date >= ${fromDate}::date
          AND assessment_date <= ${toDate}::date
      `;
    } else if (q && fromDate) {
      countResult = await db`
        SELECT COUNT(*) as total
        FROM inspections
        WHERE (property_address ILIKE ${searchPattern} OR inspection_id ILIKE ${searchPattern})
          AND assessment_date >= ${fromDate}::date
      `;
    } else if (q && toDate) {
      countResult = await db`
        SELECT COUNT(*) as total
        FROM inspections
        WHERE (property_address ILIKE ${searchPattern} OR inspection_id ILIKE ${searchPattern})
          AND assessment_date <= ${toDate}::date
      `;
    } else if (fromDate && toDate) {
      countResult = await db`
        SELECT COUNT(*) as total
        FROM inspections
        WHERE assessment_date >= ${fromDate}::date
          AND assessment_date <= ${toDate}::date
      `;
    } else if (q) {
      countResult = await db`
        SELECT COUNT(*) as total
        FROM inspections
        WHERE property_address ILIKE ${searchPattern} OR inspection_id ILIKE ${searchPattern}
      `;
    } else if (fromDate) {
      countResult = await db`
        SELECT COUNT(*) as total
        FROM inspections
        WHERE assessment_date >= ${fromDate}::date
      `;
    } else if (toDate) {
      countResult = await db`
        SELECT COUNT(*) as total
        FROM inspections
        WHERE assessment_date <= ${toDate}::date
      `;
    } else {
      countResult = await db`SELECT COUNT(*) as total FROM inspections`;
    }
    
    const totalApprox = countResult[0]?.total ? Number(countResult[0].total) : 0;

    // Get items
    let items;
    if (q && fromDate && toDate) {
      items = await db`
        SELECT 
          inspection_id,
          assessment_date,
          property_address,
          overall_status,
          risk_rating,
          capex_low,
          capex_high,
          created_at
        FROM inspections
        WHERE (property_address ILIKE ${searchPattern} OR inspection_id ILIKE ${searchPattern})
          AND assessment_date >= ${fromDate}::date
          AND assessment_date <= ${toDate}::date
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (q && fromDate) {
      items = await db`
        SELECT 
          inspection_id,
          assessment_date,
          property_address,
          overall_status,
          risk_rating,
          capex_low,
          capex_high,
          created_at
        FROM inspections
        WHERE (property_address ILIKE ${searchPattern} OR inspection_id ILIKE ${searchPattern})
          AND assessment_date >= ${fromDate}::date
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (q && toDate) {
      items = await db`
        SELECT 
          inspection_id,
          assessment_date,
          property_address,
          overall_status,
          risk_rating,
          capex_low,
          capex_high,
          created_at
        FROM inspections
        WHERE (property_address ILIKE ${searchPattern} OR inspection_id ILIKE ${searchPattern})
          AND assessment_date <= ${toDate}::date
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (fromDate && toDate) {
      items = await db`
        SELECT 
          inspection_id,
          assessment_date,
          property_address,
          overall_status,
          risk_rating,
          capex_low,
          capex_high,
          created_at
        FROM inspections
        WHERE assessment_date >= ${fromDate}::date
          AND assessment_date <= ${toDate}::date
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (q) {
      items = await db`
        SELECT 
          inspection_id,
          assessment_date,
          property_address,
          overall_status,
          risk_rating,
          capex_low,
          capex_high,
          created_at
        FROM inspections
        WHERE property_address ILIKE ${searchPattern} OR inspection_id ILIKE ${searchPattern}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (fromDate) {
      items = await db`
        SELECT 
          inspection_id,
          assessment_date,
          property_address,
          overall_status,
          risk_rating,
          capex_low,
          capex_high,
          created_at
        FROM inspections
        WHERE assessment_date >= ${fromDate}::date
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (toDate) {
      items = await db`
        SELECT 
          inspection_id,
          assessment_date,
          property_address,
          overall_status,
          risk_rating,
          capex_low,
          capex_high,
          created_at
        FROM inspections
        WHERE assessment_date <= ${toDate}::date
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      items = await db`
        SELECT 
          inspection_id,
          assessment_date,
          property_address,
          overall_status,
          risk_rating,
          capex_low,
          capex_high,
          created_at
        FROM inspections
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }

    return json({
      items: items.map((row) => ({
        inspection_id: row.inspection_id,
        assessment_date: row.assessment_date ? new Date(row.assessment_date).toISOString().split('T')[0] : null,
        property_address: row.property_address,
        overall_status: row.overall_status,
        risk_rating: row.risk_rating,
        capex_low: row.capex_low,
        capex_high: row.capex_high,
        created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
      totalApprox,
    });
  } catch (e) {
    console.error("[adminListInspections] Error:", e);
    return json(
      {
        error: "Failed to list inspections",
        message: e instanceof Error ? e.message : String(e),
      },
      500
    );
  }
};
