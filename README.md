# Ali Haider — Portfolio

Node.js (Express) server that serves the website and handles the contact form.

## Folder layout
```
server.js        backend + contact form API
package.json
.env.example     copy to .env locally
public/
  index.html     the website
  og-image.png   preview image for LinkedIn/WhatsApp shares
  Ali-Haider-CV.pdf   <- add your CV here (button appears automatically)
```

## Run locally
```
npm install
cp .env.example .env     # then fill in SMTP_PASS
npm start                # http://localhost:3000
```

## Deploy on Render (free)
1. Push this folder to a GitHub repo (`.env` is ignored, good).
2. Render → New → Web Service → pick the repo.
3. Build command: `npm install`   Start command: `npm start`
4. Environment tab: add SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, MAIL_TO, SITE_URL (copy from `.env.example`).
5. Deploy, then open `/api/health` — it must show `"emailConfigured":true`. Send a test message through the form.

Free Render services sleep when idle, so the first visit can take ~30 seconds. Use a free uptime pinger or a paid plan if that matters.

## Adding content
In `public/index.html`, find `PROJECTS` and `REVIEWS` near the top of the script. Add entries (examples are in the comments). The sections and nav links stay hidden until the arrays have items.
Also set `whatsapp` in CONFIG (digits with country code, e.g. 923001234567) if you want the WhatsApp button.
