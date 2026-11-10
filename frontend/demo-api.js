const STORAGE_KEY = "chengchuan-static-bank-v1";
const DB_VERSION = 1;
const NETWORK_DELAY_MS = 120;

const USERS = {
  demo: {
    id: "usr_demo_001",
    username: "demo",
    password: "Bank@2026",
    displayName: "林知夏",
    role: "CUSTOMER",
    customerNo: "C20260001",
    riskTier: "STANDARD"
  },
  admin: {
    id: "usr_admin_001",
    username: "admin",
    password: "Admin@2026",
    displayName: "运营管理员",
    role: "ADMIN",
    customerNo: "A20260001",
    riskTier: "TRUSTED"
  }
};

class DemoApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "DemoApiError";
    this.status = status;
    this.code = code;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    customerNo: user.customerNo,
    riskTier: user.riskTier
  };
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function createInitialDatabase() {
  const now = new Date();
  const iso = now.toISOString();
  return {
    version: DB_VERSION,
    sessions: {},
    accounts: [
      {
        id: "acc_demo_checking",
        userId: USERS.demo.id,
        accountNo: "622288001000001",
        accountName: "日常结算账户",
        accountType: "CHECKING",
        currency: "CNY",
        balanceCents: 2_864_050,
        availableBalanceCents: 2_864_050,
        status: "ACTIVE",
        version: 3,
        createdAt: iso,
        updatedAt: iso
      },
      {
        id: "acc_demo_savings",
        userId: USERS.demo.id,
        accountNo: "622288001000002",
        accountName: "安心储蓄账户",
        accountType: "SAVINGS",
        currency: "CNY",
        balanceCents: 12_000_000,
        availableBalanceCents: 12_000_000,
        status: "ACTIVE",
        version: 1,
        createdAt: iso,
        updatedAt: iso
      },
      {
        id: "acc_merchant_001",
        userId: "usr_demo_merchant",
        accountNo: "622288001000003",
        accountName: "鹭湾商贸有限公司",
        accountType: "BUSINESS",
        currency: "CNY",
        balanceCents: 5_000_000,
        availableBalanceCents: 5_000_000,
        status: "ACTIVE",
        version: 1,
        createdAt: iso,
        updatedAt: iso
      }
    ],
    transactions: [
      {
        id: "txn_seed_deposit",
        requestId: "seed-deposit",
        userId: USERS.demo.id,
        type: "DEPOSIT",
        sourceAccountId: "acc_demo_checking",
        targetAccountId: null,
        targetAccountNo: null,
        externalBankCode: null,
        amountCents: 250_000,
        status: "SUCCESS",
        riskDecision: "APPROVE",
        riskScore: 0,
        riskReasons: [],
        note: "项目经费入账",
        failureReason: null,
        externalReference: null,
        reviewedBy: null,
        createdAt: new Date(now.getTime() - 36 * 60 * 1000).toISOString(),
        updatedAt: iso,
        completedAt: iso
      },
      {
        id: "txn_seed_transfer",
        requestId: "seed-transfer",
        userId: USERS.demo.id,
        type: "TRANSFER_INTERNAL",
        sourceAccountId: "acc_demo_checking",
        targetAccountId: "acc_merchant_001",
        targetAccountNo: "622288001000003",
        externalBankCode: null,
        amountCents: 80_000,
        status: "SUCCESS",
        riskDecision: "APPROVE",
        riskScore: 0,
        riskReasons: [],
        note: "办公用品采购",
        failureReason: null,
        externalReference: null,
        reviewedBy: null,
        createdAt: new Date(now.getTime() - 18 * 60 * 1000).toISOString(),
        updatedAt: iso,
        completedAt: iso
      },
      {
        id: "txn_seed_risk",
        requestId: "seed-risk",
        userId: USERS.demo.id,
        type: "TRANSFER_EXTERNAL",
        sourceAccountId: "acc_demo_checking",
        targetAccountId: null,
        targetAccountNo: "6217000000009999",
        externalBankCode: "9999",
        amountCents: 10_000,
        status: "FAILED",
        riskDecision: "REJECT",
        riskScore: 100,
        riskReasons: [
          {
            level: "REJECT",
            code: "HIGH_RISK_CHANNEL",
            message: "收款机构命中高风险名单"
          }
        ],
        note: "高风险渠道演示",
        failureReason: "收款机构命中高风险名单",
        externalReference: null,
        reviewedBy: null,
        createdAt: new Date(now.getTime() - 8 * 60 * 1000).toISOString(),
        updatedAt: iso,
        completedAt: iso
      }
    ],
    ledger: [
      {
        id: "led_seed_deposit",
        accountId: "acc_demo_checking",
        accountNo: "622288001000001",
        accountName: "日常结算账户",
        transactionId: "txn_seed_deposit",
        direction: "CREDIT",
        amountCents: 250_000,
        balanceAfterCents: 2_864_050,
        description: "项目经费入账",
        createdAt: new Date(now.getTime() - 36 * 60 * 1000).toISOString()
      },
      {
        id: "led_seed_transfer",
        accountId: "acc_demo_checking",
        accountNo: "622288001000001",
        accountName: "日常结算账户",
        transactionId: "txn_seed_transfer",
        direction: "DEBIT",
        amountCents: 80_000,
        balanceAfterCents: 2_784_050,
        description: "办公用品采购",
        createdAt: new Date(now.getTime() - 18 * 60 * 1000).toISOString()
      }
    ]
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

function resolveStorage() {
  try {
    const testKey = `${STORAGE_KEY}-test`;
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return localStorage;
  } catch {
    return createMemoryStorage();
  }
}

function delay(milliseconds = NETWORK_DELAY_MS) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function randomId(prefix) {
  const value = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${value.replaceAll("-", "")}`;
}

class DemoBank {
  constructor(storage) {
    this.storage = storage;
    this.db = this.load();
  }

  load() {
    const stored = this.storage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.version === DB_VERSION) return parsed;
      } catch {
        this.storage.removeItem(STORAGE_KEY);
      }
    }
    const initial = createInitialDatabase();
    this.persist(initial);
    return initial;
  }

  persist(database = this.db) {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(database));
  }

  userForToken(token) {
    const userId = this.db.sessions[token];
    return Object.values(USERS).find((user) => user.id === userId) ?? null;
  }

  requireUser(headers = {}) {
    const authorization = headers.authorization ?? headers.Authorization ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const user = this.userForToken(token);
    if (!user) throw new DemoApiError(401, "INVALID_SESSION", "登录状态已失效");
    return user;
  }

  async request(path, options = {}) {
    await delay();
    const method = String(options.method ?? "GET").toUpperCase();
    const url = new URL(path, "https://static-bank.local");
    const pathname = url.pathname;
    const body = options.body ? JSON.parse(options.body) : {};
    const headers = options.headers ?? {};

    if (pathname === "/api/login" && method === "POST") {
      const user = USERS[String(body.username ?? "").trim()];
      if (!user || body.password !== user.password) {
        throw new DemoApiError(401, "INVALID_CREDENTIALS", "用户名或密码错误");
      }
      const token = randomId("demo_token");
      this.db.sessions[token] = user.id;
      this.persist();
      return clone({ token, user: publicUser(user) });
    }

    const user = this.requireUser(headers);

    if (pathname === "/api/session" && method === "GET") {
      return clone({ user: publicUser(user) });
    }

    if (pathname === "/api/accounts" && method === "GET") {
      return clone({
        accounts: this.db.accounts.filter((account) => account.userId === user.id)
      });
    }

    if (pathname === "/api/ledger" && method === "GET") {
      const accountIds = new Set(
        this.db.accounts
          .filter((account) => account.userId === user.id)
          .map((account) => account.id)
      );
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 20), 100));
      return clone({
        entries: this.db.ledger
          .filter((entry) => accountIds.has(entry.accountId))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit)
      });
    }

    if (pathname === "/api/transactions" && method === "GET") {
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 20), 100));
      return clone({
        transactions: this.db.transactions
          .filter((transaction) => transaction.userId === user.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit)
      });
    }

    if (pathname === "/api/transactions" && method === "POST") {
      return clone({ transaction: this.createTransaction(user, body) });
    }

    if (pathname === "/api/admin/transactions" && method === "GET") {
      if (user.role !== "ADMIN") {
        throw new DemoApiError(403, "ADMIN_REQUIRED", "仅管理员可执行此操作");
      }
      const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 50), 100));
      return clone({
        transactions: this.db.transactions
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, limit)
      });
    }

    const reviewMatch = pathname.match(/^\/api\/admin\/transactions\/([^/]+)\/review$/);
    if (reviewMatch && method === "POST") {
      if (user.role !== "ADMIN") {
        throw new DemoApiError(403, "ADMIN_REQUIRED", "仅管理员可执行此操作");
      }
      return clone({
        transaction: this.reviewTransaction(decodeURIComponent(reviewMatch[1]), body.decision, user.id)
      });
    }

    throw new DemoApiError(404, "NOT_FOUND", `演示接口不存在：${method} ${pathname}`);
  }

  createTransaction(user, body) {
    const requestId = String(body.requestId ?? "").trim();
    if (!requestId) throw new DemoApiError(400, "REQUEST_ID_REQUIRED", "缺少幂等请求编号");

    const existing = this.db.transactions.find(
      (transaction) => transaction.userId === user.id && transaction.requestId === requestId
    );
    if (existing) return existing;

    const type = String(body.type ?? "").toUpperCase();
    if (!["DEPOSIT", "WITHDRAW", "TRANSFER_INTERNAL", "TRANSFER_EXTERNAL"].includes(type)) {
      throw new DemoApiError(400, "INVALID_TRANSACTION_TYPE", "不支持的交易类型");
    }

    const amountCents = Number(body.amountCents);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new DemoApiError(400, "INVALID_AMOUNT", "金额必须是大于 0 的整数分");
    }

    const source = this.db.accounts.find(
      (account) => account.id === body.accountId && account.userId === user.id
    );
    if (!source) throw new DemoApiError(403, "ACCOUNT_FORBIDDEN", "无权操作该账户");
    if (source.status !== "ACTIVE") {
      throw new DemoApiError(409, "ACCOUNT_NOT_ACTIVE", "账户状态不允许当前操作");
    }

    let target = null;
    if (type === "TRANSFER_INTERNAL") {
      target = this.db.accounts.find(
        (account) => account.accountNo === String(body.targetAccountNo ?? "").replace(/\s/g, "")
      );
      if (!target) throw new DemoApiError(404, "ACCOUNT_NOT_FOUND", "收款账户不存在");
      if (target.id === source.id) {
        throw new DemoApiError(400, "SAME_ACCOUNT", "付款账户与收款账户不能相同");
      }
    }

    const outbound = type !== "DEPOSIT";
    if (outbound && source.availableBalanceCents < amountCents) {
      throw new DemoApiError(422, "INSUFFICIENT_BALANCE", "账户可用余额不足");
    }

    const risk = evaluateRisk({ type, amountCents, externalBankCode: body.externalBankCode });
    const now = new Date().toISOString();
    const transaction = {
      id: randomId("txn"),
      requestId,
      userId: user.id,
      type,
      sourceAccountId: source.id,
      targetAccountId: target?.id ?? null,
      targetAccountNo: body.targetAccountNo ?? null,
      externalBankCode: body.externalBankCode ?? null,
      amountCents,
      status: risk.decision === "APPROVE"
        ? "SUCCESS"
        : risk.decision === "REVIEW"
          ? "UNDER_REVIEW"
          : "FAILED",
      riskDecision: risk.decision,
      riskScore: risk.score,
      riskReasons: risk.reasons,
      note: String(body.note ?? "").trim(),
      failureReason: risk.decision === "REJECT" ? risk.reasons[0].message : null,
      externalReference: null,
      reviewedBy: null,
      createdAt: now,
      updatedAt: now,
      completedAt: risk.decision === "APPROVE" ? now : null
    };
    this.db.transactions.push(transaction);
    if (risk.decision === "APPROVE") this.postTransaction(transaction, source, target);
    this.persist();
    return transaction;
  }

  reviewTransaction(transactionId, decision, reviewerId) {
    const transaction = this.db.transactions.find((item) => item.id === transactionId);
    if (!transaction) throw new DemoApiError(404, "TRANSACTION_NOT_FOUND", "交易不存在");
    if (transaction.status !== "UNDER_REVIEW") {
      throw new DemoApiError(409, "TRANSACTION_NOT_REVIEWABLE", "当前交易不处于待复核状态");
    }
    if (!["APPROVE", "REJECT"].includes(decision)) {
      throw new DemoApiError(400, "INVALID_REVIEW_DECISION", "复核结论不正确");
    }

    transaction.reviewedBy = reviewerId;
    transaction.updatedAt = new Date().toISOString();
    if (decision === "REJECT") {
      transaction.status = "FAILED";
      transaction.failureReason = "人工复核拒绝";
      this.persist();
      return transaction;
    }

    const source = this.db.accounts.find(
      (account) => account.id === transaction.sourceAccountId
    );
    const target = this.db.accounts.find(
      (account) => account.id === transaction.targetAccountId
    );
    if (!source) throw new DemoApiError(404, "ACCOUNT_NOT_FOUND", "付款账户不存在");
    if (transaction.type !== "DEPOSIT" && source.availableBalanceCents < transaction.amountCents) {
      throw new DemoApiError(422, "INSUFFICIENT_BALANCE", "账户可用余额不足");
    }
    this.postTransaction(transaction, source, target);
    transaction.status = "SUCCESS";
    transaction.failureReason = null;
    transaction.completedAt = new Date().toISOString();
    this.persist();
    return transaction;
  }

  postTransaction(transaction, source, target) {
    const now = new Date().toISOString();
    if (transaction.type === "DEPOSIT") {
      source.balanceCents += transaction.amountCents;
      source.availableBalanceCents += transaction.amountCents;
      this.addLedger(source, transaction, "CREDIT", now);
    } else {
      source.balanceCents -= transaction.amountCents;
      source.availableBalanceCents -= transaction.amountCents;
      this.addLedger(source, transaction, "DEBIT", now);
      if (transaction.type === "TRANSFER_INTERNAL" && target) {
        target.balanceCents += transaction.amountCents;
        target.availableBalanceCents += transaction.amountCents;
        this.addLedger(target, transaction, "CREDIT", now);
      }
    }
    source.version += 1;
    source.updatedAt = now;
    if (target && transaction.type === "TRANSFER_INTERNAL") {
      target.version += 1;
      target.updatedAt = now;
    }
  }

  addLedger(account, transaction, direction, createdAt) {
    this.db.ledger.push({
      id: randomId("led"),
      accountId: account.id,
      accountNo: account.accountNo,
      accountName: account.accountName,
      transactionId: transaction.id,
      direction,
      amountCents: transaction.amountCents,
      balanceAfterCents: account.balanceCents,
      description: transaction.note || "账户交易",
      createdAt
    });
  }
}

function evaluateRisk({ type, amountCents, externalBankCode }) {
  if (String(externalBankCode ?? "") === "9999") {
    return {
      decision: "REJECT",
      score: 100,
      reasons: [{
        level: "REJECT",
        code: "HIGH_RISK_CHANNEL",
        message: "收款机构命中高风险名单"
      }]
    };
  }
  if (type !== "DEPOSIT" && amountCents > 20_000_000) {
    return {
      decision: "REJECT",
      score: 80,
      reasons: [{
        level: "REJECT",
        code: "AMOUNT_HARD_LIMIT",
        message: "单笔金额超过自动处理上限"
      }]
    };
  }
  if (type !== "DEPOSIT" && amountCents > 5_000_000) {
    return {
      decision: "REVIEW",
      score: 35,
      reasons: [{
        level: "REVIEW",
        code: "LARGE_AMOUNT",
        message: "单笔金额较大，需要人工复核"
      }]
    };
  }
  return { decision: "APPROVE", score: 0, reasons: [] };
}

const storage = resolveStorage();
const demoBank = new DemoBank(storage);

export async function demoRequest(path, options = {}) {
  return demoBank.request(path, options);
}

export function resetDemoDatabase() {
  storage.removeItem(STORAGE_KEY);
  demoBank.db = createInitialDatabase();
  demoBank.persist();
}
