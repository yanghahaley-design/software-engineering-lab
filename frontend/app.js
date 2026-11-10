import { demoRequest } from "./demo-api.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const staticQuery = new URLSearchParams(location.search);
const STATIC_DEMO_MODE =
  window.BANK_STATIC_DEMO === true ||
  location.hostname.endsWith("github.io") ||
  location.protocol === "file:" ||
  staticQuery.get("static") === "1" ||
  staticQuery.get("demo") === "1";

const state = {
  token: localStorage.getItem("chengchuan-token") ?? "",
  user: null,
  accounts: [],
  transactions: [],
  ledger: [],
  activeView: "overview",
  balanceHidden: false
};

const VIEW_META = {
  overview: ["个人网银", "资金总览"],
  accounts: ["账户管理", "我的账户"],
  transactions: ["资金往来", "交易记录"],
  risk: ["安全运营", "风控中心"]
};

const TYPE_META = {
  DEPOSIT: { label: "存入", short: "存款", sign: 1, icon: "i-arrow-down" },
  WITHDRAW: { label: "取出", short: "取款", sign: -1, icon: "i-arrow-up" },
  TRANSFER_INTERNAL: { label: "行内转账", short: "转账", sign: -1, icon: "i-transfer" },
  TRANSFER_EXTERNAL: { label: "跨行转账", short: "汇款", sign: -1, icon: "i-transfer" }
};

const STATUS_META = {
  SUCCESS: { label: "已完成", className: "" },
  FAILED: { label: "未通过", className: "is-failed" },
  UNDER_REVIEW: { label: "待复核", className: "is-review" },
  PROCESSING: { label: "处理中", className: "is-review" }
};

function formatMoney(cents) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2
  }).format(cents / 100);
}

function formatDate(value, includeTime = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  if (!includeTime) return `${date.getFullYear()}-${month}-${day}`;
  return `${month}-${day} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function maskAccount(accountNo) {
  if (!accountNo) return "";
  return accountNo.replace(/(\d{4})(\d{4})(\d+)/, "$1 $2 $3");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#${name}"></use></svg>`;
}

function setLoading(active) {
  $("#loadingBar").classList.toggle("is-active", active);
}

