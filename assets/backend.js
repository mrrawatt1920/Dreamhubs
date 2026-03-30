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
      const categorySelect = document.querySelector("[data-admin-category-select]");
      const serviceSelect = document.querySelector("[data-admin-service-select]");
      const detailId = document.querySelector("[data-detail-id]");
      const detailRate = document.querySelector("[data-detail-rate]");
      const detailLimit = document.querySelector("[data-detail-limit]");
      const detailDesc = document.querySelector("[data-detail-desc]");
      
      let servicesData = data.services || [];

      function updateAdminServiceDetails() {
        const cat = categorySelect ? categorySelect.value : "";
        const sName = serviceSelect ? serviceSelect.value : "";
        const selected = servicesData.find(s => s.category === cat && s.name === sName);
        
        if (selected) {
          if (detailId) detailId.textContent = selected.id;
          if (detailRate) detailRate.textContent = `₹${Number(selected.ratePer1000).toFixed(4)}`;
          if (detailLimit) detailLimit.textContent = `${selected.min} / ${selected.max}`;
          if (detailDesc) detailDesc.textContent = selected.desc || "No description available.";
        } else {
          if (detailId) detailId.textContent = "...";
          if (detailRate) detailRate.textContent = "...";
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

  const providerForm = document.querySelector("[data-admin-provider-form]");
  const providerStatus = document.querySelector("[data-admin-provider-status]");
  const syncBtn = document.querySelector("[data-admin-provider-sync]");

  if (providerForm) {
    providerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const data = await API.request("/api/admin/provider", {
          method: "POST",
          admin: true,
          body: JSON.stringify({
            url: providerForm.querySelector("[name='url']").value,
            key: providerForm.querySelector("[name='key']").value,
            margin: Number(providerForm.querySelector("[name='margin']").value)
          })
        });
        setStatus(providerStatus, data.message || "Settings saved.", "success");
      } catch (error) {
        setStatus(providerStatus, error.message, "error");
      }
    });

    if (syncBtn) {
      syncBtn.addEventListener("click", async () => {
        syncBtn.disabled = true;
        setStatus(providerStatus, "Syncing services from provider...", "info");
        try {
          const data = await API.request("/api/admin/provider/sync", {
            method: "POST",
            admin: true
          });
          setStatus(providerStatus, data.message, "success");
        } catch (error) {
          setStatus(providerStatus, error.message, "error");
        } finally {
          syncBtn.disabled = false;
        }
      });
    }

    try {
      const { provider } = await API.request("/api/admin/provider", { admin: true });
      if (provider) {
        providerForm.querySelector("[name='url']").value = provider.url || "";
        providerForm.querySelector("[name='key']").value = provider.key || "";
        providerForm.querySelector("[name='margin']").value = provider.margin || 10;
      }
    } catch {}
  }

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
