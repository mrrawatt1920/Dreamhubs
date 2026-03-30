const API = {
  tokenKey: "dreamhubs-token",
  userKey: "dreamhubs-user",
  adminTokenKey: "dreamhubs-admin-token",

  async syncTheme() {
    try {
      const { theme } = await this.request("/api/appearance");
      const root = document.documentElement;
      Object.entries(theme).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });
      // Force light/dark scheme for browser elements
      if (theme["--bg"].includes("#0") || theme["--bg"].includes("#1")) {
        root.setAttribute("data-theme", "dark");
      } else {
        root.setAttribute("data-theme", "light");
      }
    } catch (e) {
      console.warn("Theme sync failed:", e.message);
    }
  },

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

window.togglePassword = function(btn) {
  const input = btn.previousElementSibling;
  if (input.type === "password") {
    input.type = "text";
    btn.textContent = "Hide";
  } else {
    input.type = "password";
    btn.textContent = "Show";
  }
};

async function waitForGoogleIdentity(maxAttempts = 20, delayMs = 300) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (window.google?.accounts?.id) {
      return true;
    }

    await new Promise((resolve) => window.setTimeout(resolve, delayMs));
  }

  return false;
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
  const googleMount = document.querySelector("[data-google-signin]");
  const googleStatus = document.querySelector("[data-google-status]");
  const forgotToggle = document.querySelector("[data-forgot-toggle]");
  const forgotForm = document.querySelector("[data-forgot-form]");
  const forgotMessage = document.querySelector("[data-forgot-message]");

  if (googleMount) {
    const clientId = document.body.dataset.googleClientId || "";
    const googleReady = await waitForGoogleIdentity();
    if (!googleReady || !clientId) {
      setStatus(googleStatus, "Google login is not configured yet.", "error");
    } else {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          setStatus(googleStatus, "Signing in with Google...", "info");
          try {
            const data = await API.request("/api/auth/google", {
              method: "POST",
              body: JSON.stringify({
                credential: response.credential
              })
            });
            API.setSession(data);
            setStatus(googleStatus, "Google login successful. Redirecting...", "success");
            window.location.href = "new-order.html";
          } catch (error) {
            setStatus(googleStatus, error.message, "error");
          }
        },
        ux_mode: "popup",
        auto_select: false
      });

      window.google.accounts.id.renderButton(googleMount, {
        theme: "outline",
        size: "large",
        shape: "pill",
        text: "continue_with",
        width: 320
      });
      setStatus(googleStatus, "Use the Google popup to continue.", "info");
    }
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

  window.refreshAdminDashboard = async function() {
    const status = document.querySelector("[data-admin-status]");
    const gate = document.querySelector("[data-admin-gate]");
    const panel = document.querySelector("[data-admin-panel]");
    
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
          ticketList.innerHTML = `<li><strong>No tickets found</strong><span>There are no support tickets right now.</span></li>`;
        } else {
          ticketList.innerHTML = tickets.map((ticket) => {
            const statusColor = ticket.status === "Pending" ? "var(--accent)" : (ticket.status === "Answered" ? "var(--green)" : (ticket.status === "Closed" ? "#777" : "var(--blue)"));
            return `
              <li style="padding: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                  <div>
                    <strong style="color: ${statusColor};">#${ticket.id} – ${escapeHtml(ticket.status)}</strong><br>
                    <strong>${escapeHtml(ticket.subject)}</strong>
                    <p style="margin: 5px 0; font-size: 0.9rem; color: var(--muted);">${escapeHtml(ticket.message)}</p>
                    ${ticket.replies ? ticket.replies.map(r => `
                      <div style="margin-top: 8px; padding: 8px; border-left: 2px solid var(--accent); background: rgba(0,0,0,0.02); font-size: 0.85rem;">
                        <strong>${r.from}:</strong> ${escapeHtml(r.message)}
                      </div>
                    `).join("") : ""}
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 5px;">
                    <button class="primary-btn mini" onclick="adminTicketReply('${ticket.id}')">Reply</button>
                    ${ticket.status !== "In Progress" && ticket.status !== "Closed" ? `<button class="primary-btn mini" style="background: var(--blue);" onclick="adminTicketAction('${ticket.id}', 'In Progress')">Work On It</button>` : ""}
                    ${ticket.status !== "Closed" ? `<button class="primary-btn mini" style="background: #e74c3c;" onclick="adminTicketAction('${ticket.id}', 'Closed')">Close</button>` : ""}
                  </div>
                </div>
              </li>
            `;
          }).join("");
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
          fundList.innerHTML = fundRequests.map((item) => {
            const user = data.users.find(u => u.id === item.userId);
            const userLabel = user ? `${user.username} (${user.email})` : "Unknown User";
            const isPending = item.status === "Pending";
            
            return `
              <li style="padding: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                  <div>
                    <strong>Rs ${escapeHtml(item.amount)} • <span style="color: ${isPending ? '#f39c12' : (item.status === 'Approved' ? '#27ae60' : '#e74c3c')}">${escapeHtml(item.status)}</span></strong><br>
                    <small style="display: block; margin-top: 4px; color: var(--text-gray);">User: ${escapeHtml(userLabel)}</small>
                    <small style="display: block; color: var(--text-gray);">Method: ${escapeHtml(item.method)} • TRX: <strong>${escapeHtml(item.reference || 'N/A')}</strong></small>
                    <small style="display: block; color: var(--text-gray); font-size: 0.75rem;">${formatDate(item.createdAt)}</small>
                  </div>
                  ${isPending ? `
                    <div style="display: flex; gap: 8px;">
                      <button class="primary-btn mini" style="background: #27ae60;" onclick="adminFundAction('${item.id}', 'approve')">Approve</button>
                      <button class="primary-btn mini" style="background: #e74c3c;" onclick="adminFundAction('${item.id}', 'reject')">Reject</button>
                    </div>
                  ` : (item.status === "Rejected" ? `
                    <div style="display: flex; gap: 8px;">
                      <button class="primary-btn mini" style="background: #ff4444;" onclick="adminDeleteFundRequest('${item.id}')">Delete</button>
                    </div>
                  ` : '')}
                </div>
              </li>
            `;
          }).join("");
        }
      }

      const appearanceSection = document.querySelector("#appearance .stack-list");
      if (appearanceSection) {
        try {
          const { themes, active } = await API.request("/api/appearance");
          appearanceSection.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; margin-top: 15px;">
              ${themes.map(t => `
                <div class="theme-card ${t.id === active ? 'active' : ''}" 
                     onclick="adminUpdateTheme('${t.id}')"
                     style="padding: 10px; border-radius: 10px; border: 2px solid ${t.id === active ? 'var(--accent)' : 'var(--line)'}; cursor: pointer; background: var(--surface-strong); position: relative; transition: 0.2s; box-shadow: var(--shadow);">
                  <div style="font-weight: 700; font-size: 0.75rem; color: var(--text); margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.name}</div>
                  <div style="display: flex; gap: 3px; height: 16px;">
                    <div style="flex: 1; border-radius: 3px; background: #333;"></div>
                    <div style="flex: 1; border-radius: 3px; background: #666;"></div>
                    <div style="flex: 1; border-radius: 3px; background: #999;"></div>
                  </div>
                  ${t.id === active ? '<div style="position: absolute; top: -6px; right: -6px; background: var(--accent); color: white; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: 9px; z-index: 2;">✓</div>' : ''}
                </div>
              `).join("")}
            </div>
          `;
        } catch {}
      }

      const categorySelect = document.querySelector("[data-admin-category-select]");
      const serviceSelect = document.querySelector("[data-admin-service-select]");
      const detailId = document.querySelector("[data-detail-id]");
      const detailRate = document.querySelector("[data-detail-rate]");
      const detailLimit = document.querySelector("[data-detail-limit]");
      const detailDesc = document.querySelector("[data-detail-desc]");
      const detailCost = document.querySelector("[data-detail-cost]");
      const detailProvider = document.querySelector("[data-detail-provider]");
      
      let servicesData = data.services || [];
      let providersData = data.providers || [];

      function updateAdminServiceDetails() {
        const cat = categorySelect ? categorySelect.value : "";
        const sName = serviceSelect ? serviceSelect.value : "";
        const selected = servicesData.find(s => s.category === cat && s.name === sName);
        
        if (selected) {
          if (detailId) detailId.textContent = selected.id;
          if (detailRate) detailRate.textContent = `₹${Number(selected.ratePer1000).toFixed(4)}`;
          if (detailLimit) detailLimit.textContent = `${selected.min} / ${selected.max}`;
          if (detailDesc) detailDesc.textContent = selected.desc || "No description available.";
          
          const provider = providersData.find(p => p.id === selected.providerId);
          if (detailProvider) detailProvider.textContent = provider ? provider.name : "Manual / Unknown";
          if (detailCost) detailCost.textContent = selected.originalRate !== undefined ? `$${selected.originalRate}` : "N/A";
        } else {
          if (detailId) detailId.textContent = "...";
          if (detailRate) detailRate.textContent = "...";
          if (detailCost) detailCost.textContent = "...";
          if (detailProvider) detailProvider.textContent = "...";
          if (detailLimit) detailLimit.textContent = "...";
          if (detailDesc) detailDesc.textContent = "Select a service to view details.";
        }
      }

      if (categorySelect && serviceSelect) {
        const categories = [...new Set(servicesData.map(s => s.category))];
        categorySelect.innerHTML = `<option value="">Select Category</option>` + 
          categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
          
        categorySelect.onchange = () => {
          const cat = categorySelect.value;
          const matching = servicesData.filter(s => s.category === cat);
          serviceSelect.innerHTML = `<option value="">Select Service</option>` + 
            matching.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join("");
          updateAdminServiceDetails();
        };

        serviceSelect.onchange = updateAdminServiceDetails;
      }

      window.adminEditCategory = async () => {
        const oldName = categorySelect.value;
        if (!oldName) return alert("Please select a category first.");
        const newName = prompt("Enter new name for this category:", oldName);
        if (!newName || newName === oldName) return;
        try {
          const res = await API.request("/api/admin/categories", {
            method: "PATCH",
            admin: true,
            body: JSON.stringify({ oldName, newName })
          });
          alert(res.message);
          location.reload();
        } catch (error) { alert(error.message); }
      };

      window.adminDeleteCategory = async () => {
        const name = categorySelect.value;
        if (!name) return alert("Please select a category first.");
        if (!confirm(`Are you sure? This will delete ALL services in "${name}"!`)) return;
        try {
          const res = await API.request(`/api/admin/categories?name=${encodeURIComponent(name)}`, {
            method: "DELETE",
            admin: true
          });
          alert(res.message);
          location.reload();
        } catch (error) { alert(error.message); }
      };

      window.adminEditService = async () => {
        const cat = categorySelect.value;
        const sName = serviceSelect.value;
        const selected = servicesData.find(s => s.category === cat && s.name === sName);
        if (!selected) return alert("Please select a service first.");
        
        const newCategory = prompt("Enter new category name:", selected.category);
        if (newCategory === null) return;
        const newName = prompt("Enter new service name:", selected.name);
        if (newName === null) return;
        const newRate = prompt("Enter new rate per 1000 (₹):", selected.ratePer1000);
        if (newRate === null) return;

        try {
          const res = await API.request("/api/admin/services", {
            method: "PATCH",
            admin: true,
            body: JSON.stringify({
              id: selected.id,
              category: newCategory,
              name: newName,
              ratePer1000: Number(newRate)
            })
          });
          alert(res.message);
          location.reload();
        } catch (error) { alert(error.message); }
      };

      window.adminDeleteService = async () => {
        const cat = categorySelect.value;
        const sName = serviceSelect.value;
        const selected = servicesData.find(s => s.category === cat && s.name === sName);
        if (!selected) return alert("Please select a service first.");
        if (!confirm("Are you sure you want to delete this service?")) return;
        try {
          const res = await API.request(`/api/admin/services?id=${encodeURIComponent(selected.id)}`, {
            method: "DELETE",
            admin: true
          });
          alert(res.message);
          location.reload();
        } catch (error) { alert(error.message); }
      };

      window.adminCleanServices = async () => {
        if (!confirm("CRITICAL: Are you sure you want to delete ALL services from your database? This cannot be undone.")) return;
        if (!confirm("Are you REALLY sure? You will need to re-sync your providers after this.")) return;
        try {
          const res = await API.request("/api/admin/services/all", {
            method: "DELETE",
            admin: true
          });
          alert(res.message);
          location.reload();
        } catch (error) { alert(error.message); }
      };


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
      await window.refreshAdminDashboard();
    } catch (error) {
      setStatus(status, error.message, "error");
    }
  });

  const providerStatus = document.querySelector("[data-admin-provider-status]");
  const providersList = document.querySelector("[data-admin-providers-list]");
  const addProviderForm = document.querySelector("[data-admin-add-provider-form]");

  async function loadProviders() {
    if (!providersList) return;
    try {
      const { providers } = await API.request("/api/admin/providers", { admin: true });
      providersList.innerHTML = providers.map(p => `
        <tr>
          <td><strong>${escapeHtml(p.name)}</strong></td>
          <td style="font-size: 0.8rem; color: var(--text-gray);">${escapeHtml(p.url)}</td>
          <td style="text-align: center; font-weight: bold; color: var(--blue);">1$ = ₹${p.exchangeRate || 1}</td>
          <td style="text-align: center; font-weight: bold; color: var(--green);">${p.margin}%</td>
          <td>
            <div style="display: flex; gap: 5px; justify-content: center;">
              <button class="primary-btn mini" style="background: var(--blue);" onclick="adminSyncProvider('${p.id}')" title="Sync Services">Sync</button>
              <button class="primary-btn mini" onclick="adminEditProvider('${p.id}', '${escapeHtml(p.name).replace(/'/g, "\\'")}', '${escapeHtml(p.url).replace(/'/g, "\\'")}', ${p.exchangeRate}, ${p.margin})" title="Edit Settings">Edit</button>
              <button class="primary-btn mini" style="background: #ff4444;" onclick="adminDeleteProvider('${p.id}')" title="Delete Provider">Delete</button>
            </div>
          </td>
        </tr>
      `).join("");
    } catch {}
  }

  if (addProviderForm) {
    addProviderForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = addProviderForm.querySelector("button");
      btn.disabled = true;
      setStatus(providerStatus, "Adding provider...", "info");
      try {
        await API.request("/api/admin/providers", {
          method: "POST",
          admin: true,
          body: JSON.stringify({
            name: addProviderForm.querySelector("[name='name']").value,
            url: addProviderForm.querySelector("[name='url']").value,
            key: addProviderForm.querySelector("[name='key']").value,
            exchangeRate: Number(addProviderForm.querySelector("[name='exchangeRate']").value),
            margin: Number(addProviderForm.querySelector("[name='margin']").value)
          })
        });
        addProviderForm.reset();
        await loadProviders();
        setStatus(providerStatus, "Provider added successfully.", "success");
      } catch (err) { setStatus(providerStatus, err.message, "error"); }
      finally { btn.disabled = false; }
    });
  }

  window.adminEditProvider = async (id, name, url, exchangeRate, margin) => {
    const newName = prompt("Provider Name:", name);
    if (newName === null) return;
    const newUrl = prompt("API URL:", url);
    if (newUrl === null) return;
    const newKey = prompt("API Key (leave blank to keep current):", "");
    const newExRate = prompt("Exchange Rate (1 USD = ? INR):", exchangeRate);
    if (newExRate === null) return;
    const newMargin = prompt("Profit Margin (%):", margin);
    if (newMargin === null) return;

    try {
      const body = { id, name: newName, url: newUrl, exchangeRate: Number(newExRate), margin: Number(newMargin) };
      if (newKey) body.key = newKey;
      await API.request("/api/admin/providers", { method: "PATCH", admin: true, body: JSON.stringify(body) });
      await loadProviders();
      alert("Provider updated and prices recalculated!");
    } catch (err) { alert(err.message); }
  };

  window.adminDeleteProvider = async (id) => {
    if (!confirm("Are you sure? Removing a provider will also delete all its services.")) return;
    try {
      await API.request(`/api/admin/providers?id=${encodeURIComponent(id)}`, { method: "DELETE", admin: true });
      await loadProviders();
      alert("Provider removed.");
    } catch (err) { alert(err.message); }
  };

  window.adminSyncProvider = async (providerId) => {
    setStatus(providerStatus, "Syncing services from provider...", "info");
    try {
      const res = await API.request("/api/admin/provider/sync", {
        method: "POST",
        admin: true,
        body: JSON.stringify({ providerId })
      });
      setStatus(providerStatus, res.message, "success");
      await window.refreshAdminDashboard(); // Reload services for dropdowns
    } catch (err) { setStatus(providerStatus, err.message, "error"); }
  };

  await loadProviders();
  await window.refreshAdminDashboard();
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
    const categorySelect = document.querySelector("[data-order-category]");
    const serviceSelect = document.querySelector("[data-order-service]");
    const minText = document.querySelector("[data-order-min]");
    const maxText = document.querySelector("[data-order-max]");
    const rateText = document.querySelector("[data-order-rate]");
    const descText = document.querySelector("[data-order-desc] span");
    const quantityInput = document.querySelector("[name='quantity']");
    const submitBtn = form.querySelector(".order-submit");
    const submitText = submitBtn ? submitBtn.querySelector("small") : null;
    let servicesData = [];

    try {
      const { services } = await API.request("/api/services");
      servicesData = services || [];
      const categories = [...new Set(servicesData.map(s => s.category))];
      if (categorySelect && categories.length) {
        categorySelect.innerHTML = `<option value="">Select Category</option>` + 
          categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
      } else if (categorySelect) {
        categorySelect.innerHTML = `<option value="">No services available</option>`;
      }
    } catch {}

    function updateServiceInfo() {
      const category = categorySelect ? categorySelect.value : "";
      const sName = serviceSelect ? serviceSelect.value : "";
      const selected = servicesData.find(s => s.category === category && s.name === sName);
      if (selected) {
        if (minText) minText.textContent = selected.min;
        if (maxText) maxText.textContent = selected.max;
        if (rateText) rateText.textContent = `₹${Number(selected.ratePer1000).toFixed(2)}`;
        if (descText) descText.textContent = selected.desc || "No additional details available.";
        if (quantityInput) {
          quantityInput.min = selected.min;
          quantityInput.max = selected.max;
          if (Number(quantityInput.value) < selected.min) quantityInput.value = selected.min;
        }
      } else {
        if (minText) minText.textContent = "...";
        if (maxText) maxText.textContent = "...";
        if (rateText) rateText.textContent = "...";
        if (descText) descText.textContent = "Select a service to view details.";
      }
      updatePrice();
    }

    function updatePrice() {
      const category = categorySelect ? categorySelect.value : "";
      const sName = serviceSelect ? serviceSelect.value : "";
      const selected = servicesData.find(s => s.category === category && s.name === sName);
      const q = quantityInput ? Number(quantityInput.value) : 1000;
      if (selected && submitText) {
        const total = (q / 1000) * selected.ratePer1000;
        submitText.textContent = `TOTAL AMOUNT: ₹${total.toFixed(2)}`;
      } else if (submitText) {
        submitText.textContent = `TOTAL AMOUNT`;
      }
    }

    if (categorySelect && serviceSelect) {
      categorySelect.addEventListener("change", () => {
        const cat = categorySelect.value;
        const matching = servicesData.filter(s => s.category === cat);
        serviceSelect.innerHTML = `<option value="">Select Service</option>` + 
          matching.map(s => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`).join("");
        updateServiceInfo();
      });

      serviceSelect.addEventListener("change", updateServiceInfo);
    }
    
    if (quantityInput) {
      quantityInput.addEventListener("input", updatePrice);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const category = categorySelect ? categorySelect.value : "";
      const sName = serviceSelect ? serviceSelect.value : "";
      const selected = servicesData.find(s => s.category === category && s.name === sName);
      
      if (!selected) {
        alert("Please select a valid service.");
        return;
      }

      const submitRealBtn = form.querySelector("button[type='submit']");
      submitRealBtn.disabled = true;

      try {
        await API.request("/api/orders", {
          method: "POST",
          body: JSON.stringify({
            category: category,
            service: sName,
            target: form.querySelector("[name='target']").value,
            quantity: Number(quantityInput.value),
            ratePer1000: selected.ratePer1000
          })
        });
        
        await loadOrders();
        
        const oldTarget = form.querySelector("[name='target']").value;
        form.querySelector("[name='target']").value = "";
        alert(`Order placed successfully for ${oldTarget}!`);
      } catch (error) {
        alert(error.message);
      } finally {
        submitRealBtn.disabled = false;
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

    list.innerHTML = data.tickets.map((ticket) => {
      const statusColor = ticket.status === "Pending" ? "var(--accent)" : (ticket.status === "Answered" ? "var(--green)" : (ticket.status === "Closed" ? "#777" : "var(--blue)"));
      return `
        <li style="padding: 15px; border-bottom: 1px solid var(--line);">
          <div style="display: flex; justify-content: space-between;">
            <strong>#${ticket.id} ${escapeHtml(ticket.subject)}</strong>
            <span style="font-weight: 700; color: ${statusColor};">${ticket.status}</span>
          </div>
          <p style="margin: 8px 0; font-size: 0.95rem;">${escapeHtml(ticket.message)}</p>
          ${ticket.replies ? ticket.replies.map(r => `
            <div style="margin-top: 10px; padding: 10px; background: var(--accent-soft); border-radius: 8px; border-left: 4px solid var(--accent);">
              <small style="font-weight: 800; color: var(--accent); text-transform: uppercase;">Reply from Team</small>
              <p style="margin: 4px 0 0; color: var(--text);">${escapeHtml(r.message)}</p>
            </div>
          `).join("") : ""}
        </li>
      `;
    }).join("");
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
    const user = API.getUser();
    if (user) {
      const usernameInput = form.querySelector("#fund-username");
      const emailInput = form.querySelector("#fund-email");
      if (usernameInput) usernameInput.value = user.username || "";
      if (emailInput) emailInput.value = user.email || "";
    }

    const methodSelect = form.querySelector("[data-method-select]");
    const instructions = {
      "UPI": document.getElementById("instruction-upi"),
      "Bank Transfer": document.getElementById("instruction-bank"),
      "Crypto": document.getElementById("instruction-crypto")
    };
    const methodLabel = document.getElementById("method-label");

    if (methodSelect) {
      methodSelect.addEventListener("change", () => {
        const selected = methodSelect.value;
        if (methodLabel) methodLabel.textContent = selected;
        Object.keys(instructions).forEach(key => {
          if (instructions[key]) {
            instructions[key].style.display = (key === selected) ? "block" : "none";
          }
        });
      });
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector("button[type='submit']");
      submitButton.disabled = true;
      try {
        await API.request("/api/funds", {
          method: "POST",
          body: JSON.stringify({
            amount: Number(form.querySelector("[name='amount']").value),
            method: form.querySelector("[name='method']").value,
            reference: form.querySelector("[name='reference']").value
          })
        });
        alert("Payment request submitted! Admin will verify and add funds shortly.");
        form.querySelector("[name='amount']").value = "";
        form.querySelector("[name='reference']").value = "";
        await loadFunds();
      } catch (error) {
        alert(error.message);
      } finally {
        submitButton.disabled = false;
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

window.editService = async function(id, currentCategory, currentName, currentRate) {
  // Keeping this for backward compatibility if needed, but admin panels uses adminEditService now
  const newCategory = prompt("Enter new category name:", currentCategory);
  if (newCategory === null) return;
  const newName = prompt("Enter new service name:", currentName);
  if (newName === null) return;
  const newRate = prompt("Enter new rate per 1000 (₹):", currentRate);
  if (newRate === null) return;

  try {
    const res = await API.request("/api/admin/services", {
      method: "PATCH",
      admin: true,
      body: JSON.stringify({ id, category: newCategory, name: newName, ratePer1000: Number(newRate) })
    });
    alert(res.message);
    location.reload();
  } catch (error) { alert("Error: " + error.message); }
};

window.adminFundAction = async function(id, action) {
  let amount = null;
  
  if (action === "approve") {
    // Find the request in the current list to get the default amount
    const fundList = document.querySelector("[data-admin-fund-list]");
    let currentAmount = "0";
    if (fundList) {
      const items = Array.from(fundList.querySelectorAll("li"));
      const item = items.find(li => li.innerHTML.includes(id));
      if (item) {
        const strong = item.querySelector("strong");
        if (strong) {
          const match = strong.textContent.match(/Rs ([\d\.]+)/);
          if (match) currentAmount = match[1];
        }
      }
    }
    
    const input = prompt(`Approve this request? You can edit the amount below:`, currentAmount);
    if (input === null) return; // Cancelled
    amount = Number(input);
    if (isNaN(amount) || amount <= 0) return alert("Please enter a valid positive amount.");
  } else {
    if (!confirm(`Are you sure you want to reject this request?`)) return;
  }
  
  try {
    const res = await API.request("/api/admin/funds/action", {
      method: "POST",
      admin: true,
      body: JSON.stringify({ id, action, amount: amount })
    });
    alert(res.message);
    if (window.refreshAdminDashboard) {
      await window.refreshAdminDashboard();
    } else {
      location.reload();
    }
  } catch (error) {
    alert("Error: " + error.message);
  }
};

window.adminDeleteFundRequest = async function(id) {
  if (!confirm("Are you sure you want to delete this fund request?")) return;
  try {
    const res = await API.request(`/api/admin/funds?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      admin: true
    });
    alert(res.message);
    if (window.refreshAdminDashboard) await window.refreshAdminDashboard();
  } catch (error) { alert("Error: " + error.message); }
};

window.adminTicketReply = async function(id) {
  const message = prompt("Enter your reply to the user:");
  if (!message) return;
  
  try {
    const res = await API.request("/api/admin/tickets/reply", {
      method: "POST",
      admin: true,
      body: JSON.stringify({ id, message })
    });
    alert(res.message);
    if (window.refreshAdminDashboard) await window.refreshAdminDashboard();
  } catch (error) { alert("Error: " + error.message); }
};

window.adminTicketAction = async function(id, status) {
  if (!confirm(`Mark this ticket as ${status}?`)) return;
  try {
    const res = await API.request("/api/admin/tickets/status", {
      method: "PATCH",
      admin: true,
      body: JSON.stringify({ id, status })
    });
    alert(res.message);
    if (window.refreshAdminDashboard) await window.refreshAdminDashboard();
  } catch (error) { alert("Error: " + error.message); }
};

window.adminUpdateTheme = async function(themeId) {
  try {
    const res = await API.request("/api/admin/appearance", {
      method: "PATCH",
      admin: true,
      body: JSON.stringify({ themeId })
    });
    alert(res.message);
    await API.syncTheme();
    if (window.refreshAdminDashboard) await window.refreshAdminDashboard();
  } catch (error) { alert("Error: " + error.message); }
};

document.addEventListener("DOMContentLoaded", async () => {
  await API.syncTheme();
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