function showToast(title, message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast${type === "error" ? " is-error" : ""}`;
  toast.innerHTML = `
    ${icon(type === "error" ? "i-alert" : "i-check")}
    <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>
  `;
  $("#toastRegion").append(toast);
  setTimeout(() => toast.remove(), 4200);
}

async function api(path, options = {}) {
  const headers = {
    accept: "application/json",
    ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    ...(options.headers ?? {})
  };
  if (state.token) headers.authorization = `Bearer ${state.token}`;

  if (STATIC_DEMO_MODE) {
    try {
      return await demoRequest(path, { ...options, headers });
    } catch (error) {
      if (error.status === 401) logout(false);
      const wrapped = new Error(error.message || "演示请求处理失败");
      wrapped.code = error.code;
      throw wrapped;
    }
  }

  let response;
  try {
    response = await fetch(path, { ...options, headers });
  } catch {
    throw new Error("无法连接银行服务，请稍后重试");
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error("服务返回了无法解析的数据");
    }
  }

  if (!response.ok) {
    if (response.status === 401) logout(false);
    const error = new Error(payload.error?.message ?? "请求处理失败");
    error.code = payload.error?.code;
    throw error;
  }
  return payload;
}

function requestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setToday() {
  $("#todayLabel").textContent = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date());
}

function showLogin() {
  $("#appShell").classList.add("is-hidden");
  $("#loginScreen").classList.remove("is-hidden");
  $("#loginError").textContent = "";
}

function showApp(session) {
  state.user = session.user;
  $("#loginScreen").classList.add("is-hidden");
  $("#appShell").classList.remove("is-hidden");
  const initial = state.user.displayName.slice(0, 1);
  $("#sidebarAvatar").textContent = initial;
  $("#topbarAvatar").textContent = initial;
  $("#sidebarUserName").textContent = state.user.displayName;
  $("#sidebarCustomerNo").textContent = state.user.customerNo;
}

async function login(username, password) {
  const result = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  state.token = result.token;
  localStorage.setItem("chengchuan-token", result.token);
  showApp(result);
  await loadData();
  showView(state.user.role === "ADMIN" ? "risk" : "overview");
}

function logout(notify = true) {
  state.token = "";
  state.user = null;
  state.accounts = [];
  state.transactions = [];
  state.ledger = [];
  localStorage.removeItem("chengchuan-token");
  closeSidebar();
  showLogin();
  if (notify) showToast("已退出", "登录状态已安全清除");
}

async function loadData() {
  if (!state.user) return;
  setLoading(true);
  try {
    if (state.user.role === "ADMIN") {
      const transactions = await api("/api/admin/transactions?limit=100");
      state.accounts = [];
      state.transactions = transactions.transactions;
      state.ledger = [];
    } else {
      const [accounts, transactions, ledger] = await Promise.all([
        api("/api/accounts"),
        api("/api/transactions?limit=100"),
        api("/api/ledger?limit=100")
      ]);
      state.accounts = accounts.accounts;
      state.transactions = transactions.transactions;
      state.ledger = ledger.entries;
    }
    renderAll();
  } catch (error) {
    showToast("数据加载失败", error.message, "error");
  } finally {
    setLoading(false);
  }
}

function renderAll() {
  renderSummary();
  renderOverviewAccounts();
  renderTransactions();
  renderAccounts();
  renderLedger();
  renderRisk();
}

function renderSummary() {
  const total = state.accounts.reduce((sum, account) => sum + account.balanceCents, 0);
  $("#totalBalance").textContent = state.balanceHidden ? "••••••" : formatMoney(total);
  $("#accountCount").textContent = `${state.accounts.length} 个账户`;
}

function renderOverviewAccounts() {
  const container = $("#overviewAccounts");
  if (state.accounts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        ${icon("i-wallet")}
        <strong>暂无客户账户</strong>
        <p>管理员工作台不展示个人资产</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.accounts.slice(0, 2).map((account) => `
    <div class="account-row">
      <span class="account-symbol">${icon(account.accountType === "SAVINGS" ? "i-shield" : "i-wallet")}</span>
      <div class="account-meta">
        <strong>${escapeHtml(account.accountName)}</strong>
        <span>${escapeHtml(maskAccount(account.accountNo))}</span>
      </div>
      <div class="account-balance">
        <strong>${state.balanceHidden ? "••••" : formatMoney(account.balanceCents)}</strong>
        <span>可用</span>
      </div>
    </div>
  `).join("");
}

function riskText(transaction) {
  if (transaction.failureReason) return transaction.failureReason;
  const reasons = transaction.riskReasons?.map((reason) => reason.message).filter(Boolean);
  return reasons?.[0] || "交易处理正常";
}

function transactionRow(transaction) {
  const type = TYPE_META[transaction.type] ?? TYPE_META.DEPOSIT;
  const status = STATUS_META[transaction.status] ?? STATUS_META.PROCESSING;
  const account = state.accounts.find((item) => item.id === transaction.sourceAccountId);
  const detail = transaction.targetAccountNo
    ? `对方 ${transaction.targetAccountNo.slice(-4)}`
    : account?.accountName ?? "银行账户";
  const signedAmount = type.sign * transaction.amountCents;
  const iconClass = transaction.status === "FAILED"
    ? "transaction-icon is-reject"
    : type.sign < 0
      ? "transaction-icon is-out"
      : "transaction-icon";

  return `
    <div class="transaction-row">
      <div class="transaction-primary">
        <span class="${iconClass}">${icon(type.icon)}</span>
        <div>
          <strong>${escapeHtml(transaction.note || type.label)}</strong>
          <span>${escapeHtml(detail)} · ${riskText(transaction)}</span>
        </div>
      </div>
      <span class="transaction-detail">${formatDate(transaction.createdAt)}</span>
      <strong class="transaction-amount${signedAmount > 0 && transaction.status === "SUCCESS" ? " is-positive" : ""}">
        ${signedAmount > 0 ? "+" : ""}${formatMoney(signedAmount)}
      </strong>
      <span class="status-badge ${status.className}">${status.label}</span>
    </div>
  `;
}

function emptyTransactions(message = "暂无交易记录") {
  return `
    <div class="empty-state">
      ${icon("i-list")}
      <strong>${escapeHtml(message)}</strong>
      <p>资金操作完成后会显示在这里</p>
    </div>
  `;
}

function renderTransactions() {
  const recent = state.transactions.slice(0, 6);
  $("#overviewTransactions").innerHTML =
    recent.length ? recent.map(transactionRow).join("") : emptyTransactions();
  $("#allTransactions").innerHTML = state.transactions.length
    ? state.transactions.map(transactionRow).join("")
    : emptyTransactions();
}

function renderAccounts() {
  const container = $("#accountsGrid");
  if (state.accounts.length === 0) {
    container.innerHTML = `
      <article class="panel account-card">
        <div class="empty-state">
          ${icon("i-wallet")}
          <strong>无客户账户</strong>
          <p>当前角色仅可查看交易复核信息</p>
        </div>
      </article>
    `;
    return;
  }

  container.innerHTML = state.accounts.map((account) => `
    <article class="account-card">
      <div class="account-card-top">
        <div>
          <strong>${escapeHtml(account.accountName)}</strong>
          <span>${escapeHtml(maskAccount(account.accountNo))}</span>
        </div>
        <span class="account-type">${account.accountType === "SAVINGS" ? "储蓄" : "结算"}</span>
      </div>
      <div class="account-card-balance">
        <span>账户余额</span>
        <strong>${state.balanceHidden ? "••••••" : formatMoney(account.balanceCents)}</strong>
      </div>
      <div class="account-card-foot">
        <span>可用余额 ${state.balanceHidden ? "••••" : formatMoney(account.availableBalanceCents)}</span>
        <span>${account.status === "ACTIVE" ? "状态正常" : account.status}</span>
      </div>
    </article>
  `).join("");
}

function renderLedger() {
  const container = $("#ledgerList");
  if (state.ledger.length === 0) {
    container.innerHTML = emptyTransactions("暂无账户流水");
    return;
  }

  container.innerHTML = state.ledger.slice(0, 12).map((entry) => `
    <div class="ledger-row">
      <strong>${escapeHtml(entry.description)}</strong>
      <span>${escapeHtml(entry.accountNo)}</span>
      <span>${formatDate(entry.createdAt)}</span>
      <span class="ledger-amount${entry.direction === "CREDIT" ? " is-positive" : ""}">
        ${entry.direction === "CREDIT" ? "+" : "-"}${formatMoney(entry.amountCents)}
      </span>
    </div>
  `).join("");
}

function renderRisk() {
  const failed = state.transactions.filter((item) => item.status === "FAILED").length;
  const review = state.transactions.filter((item) => item.status === "UNDER_REVIEW").length;
  const score = Math.max(58, 99 - failed * 9 - review * 4);
  $("#riskScore").textContent = score;
  $("#riskLevel").textContent = score >= 85 ? "风险较低" : score >= 70 ? "需要关注" : "风险偏高";
  $("#riskSummary").textContent = failed || review
    ? `${review} 笔交易待复核，${failed} 笔交易未通过。`
    : "近期交易未命中高风险规则。";

  const queue = $("#riskQueue");
  if (state.user?.role === "ADMIN") {
    $("#riskQueueKicker").textContent = `${review} 笔待处理`;
    $("#riskQueueTitle").textContent = "人工复核";
    const pending = state.transactions.filter((item) => item.status === "UNDER_REVIEW");
    if (pending.length === 0) {
      queue.innerHTML = `
        <div class="empty-state">
          ${icon("i-check")}
          <strong>当前没有待复核交易</strong>
          <p>高风险交易会进入此队列</p>
        </div>
      `;
      return;
    }
    queue.innerHTML = pending.map((item) => `
      <div class="risk-item">
        <div class="risk-item-head">
          <strong>${escapeHtml(item.note || TYPE_META[item.type]?.label || "资金交易")}</strong>
          <span>${formatDate(item.createdAt)}</span>
        </div>
        <p>${formatMoney(item.amountCents)} · 风险分 ${item.riskScore} · ${escapeHtml(riskText(item))}</p>
        <div class="risk-item-actions">
          <button class="mini-button is-reject" data-review-id="${item.id}" data-decision="REJECT" type="button">拒绝</button>
          <button class="mini-button is-approve" data-review-id="${item.id}" data-decision="APPROVE" type="button">批准</button>
        </div>
      </div>
    `).join("");
    return;
  }

  $("#riskQueueKicker").textContent = "最近评估";
  $("#riskQueueTitle").textContent = "风险记录";
  const records = state.transactions.filter((item) => item.riskDecision).slice(0, 6);
  if (records.length === 0) {
    queue.innerHTML = `
      <div class="empty-state">
        ${icon("i-shield")}
        <strong>暂无风险记录</strong>
        <p>发生资金交易后会展示评估结果</p>
      </div>
    `;
    return;
  }
  queue.innerHTML = records.map((item) => {
    const decisionLabel = item.riskDecision === "APPROVE"
      ? "通过"
      : item.riskDecision === "REVIEW"
        ? "复核"
        : "拒绝";
    const className = item.riskDecision === "APPROVE"
      ? ""
      : item.riskDecision === "REVIEW"
        ? "is-review"
        : "is-failed";
    return `
      <div class="risk-item">
        <div class="risk-item-head">
          <strong>${escapeHtml(TYPE_META[item.type]?.label || item.type)}</strong>
          <span class="status-badge ${className}">${decisionLabel}</span>
        </div>
        <p>${formatMoney(item.amountCents)} · 评分 ${item.riskScore} · ${escapeHtml(riskText(item))}</p>
      </div>
    `;
  }).join("");
}

function showView(viewName) {
  if (!VIEW_META[viewName]) return;
  state.activeView = viewName;
  $$(".view").forEach((view) => view.classList.toggle("is-hidden", view.id !== `view-${viewName}`));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewName));
  $("#pageEyebrow").textContent = VIEW_META[viewName][0];
  $("#pageTitle").textContent = VIEW_META[viewName][1];
  closeSidebar();
}

function openSidebar() {
  $("#sidebar").classList.add("is-open");
  $("#sidebarBackdrop").classList.add("is-open");
}

function closeSidebar() {
  $("#sidebar").classList.remove("is-open");
  $("#sidebarBackdrop").classList.remove("is-open");
}

function syncAccountOptions(selectedId = "") {
  const select = $("#transactionAccount");
  select.innerHTML = state.accounts.map((account) => `
    <option value="${account.id}" ${account.id === selectedId ? "selected" : ""}>
      ${escapeHtml(account.accountName)} · ${formatMoney(account.balanceCents)}
    </option>
  `).join("");
}

function setTransferChannel(channel) {
  const internal = channel === "internal";
  $("#transactionType").value = internal ? "TRANSFER_INTERNAL" : "TRANSFER_EXTERNAL";
  $("#bankCodeGroup").classList.toggle("is-hidden", internal);
  $$(".channel-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.transferChannel === channel);
  });
}

function openTransaction(type) {
  if (!state.accounts.length) {
    showToast("无可用账户", "当前角色不能办理个人资金业务", "error");
    return;
  }
  $("#transactionForm").reset();
  $("#dialogError").textContent = "";
  $("#transactionType").value = type;
  syncAccountOptions(state.accounts[0].id);
  const meta = TYPE_META[type];
  $("#dialogKicker").textContent = type === "DEPOSIT" ? "资金存入" : type === "WITHDRAW" ? "资金取出" : "账户转账";
  $("#dialogTitle").textContent = type === "DEPOSIT" ? "向账户存入" : type === "WITHDRAW" ? "从账户取出" : "发起转账";
  $("#submitTransactionButton").textContent = type === "DEPOSIT" ? "确认存入" : type === "WITHDRAW" ? "确认取出" : "确认转账";
  const isTransfer = type.startsWith("TRANSFER");
  $("#targetAccountGroup").classList.toggle("is-hidden", !isTransfer);
  if (isTransfer) setTransferChannel(type === "TRANSFER_EXTERNAL" ? "external" : "internal");
  $("#transactionDialog").showModal();
  setTimeout(() => $("#transactionAmount").focus(), 30);
  void meta;
}

function closeTransaction() {
  $("#transactionDialog").close();
  $("#dialogError").textContent = "";
}

async function submitTransaction(event) {
  event.preventDefault();
  const type = $("#transactionType").value;
  const amount = Number.parseFloat($("#transactionAmount").value);
  if (!Number.isFinite(amount) || amount <= 0) {
    $("#dialogError").textContent = "请输入大于 0 的交易金额";
    return;
  }

  const payload = {
    requestId: requestId(),
    type,
    accountId: $("#transactionAccount").value,
    amountCents: Math.round(amount * 100),
    note: $("#transactionNote").value.trim(),
    clientHour: new Date().getHours()
  };

  if (type.startsWith("TRANSFER")) {
    payload.targetAccountNo = $("#targetAccountNo").value.trim();
    if (!payload.targetAccountNo) {
      $("#dialogError").textContent = "请输入收款账号";
      return;
    }
  }
  if (type === "TRANSFER_EXTERNAL") {
    payload.externalBankCode = $("#externalBankCode").value.trim();
    if (!payload.externalBankCode) {
      $("#dialogError").textContent = "请输入收款银行代码";
      return;
    }
  }

  $("#submitTransactionButton").disabled = true;
  $("#submitTransactionButton").textContent = "处理中…";
  setLoading(true);
  try {
    const result = await api("/api/transactions", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    closeTransaction();
    const transaction = result.transaction;
    if (transaction.status === "UNDER_REVIEW") {
      showToast("交易待复核", `风险评分 ${transaction.riskScore}，已进入人工复核队列`);
    } else if (transaction.status === "FAILED") {
      showToast("交易未通过", riskText(transaction), "error");
    } else {
      showToast("交易成功", `${TYPE_META[type]?.label || "资金交易"} ${formatMoney(payload.amountCents)} 已处理`);
    }
    await loadData();
  } catch (error) {
    $("#dialogError").textContent = error.message;
  } finally {
    $("#submitTransactionButton").disabled = false;
    $("#submitTransactionButton").textContent =
      type === "DEPOSIT" ? "确认存入" : type === "WITHDRAW" ? "确认取出" : "确认转账";
    setLoading(false);
  }
}

async function reviewTransaction(transactionId, decision) {
  setLoading(true);
  try {
    await api(`/api/admin/transactions/${transactionId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision })
    });
    showToast("复核完成", decision === "APPROVE" ? "交易已批准入账" : "交易已拒绝");
    await loadData();
  } catch (error) {
    showToast("复核失败", error.message, "error");
  } finally {
    setLoading(false);
  }
}

