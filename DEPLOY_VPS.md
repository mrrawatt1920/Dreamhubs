# DreamHubs VPS Deploy

Use this when `dreamhubs.in` is pointed to your VPS IP.

## 1. VPS par install karo

Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y nginx git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. Project upload karo

Option A: Git se

```bash
git clone <your-repo-url> /var/www/dreamhubs
cd /var/www/dreamhubs
npm install
```

Option B: File upload karke

Project folder ko `/var/www/dreamhubs` me upload karo, phir:

```bash
cd /var/www/dreamhubs
npm install
```

## 3. Production env banao

`.env` banao:

```env
PORT=3000
APP_BASE_URL=https://dreamhubs.in
SESSION_TTL_HOURS=168
RESET_LINK_TTL_MINUTES=5
LOGIN_MAX_FAILURES=5
LOGIN_LOCK_MINUTES=60
RESET_REQUEST_COOLDOWN_SECONDS=60
RESET_REQUEST_LIMIT_PER_HOUR=5
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ChangeThisAdminPassword123!
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=a64d19001@smtp-brevo.com
SMTP_PASS=your-brevo-smtp-pass
SMTP_FROM=DreamHubs <dreamhubs@gmail.com>
```

## 4. App run karo

```bash
cd /var/www/dreamhubs
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 5. Nginx config lagao

```bash
sudo cp deploy/nginx-dreamhubs.conf /etc/nginx/sites-available/dreamhubs
sudo ln -s /etc/nginx/sites-available/dreamhubs /etc/nginx/sites-enabled/dreamhubs
sudo nginx -t
sudo systemctl reload nginx
```

Agar default site enabled hai to usse disable kar do:

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl reload nginx
```

## 6. SSL lagao

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d dreamhubs.in -d www.dreamhubs.in
```

## 7. DNS me kya karna hai

Apne domain panel me:

- `A` record for `@` -> your VPS public IP
- `A` record for `www` -> your VPS public IP

## 8. Useful commands

```bash
pm2 status
pm2 logs dreamhubs
pm2 restart dreamhubs
sudo systemctl status nginx
```

## 9. After deploy check

- `https://dreamhubs.in`
- `https://dreamhubs.in/login.html`
- forgot password email
- admin login
- user register/login
