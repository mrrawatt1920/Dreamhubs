const API = {
  tokenKey: "dreamhubs-token",
  userKey: "dreamhubs-user",
  adminTokenKey: "dreamhubs-admin-token",

  get token() {
    return localStorage.getItem(this.tokenKey);
  },

  get adminToken() {
    return localStorage.getItem(this.adminTokenKey);
  },

  setSession(data) {
    if (data.token) {
      localStorage.setItem(this.tokenKey, data.token);
    }
    if (data.user) {
      localStorage.setItem(this.userKey, JSON.stringify(data.user));
    }
  },

  setAdminSession(data) {
    if (data.token) {
      localStorage.setItem(this.adminTokenKey, data.token);
    }
  },

  clearSession() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  },

  clearAdminSession() {
    localStorage.removeItem(this.adminTokenKey);
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem(this.userKey) || "null");
    } catch {
      return null;
    }
  },

  async request(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };

    const token = options.admin ? this.adminToken : this.token;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    return data;
  }
};

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(element, message, tone = "") {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove("success", "error", "info");
  if (tone) {
    element.classList.add(tone);
  }
}

function formatDate(value) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function handleRegisterPage() {
  const form = document.querySelector("[data-register-form]");
  const status = document.querySelector("[data-register-status]");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      name: form.querySelector("[name='name']").value,
      username: form.querySelector("[name='username']").value,
      email: form.querySelector("[name='email']").value,
      password: form.querySelector("[name='password']").value
    };

    const confirmPassword = form.querySelector("[name='confirmPassword']").value;
    if (payload.password !== confirmPassword) {
      setStatus(status, "Passwords do not match.", "error");
      return;
    }

    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;
    setStatus(status, "Creating your account...", "info");

    try {
      const data = await API.request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      API.setSession(data);
      setStatus(status, "Account created. Redirecting...", "success");
      window.location.href = "new-order.html";
    } catch (error) {
      setStatus(status, error.message, "error");
    } finally {
      submitButton.disabled = false;
    }
  });
}

async function handleLoginPage() {
  const loginForm = document.querySelector("[data-login-form]");
  const loginStatus = document.querySelector("[data-login-status]");
  const googleButton = document.querySelector("[data-google-login]");
  const forgotToggle = document.querySelector("[data-forgot-toggle]");
  const forgotForm = document.querySelector("[data-forgot-form]");
  const forgotMessage = document.querySelector("[data-forgot-message]");

  if (googleButton) {
    googleButton.addEventListener("click", async () => {
      const email = prompt("Enter Google email for demo login:");
      if (!email) {
        return;
      }

      try {
        const data = await API.request("/api/auth/google", {
          method: "POST",
          body: JSON.stringify({
            email,
            name: email.split("@")[0]
          })
        });
        API.setSession(data);
        window.location.href = "new-order.html";
      } catch (error) {
        alert(error.message);
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = loginForm.querySelector("button[type='submit']");
      submitButton.disabled = true;
      setStatus(loginStatus, "Signing you in...", "info");
      try {
        const data = await API.request("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({
            emailOrUsername: loginForm.querySelector("[name='emailOrUsername']").value,
            password: loginForm.querySelector("[name='password']").value
          })
        });
        API.setSession(data);
        setStatus(loginStatus, "Login successful. Redirecting...", "success");
        window.location.href = "new-order.html";
      } catch (error) {
        setStatus(loginStatus, error.message, "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  if (forgotToggle && forgotForm) {
    forgotToggle.addEventListener("click", () => {
      const isHidden = forgotForm.hasAttribute("hidden");
      if (isHidden) {
        forgotForm.removeAttribute("hidden");
      } else {
        forgotForm.setAttribute("hidden", "");
        setStatus(forgotMessage, "");
      }
    });
  }

  if (forgotForm) {
    forgotForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const data = await API.request("/api/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({
            email: forgotForm.querySelector("[name='forgotEmail']").value
          })
        });
        setStatus(
          forgotMessage,
          data.message || "If this user's email exists, we have sent a reset link.",
          "success"
        );
        forgotForm.reset();
      } catch (error) {
        setStatus(forgotMessage, error.message, "error");
      }
    });
  }
}

