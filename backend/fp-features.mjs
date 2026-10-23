// Deterministic offline features over the app's own records.
// No provider call is made here; callers label results aiGenerated:false.
export const INSIGHT_TYPES = ["variance-summary", "evidence-gap-review", "priority-queue"];

function textOf(row) {
  const payload = row?.payload && typeof row.payload === "object" ? Object.values(row.payload).join(" ") : "";
  return [row?.title, row?.reference, row?.owner, row?.status, row?.risk, payload].filter((v) => v != null).join(" ").toLowerCase();
}

export function filterRecords(rows, { q = "", status = "", risk = "" } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  return (rows || []).filter((row) => {
    if (status && row.status !== status) return false;
    if (risk && row.risk !== risk) return false;
    if (needle && !textOf(row).includes(needle)) return false;
    return true;
  });
}

const CSV_COLUMNS = ["id", "reference", "title", "status", "owner", "risk", "due_date", "amount"];

function csvCell(value) {
  if (value === false) return "false";
  if (value === 0) return "0";
  if (value == null || value === "") return "";
  const s = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function recordsToCsv(rows) {
  const list = rows || [];
  return [CSV_COLUMNS.join(","), ...list.map((row) => CSV_COLUMNS.map((col) => csvCell(row[col])).join(","))].join("\n") + "\n";
}

export function recordsToJson(rows) {
  return JSON.stringify(rows || [], null, 2);
}

function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

export function buildInsights(feature, rows, calculation = null, now = new Date()) {
  const list = rows || [];
  const totalValue = list.reduce((sum, row) => sum + num(row.amount), 0);
  const byStatus = {};
  for (const row of list) byStatus[row.status || "Unspecified"] = (byStatus[row.status || "Unspecified"] || 0) + 1;
  const highRisk = list.filter((row) => ["High", "Critical"].includes(row.risk)).length;
  const open = list.filter((row) => !["Approved", "Closed"].includes(row.status)).length;
  const overdue = list.filter((row) => row.due_date && new Date(row.due_date) < now && !["Approved", "Closed"].includes(row.status)).length;
  let varianceTotal = 0; let varianceCount = 0;
  if (calculation?.actualKey && calculation?.expectedKey) {
    for (const row of list) {
      const payload = row.payload || {};
      if (payload[calculation.actualKey] != null && payload[calculation.expectedKey] != null) {
        varianceTotal += Math.max(0, num(payload[calculation.expectedKey]) - num(payload[calculation.actualKey]));
        varianceCount += 1;
      }
    }
  }
  const incomplete = list.filter((row) => ["Incomplete", "Exception"].includes(row.payload?.evidenceState)).length;
  const priority = list
    .filter((row) => ["High", "Critical"].includes(row.risk) || (row.due_date && new Date(row.due_date) < now))
    .slice(0, 10)
    .map((row) => ({ reference: row.reference ?? "", title: row.title ?? "", status: row.status ?? "", risk: row.risk ?? "", amount: num(row.amount) }));
  const base = { aiGenerated: false, source: "deterministic fallback", label: "Deterministic fallback — no AI provider was called" };
  return {
    ...base,
    featureId: feature?.id ?? "",
    featureTitle: feature?.title ?? "",
    recordCount: list.length,
    insights: [
      { ...base, type: "variance-summary", title: `${feature?.title ?? "Records"} — variance summary`,
        summary: list.length ? `${list.length} record(s) totalling ${totalValue} with ${open} open and ${highRisk} high-risk.` : "No records yet; counts are shown as 0.",
        metrics: [
          { label: "Records reviewed", value: list.length }, { label: "Total value", value: totalValue },
          { label: "Open records", value: open }, { label: "High-risk records", value: highRisk },
          { label: "Supported variance (from records with both amounts)", value: varianceTotal }, { label: "Records contributing variance", value: varianceCount },
        ],
        sections: [
          { title: "Status breakdown", detail: Object.keys(byStatus).length ? byStatus : { "No records": 0 } },
          { title: "Method", detail: "Counts and sums are computed directly from saved records. Zero and empty values are reported as-is." },
        ] },
      { ...base, type: "evidence-gap-review", title: `${feature?.title ?? "Records"} — evidence gap review`,
        summary: incomplete ? `${incomplete} record(s) have incomplete or exception evidence.` : "No incomplete or exception evidence flags were found (0).",
        metrics: [ { label: "Records reviewed", value: list.length }, { label: "Incomplete or exception evidence", value: incomplete } ],
        sections: [
          { title: "Evidence state", detail: { incompleteOrException: incomplete, reviewed: list.length } },
          { title: "Next step", detail: "Complete the missing evidence for flagged records, then re-run this review." },
        ] },
      { ...base, type: "priority-queue", title: `${feature?.title ?? "Records"} — priority queue`,
        summary: priority.length ? `${priority.length} record(s) need attention first (high risk or overdue).` : "No high-risk or overdue records (0).",
        metrics: [ { label: "Priority records", value: priority.length }, { label: "Overdue open records", value: overdue } ],
        sections: [
          { title: "Priority records", detail: priority },
          { title: "Ordering rule", detail: "High/Critical risk or past-due open records first; an empty queue is shown as an empty list." },
        ] },
    ],
  };
}