function bindEvents() {
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#loginButton");
    $("#loginError").textContent = "";
    button.disabled = true;
    button.textContent = "正在验证…";
    try {
      await login($("#username").value.trim(), $("#password").value);
    } catch (error) {
      $("#loginError").textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "登录数字银行";
    }
  });

  $("#fillDemoButton").addEventListener("click", () => {
    $("#username").value = "demo";
    $("#password").value = "Bank@2026";
    $("#username").focus();
  });

  $$(".nav-item").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  $$("[data-goto-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.gotoView));
  });

  $$("[data-action]").forEach((button) => {
    button.addEventListener("click", () => openTransaction(button.dataset.action));
  });

  $("#logoutButton").addEventListener("click", () => logout(true));
  $("#openSidebarButton").addEventListener("click", openSidebar);
  $("#closeSidebarButton").addEventListener("click", closeSidebar);
  $("#sidebarBackdrop").addEventListener("click", closeSidebar);
  $("#refreshButton").addEventListener("click", loadData);
  $("#newTransferButton").addEventListener("click", () => openTransaction("TRANSFER_INTERNAL"));
  $("#closeDialogButton").addEventListener("click", closeTransaction);
  $("#cancelDialogButton").addEventListener("click", closeTransaction);
  $("#transactionForm").addEventListener("submit", submitTransaction);

  $$(".channel-button").forEach((button) => {
    button.addEventListener("click", () => setTransferChannel(button.dataset.transferChannel));
  });

  $("#riskQueue").addEventListener("click", (event) => {
    const button = event.target.closest("[data-review-id]");
    if (!button) return;
    reviewTransaction(button.dataset.reviewId, button.dataset.decision);
  });

  $("#toggleBalanceButton").addEventListener("click", () => {
    state.balanceHidden = !state.balanceHidden;
    renderSummary();
    renderOverviewAccounts();
    renderAccounts();
  });

  $("#transactionDialog").addEventListener("click", (event) => {
    if (event.target === $("#transactionDialog")) closeTransaction();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("#sidebar").classList.contains("is-open")) closeSidebar();
  });
}

async function bootstrap() {
  setToday();
  bindEvents();
  const query = new URLSearchParams(location.search);

  if (state.token) {
    try {
      const session = await api("/api/session");
      showApp(session);
      await loadData();
      showView(state.user.role === "ADMIN" ? "risk" : "overview");
      return;
    } catch {
      logout(false);
    }
  }

  if (query.get("demo") === "1") {
    try {
      await login("demo", "Bank@2026");
      return;
    } catch (error) {
      $("#loginError").textContent = error.message;
    }
  }

  showLogin();
}

await bootstrap();