async function handleResetPasswordPage() {
  const form = document.querySelector("[data-reset-form]");
  const status = document.querySelector("[data-reset-status]");
  if (!form || !status) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";
  const submitButton = form.querySelector("button[type='submit']");

  if (!token) {
    setStatus(status, "This reset link is invalid or has expired.", "error");
    submitButton.disabled = true;
    return;
  }

  try {
    const data = await API.request(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`);
    setStatus(status, data.message || "This reset link is valid for 5 minutes.", "info");
  } catch (error) {
    setStatus(status, error.message, "error");
    submitButton.disabled = true;
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPassword = form.querySelector("[name='newPassword']").value;
    const confirmPassword = form.querySelector("[name='confirmPassword']").value;

    if (newPassword !== confirmPassword) {
      setStatus(status, "Passwords do not match.", "error");
      return;
    }

    try {
      const data = await API.request("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token,
          newPassword
        })
      });
      setStatus(status, data.message, "success");
      form.reset();
      window.setTimeout(() => {
        window.location.href = "login.html";
      }, 1500);
    } catch (error) {
      setStatus(status, error.message, "error");
    }
  });
}

async function handleAdminPage() {
  const form = document.querySelector("[data-admin-login-form]");
  const status = document.querySelector("[data-admin-status]");
  const gate = document.querySelector("[data-admin-gate]");
  const panel = document.querySelector("[data-admin-panel]");
  if (!form || !status) {
    return;
  }

  async function loadDashboard() {
    try {
      const data = await API.request("/api/admin/dashboard", { admin: true });
      setStatus(status, `Logged in as ${data.admin.username || data.admin.email}`, "success");
      if (gate) {
        gate.hidden = true;
        gate.style.display = "none";
      }
      if (panel) {
        panel.hidden = false;
        panel.style.display = "";
      }
      setText("[data-admin-users]", String(data.stats.users));
      setText("[data-admin-orders]", String(data.stats.orders));
      setText("[data-admin-tickets]", String(data.stats.tickets));
      setText("[data-admin-funds]", String(data.stats.fundRequests));

      const ordersBody = document.querySelector(".data-table tbody");
      const ordersEmpty = document.querySelector("[data-admin-orders-empty]");
      if (ordersBody) {
        const orders = data.orders.slice(0, 5);
        if (!orders.length) {
          ordersBody.innerHTML = "";
          if (ordersEmpty) {
            setStatus(ordersEmpty, "No orders found.", "info");
          }
        } else {
          ordersBody.innerHTML = orders.map((order) => `
            <tr>
              <td>#${escapeHtml(order.id)}</td>
              <td>${escapeHtml(order.userId)}</td>
              <td>${escapeHtml(order.service)}</td>
              <td>${escapeHtml(order.status)}</td>
              <td>Internal</td>
            </tr>
          `).join("");
          if (ordersEmpty) {
            setStatus(ordersEmpty, "");
          }
        }
      }

      const ticketList = document.querySelector("#tickets .stack-list");
      if (ticketList) {
        const tickets = data.tickets.slice(0, 5);
        if (!tickets.length) {
          ticketList.innerHTML = `
            <li>
              <strong>No tickets found</strong>
              <span>There are no support tickets right now.</span>
            </li>
          `;
        } else {
          ticketList.innerHTML = tickets.map((ticket) => `
            <li>
              <strong>${escapeHtml(ticket.subject)}</strong>
              <span>${escapeHtml(ticket.message)}</span>
            </li>
          `).join("");
        }
      }

      const userList = document.querySelector("[data-admin-user-list]");
      if (userList) {
        const users = data.users.slice(0, 6);
        if (!users.length) {
          userList.innerHTML = `
            <li>
              <strong>No users found</strong>
              <span>Registered accounts will appear here.</span>
            </li>
          `;
        } else {
          userList.innerHTML = users.map((user) => `
            <li>
              <strong>${escapeHtml(user.username)}</strong>
              <span>${escapeHtml(user.email)}</span>
            </li>
          `).join("");
        }
      }

      const fundList = document.querySelector("[data-admin-fund-list]");
      if (fundList) {
        const fundRequests = data.fundRequests.slice(0, 6);
        if (!fundRequests.length) {
          fundList.innerHTML = `
            <li>
              <strong>No fund requests</strong>
              <span>Payment requests will appear here.</span>
            </li>
          `;
        } else {
          fundList.innerHTML = fundRequests.map((item) => `
            <li>
              <strong>Rs ${escapeHtml(item.amount)} • ${escapeHtml(item.status)}</strong>
              <span>${escapeHtml(item.method)} • ${formatDate(item.createdAt)}</span>
            </li>
          `).join("");
        }
      }
    } catch (error) {
      API.clearAdminSession();
      setStatus(status, "Admin login required.", "info");
      if (gate) {
        gate.hidden = false;
        gate.style.display = "";
      }
      if (panel) {
        panel.hidden = true;
        panel.style.display = "none";
      }
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await API.request("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: form.querySelector("[name='identifier']").value,
          password: form.querySelector("[name='password']").value
        })
      });
      API.setAdminSession(data);
      form.reset();
      await loadDashboard();
    } catch (error) {
      setStatus(status, error.message, "error");
    }
  });

  await loadDashboard();
}

async function ensureAuth() {
  if (!document.body.classList.contains("panel-body")) {
    return null;
  }

  if (!API.token) {
    return null;
  }

  try {
    const data = await API.request("/api/me");
    API.setSession(data);
    return data.user;
  } catch {
    API.clearSession();
    return null;
  }
}

async function handlePanelUser() {
  const user = await ensureAuth();
  if (!user) {
    return;
  }

  setText("[data-username]", user.username);
  setText("[data-balance]", `Rs ${Number(user.balance || 0).toFixed(2)}`);
}

async function handleOrderPage() {
  const form = document.querySelector("[data-order-form]");
  const recentList = document.querySelector("[data-recent-orders]");
  const orderCount = document.querySelector("[data-order-count]");
  const orderTable = document.querySelector("[data-orders-table]");

  if (!form && !recentList && !orderTable) {
    return;
  }

  const user = await ensureAuth();
  if (!user) {
    if (document.body.classList.contains("panel-body")) {
      window.location.href = "login.html";
    }
    return;
  }

  async function loadOrders() {
    const data = await API.request("/api/orders");
    const orders = data.orders;

    if (orderCount) {
      orderCount.textContent = String(orders.length);
    }

    if (recentList) {
      recentList.innerHTML = "";

      if (!orders.length) {
        recentList.innerHTML = `
          <article class="recent-order-card">
            <div class="recent-order-top">
              <div class="recent-order-id"><span class="doc-icon">ID</span><span>No orders yet</span></div>
              <span class="complete-pill">Empty</span>
            </div>
            <div class="recent-order-body">
              <div class="order-row"><span>Service:</span><span class="value">No service selected</span></div>
              <div class="order-row"><span>Link:</span><span class="value">No link submitted</span></div>
              <div class="order-row"><span>Price:</span><span class="value">0</span></div>
              <div class="order-row"><span>Quantity:</span><span class="value">0</span></div>
            </div>
            <div class="recent-date">Date: No order placed yet</div>
            <div class="metrics-bottom">
              <div class="metric-box"><span>START COUNT</span><strong>0</strong></div>
              <div class="metric-box"><span>REMAINS</span><strong>0</strong></div>
            </div>
          </article>
        `;
      } else {
        recentList.innerHTML = orders.slice(0, 5).map((order) => `
          <article class="recent-order-card">
            <div class="recent-order-top">
              <div class="recent-order-id"><span class="doc-icon">ID</span><span>#${order.id}</span></div>
              <span class="complete-pill">${order.status}</span>
            </div>
            <div class="recent-order-body">
              <div class="order-row"><span>Service:</span><span class="value">${order.service}</span></div>
              <div class="order-row"><span>Link:</span><span class="value">${order.target}</span></div>
              <div class="order-row"><span>Price:</span><span class="value">${order.charge}</span></div>
              <div class="order-row"><span>Quantity:</span><span class="value">${order.quantity}</span></div>
            </div>
            <div class="recent-date">Date: ${formatDate(order.createdAt)}</div>
            <div class="metrics-bottom">
              <div class="metric-box"><span>START COUNT</span><strong>${order.startCount}</strong></div>
              <div class="metric-box"><span>REMAINS</span><strong>${order.remains}</strong></div>
            </div>
          </article>
        `).join("");
      }
    }

    if (orderTable) {
      orderTable.innerHTML = "";

      if (!orders.length) {
        orderTable.innerHTML = `<tr><td colspan="6">No orders found.</td></tr>`;
      } else {
        orderTable.innerHTML = orders.map((order) => `
          <tr>
            <td>#${order.id}</td>
            <td>${formatDate(order.createdAt)}</td>
            <td>${order.service}</td>
            <td>${order.target}</td>
            <td>${order.status}</td>
            <td>Rs ${order.charge}</td>
          </tr>
        `).join("");
      }
    }
  }

  await loadOrders();

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await API.request("/api/orders", {
          method: "POST",
          body: JSON.stringify({
            category: form.querySelector("[name='category']").value,
            service: form.querySelector("[name='service']").value,
            target: form.querySelector("[name='target']").value,
            quantity: Number(form.querySelector("[name='quantity']").value),
            ratePer1000: 0.42
          })
        });
        form.reset();
        await loadOrders();
      } catch (error) {
        alert(error.message);
      }
    });
  }
}

async function handleTicketsPage() {
  const form = document.querySelector("[data-ticket-form]");
  const list = document.querySelector("[data-ticket-list]");
  if (!form && !list) {
    return;
  }

  const user = await ensureAuth();
  if (!user) {
    return;
  }

  async function loadTickets() {
    const data = await API.request("/api/tickets");
    if (!list) {
      return;
    }

    if (!data.tickets.length) {
      list.innerHTML = `<li><strong>No tickets yet</strong><span>Your support requests will appear here.</span></li>`;
      return;
    }

    list.innerHTML = data.tickets.map((ticket) => `
      <li>
        <strong>#${ticket.id} ${ticket.subject}</strong>
        <span>Status: ${ticket.status}</span>
      </li>
    `).join("");
  }

  await loadTickets();

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await API.request("/api/tickets", {
          method: "POST",
          body: JSON.stringify({
            subject: form.querySelector("[name='subject']").value,
            relatedOrder: form.querySelector("[name='relatedOrder']").value,
            message: form.querySelector("[name='message']").value
          })
        });
        form.reset();
        await loadTickets();
      } catch (error) {
        alert(error.message);
      }
    });
  }
}

async function handleFundsPage() {
  const form = document.querySelector("[data-funds-form]");
  const list = document.querySelector("[data-funds-list]");
  if (!form && !list) {
    return;
  }

  const user = await ensureAuth();
  if (!user) {
    return;
  }

  async function loadFunds() {
    const data = await API.request("/api/funds");
    setText("[data-balance]", `Rs ${Number(data.balance || 0).toFixed(2)}`);

    if (!list) {
      return;
    }

    if (!data.fundRequests.length) {
      list.innerHTML = `<li><strong>No fund requests yet</strong><span>Your payment requests will appear here.</span></li>`;
      return;
    }

    list.innerHTML = data.fundRequests.map((item) => `
      <li>
        <strong>Rs ${item.amount} ${item.status.toLowerCase()}</strong>
        <span>${item.method} • ${formatDate(item.createdAt)}</span>
      </li>
    `).join("");
  }

  await loadFunds();

  if (form) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await API.request("/api/funds", {
          method: "POST",
          body: JSON.stringify({
            amount: Number(form.querySelector("[name='amount']").value),
            method: form.querySelector("[name='method']").value,
            reference: form.querySelector("[name='reference']").value
          })
        });
        form.reset();
        await loadFunds();
      } catch (error) {
        alert(error.message);
      }
    });
  }
}

async function handleAccountPage() {
  const form = document.querySelector("[data-account-form]");
  if (!form) {
    return;
  }

  const user = await ensureAuth();
  if (!user) {
    return;
  }

  form.querySelector("[name='name']").value = user.name || "";
  form.querySelector("[name='username']").value = user.username || "";
  form.querySelector("[name='email']").value = user.email || "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = await API.request("/api/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: form.querySelector("[name='name']").value,
          email: form.querySelector("[name='email']").value
        })
      });
      API.setSession(data);
      alert("Profile updated.");
    } catch (error) {
      alert(error.message);
    }
  });
}

function handleLogout() {
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      try {
        await API.request("/api/auth/logout", { method: "POST" });
      } catch {
      } finally {
        API.clearSession();
        window.location.href = "login.html";
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  await handleRegisterPage();
  await handleLoginPage();
  await handleResetPasswordPage();
  await handleAdminPage();
  await handlePanelUser();
  await handleOrderPage();
  await handleTicketsPage();
  await handleFundsPage();
  await handleAccountPage();
  handleLogout();
});
