import assert from "node:assert/strict";
import test from "node:test";

import { demoRequest, resetDemoDatabase } from "../frontend/demo-api.js";

async function login(username, password) {
  return demoRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

function auth(token) {
  return { authorization: `Bearer ${token}` };
}

test.beforeEach(() => {
  resetDemoDatabase();
});

test("customer can login, deposit and query accounts", async () => {
  const session = await login("demo", "Bank@2026");
  assert.equal(session.user.role, "CUSTOMER");

  const before = await demoRequest("/api/accounts", { headers: auth(session.token) });
  const checking = before.accounts.find((account) => account.id === "acc_demo_checking");

  const deposit = await demoRequest("/api/transactions", {
    method: "POST",
    headers: auth(session.token),
    body: JSON.stringify({
      requestId: "static-deposit-1",
      type: "DEPOSIT",
      accountId: checking.id,
      amountCents: 12_345,
      note: "静态演示存款"
    })
  });
  assert.equal(deposit.transaction.status, "SUCCESS");

  const after = await demoRequest("/api/accounts", { headers: auth(session.token) });
  assert.equal(
    after.accounts.find((account) => account.id === checking.id).balanceCents,
    checking.balanceCents + 12_345
  );
});

test("duplicate requestId does not deposit twice", async () => {
  const session = await login("demo", "Bank@2026");
  const payload = {
    requestId: "static-idempotency-1",
    type: "DEPOSIT",
    accountId: "acc_demo_checking",
    amountCents: 5_000,
    note: "重复请求测试"
  };
  const first = await demoRequest("/api/transactions", {
    method: "POST",
    headers: auth(session.token),
    body: JSON.stringify(payload)
  });
  const second = await demoRequest("/api/transactions", {
    method: "POST",
    headers: auth(session.token),
    body: JSON.stringify(payload)
  });
  assert.equal(first.transaction.id, second.transaction.id);
});

test("admin can approve a reviewed transfer", async () => {
  const customer = await login("demo", "Bank@2026");
  const transfer = await demoRequest("/api/transactions", {
    method: "POST",
    headers: auth(customer.token),
    body: JSON.stringify({
      requestId: "static-review-1",
      type: "TRANSFER_INTERNAL",
      accountId: "acc_demo_savings",
      targetAccountNo: "622288001000003",
      amountCents: 5_200_000,
      note: "大额转账人工复核"
    })
  });
  assert.equal(transfer.transaction.status, "UNDER_REVIEW");

  const admin = await login("admin", "Admin@2026");
  const review = await demoRequest(
    `/api/admin/transactions/${transfer.transaction.id}/review`,
    {
      method: "POST",
      headers: auth(admin.token),
      body: JSON.stringify({ decision: "APPROVE" })
    }
  );
  assert.equal(review.transaction.status, "SUCCESS");
});
