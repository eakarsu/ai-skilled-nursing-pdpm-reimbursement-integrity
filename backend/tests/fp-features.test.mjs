import test from "node:test";
import assert from "node:assert/strict";
import { filterRecords, recordsToCsv, recordsToJson, buildInsights } from "../fp-features.mjs";

const rows = [
  { id: 1, reference: "F01-1", title: "Alpha wafer lot", status: "Open", owner: "Sam", risk: "High", due_date: "2020-01-01", amount: 0, payload: { evidenceState: "Incomplete", paidAmount: 10, expectedAmount: 25, creditedAmount: 10, eligibleSettlement: 25, receivedAmount: 10, entitledAmount: 25 } },
  { id: 2, reference: "F01-2", title: "Beta lot", status: "Closed", owner: "Jo", risk: "Low", due_date: "2999-01-01", amount: 50, payload: { evidenceState: "Complete" } },
];

test("search and status/risk filters narrow the main list", () => {
  assert.equal(filterRecords(rows, { q: "alpha" }).length, 1);
  assert.equal(filterRecords(rows, { q: "ALPHA" }).length, 1);
  assert.equal(filterRecords(rows, { status: "Closed" })[0].id, 2);
  assert.equal(filterRecords(rows, { risk: "High" }).length, 1);
  assert.equal(filterRecords(rows, { q: "missing" }).length, 0);
  assert.equal(filterRecords(rows).length, 2);
});

test("CSV/JSON export preserves 0 and false values", () => {
  const csv = recordsToCsv(rows);
  assert.ok(csv.split("\n")[0].includes("amount"));
  assert.ok(csv.includes(",0"), "amount 0 must be rendered, not dropped");
  assert.equal(JSON.parse(recordsToJson(rows))[0].amount, 0);
  assert.ok(recordsToCsv([]).includes("reference"), "empty export still has a header");
});

test("deterministic insights are labelled aiGenerated:false and preserve zero counts", () => {
  const calc = { actualKey: "creditedAmount", expectedKey: "eligibleSettlement" };
  const out = buildInsights({ id: "f1", title: "Yield review" }, rows, calc, new Date("2026-01-01"));
  assert.equal(out.aiGenerated, false);
  assert.equal(out.recordCount, 2);
  assert.equal(out.insights.length, 3);
  assert.ok(out.insights.every((i) => i.aiGenerated === false));
  const empty = buildInsights({ id: "f1", title: "Yield review" }, [], calc);
  assert.equal(empty.recordCount, 0);
  assert.equal(empty.insights[0].metrics[0].value, 0);
  assert.deepEqual(empty.insights[2].sections[0].detail, []);
});
