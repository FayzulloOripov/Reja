import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb, createUser, rejects, type Db, type TestUser } from "./harness";

// Phase 6 rules enforced by the database: deal stages and history, lost reasons, expense
// approvals by the other partner, document versions and linked tasks.

let db: Db;
let owner: TestUser, partner: TestUser;
let W: string;
let open: string, won: string, lost: string;

const one = async <T = string>(u: TestUser, sql: string, params: unknown[] = []) =>
  as(db, u, async (tx) => (await tx.query<{ v: T }>(sql, params)).rows[0]?.v);

beforeAll(async () => {
  db = await createDb();
  owner = await createUser(db, "biz-owner@example.test", "Owner");
  partner = await createUser(db, "biz-partner@example.test", "Partner");
  W = await as(db, owner, async (tx) => {
    const id = (await tx.query<{ id: string }>(`insert into workspaces (name, owner_id) values ('Biz', $1) returning id`, [owner.id])).rows[0].id;
    await tx.query(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'member')`, [id, partner.id]);
    await tx.query(`update workspaces set approval_threshold_uzs = 5000000, usd_rate = 12800 where id = $1`, [id]);
    return id;
  });
  open = await one(owner, `insert into deal_stages (workspace_id, name, kind, position) values ($1, 'Lead', 'open', 1) returning id as v`, [W]);
  won = await one(owner, `insert into deal_stages (workspace_id, name, kind, position) values ($1, 'Won', 'won', 2) returning id as v`, [W]);
  lost = await one(owner, `insert into deal_stages (workspace_id, name, kind, position) values ($1, 'Lost', 'lost', 3) returning id as v`, [W]);
});

describe("pipeline", () => {
  it("records every stage move and stamps the close", async () => {
    const deal = await one(owner, `insert into deals (workspace_id, stage_id, title, value) values ($1, $2, 'Clinic', 1000) returning id as v`, [W, open]);
    await as(db, partner, (tx) => tx.query(`update deals set stage_id = $1 where id = $2`, [won, deal]));
    const history = await as(db, owner, async (tx) => (await tx.query(`select from_stage_id, to_stage_id, changed_by from deal_stage_history where deal_id = $1 order by changed_at, from_stage_id nulls first`, [deal])).rows);
    expect(history).toEqual([
      { from_stage_id: null, to_stage_id: open, changed_by: owner.id },
      { from_stage_id: open, to_stage_id: won, changed_by: partner.id },
    ]);
    expect(await one(owner, `select closed_at is not null as v from deals where id = $1`, [deal])).toBe(true);
  });

  it("a lost deal needs a reason", async () => {
    const deal = await one(owner, `insert into deals (workspace_id, stage_id, title) values ($1, $2, 'Shop') returning id as v`, [W, open]);
    expect(await rejects(as(db, owner, (tx) => tx.query(`update deals set stage_id = $1 where id = $2`, [lost, deal])))).toMatch(/needs a reason/);
    await as(db, owner, (tx) => tx.query(`update deals set stage_id = $1, lost_reason = 'Too expensive' where id = $2`, [lost, deal]));
  });

  it("history cannot be written by hand, and members cannot change the stages", async () => {
    expect(await rejects(as(db, owner, (tx) => tx.query(`insert into deal_stage_history (deal_id, workspace_id) select id, workspace_id from deals limit 1`)))).toMatch(/permission/);
    expect(await as(db, partner, async (tx) => (await tx.query(`update deal_stages set name = 'x' where workspace_id = $1 returning 1`, [W])).rows.length)).toBe(0);
  });

  it("a stage from another workspace is refused", async () => {
    const otherStage = await one(owner, `insert into deal_stages (workspace_id, name) values ($1, 'Mine') returning id as v`, [owner.personalWorkspace]);
    expect(await rejects(as(db, owner, (tx) => tx.query(`insert into deals (workspace_id, stage_id, title) values ($1, $2, 'x')`, [W, otherStage])))).toMatch(/another workspace/);
  });
});

describe("money", () => {
  it("a large expense waits for the other partner; the author cannot approve it", async () => {
    const id = await one(owner, `insert into money_entries (workspace_id, kind, amount, status) values ($1, 'expense', 6000000, 'approved') returning id as v`, [W]);
    expect(await one(owner, `select status as v from money_entries where id = $1`, [id])).toBe("pending");
    expect(await rejects(as(db, owner, (tx) => tx.query(`update money_entries set status = 'approved' where id = $1`, [id])))).toMatch(/Another partner/);
    await as(db, partner, (tx) => tx.query(`update money_entries set status = 'approved' where id = $1`, [id]));
    const row = await as(db, owner, async (tx) => (await tx.query(`select status, approved_by from money_entries where id = $1`, [id])).rows[0]);
    expect(row).toEqual({ status: "approved", approved_by: partner.id });
    // raising the amount sends it back for approval
    await as(db, owner, (tx) => tx.query(`update money_entries set amount = 7000000 where id = $1`, [id]));
    expect(await one(owner, `select status as v from money_entries where id = $1`, [id])).toBe("pending");
  });

  it("small expenses and income are approved at once; USD is converted at the entry's rate", async () => {
    const id = await one(owner, `insert into money_entries (workspace_id, kind, amount, currency, rate) values ($1, 'income', 100, 'USD', 12500) returning id as v`, [W]);
    const row = await as(db, owner, async (tx) => (await tx.query(`select status, amount_uzs::float as uzs from money_entries where id = $1`, [id])).rows[0]);
    expect(row).toEqual({ status: "approved", uzs: 1250000 });
    expect(await rejects(as(db, owner, (tx) => tx.query(`insert into money_entries (workspace_id, kind, amount, currency) values ($1, 'income', 5, 'USD')`, [W])))).toMatch(/check/);
  });
});

describe("docs", () => {
  it("keeps the previous text as a version, and links tasks of the same workspace", async () => {
    const project = await one(owner, `insert into projects (workspace_id, name, owner_id) values ($1, 'P', $2) returning id as v`, [W, owner.id]);
    const note = await one(owner, `insert into notes (workspace_id, project_id, title, content) values ($1, $2, 'SOP', '{"v":1}') returning id as v`, [W, project]);
    await as(db, owner, (tx) => tx.query(`update notes set content = '{"v":2}' where id = $1`, [note]));
    // a quick second save by the same author does not add another version
    await as(db, owner, (tx) => tx.query(`update notes set content = '{"v":3}' where id = $1`, [note]));
    // a different author does
    await as(db, partner, (tx) => tx.query(`update notes set content = '{"v":4}' where id = $1`, [note]));
    const versions = await as(db, owner, async (tx) => (await tx.query(`select content, created_by from note_versions where note_id = $1 order by created_at, (content->>'v')`, [note])).rows);
    expect(versions).toEqual([
      { content: { v: 1 }, created_by: owner.id },
      { content: { v: 3 }, created_by: partner.id },
    ]);
    const task = await one(owner, `insert into tasks (workspace_id, project_id, title) values ($1, $2, 'Use the SOP') returning id as v`, [W, project]);
    await as(db, partner, (tx) => tx.query(`insert into note_tasks (note_id, task_id) values ($1, $2)`, [note, task]));
    const elsewhere = await one(owner, `insert into tasks (workspace_id, title) values ($1, 'Private') returning id as v`, [owner.personalWorkspace]);
    expect(await rejects(as(db, owner, (tx) => tx.query(`insert into note_tasks (note_id, task_id) values ($1, $2)`, [note, elsewhere])))).toMatch(/same workspace/);
  });
});
