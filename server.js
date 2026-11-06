require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

const app = express();
app.set('trust proxy', 1); // needed behind Render/Netlify/Heroku proxies so rate limiting sees real IPs
app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));

if (process.env.ALLOWED_ORIGIN) {
  app.use('/api', cors({ origin: process.env.ALLOWED_ORIGIN.split(',').map(s => s.trim()), methods: ['POST', 'GET'] }));
}
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Serve the home page with the real site URL filled in for share previews (og:image, canonical).
const fs = require('fs');
const indexFile = path.join(__dirname, 'public', 'index.html');
const indexHtml = fs.readFileSync(indexFile, 'utf8');
const siteUrl = req => (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
app.get(['/', '/index.html'], (req, res) => {
  res.type('html').send(indexHtml.replace(/__SITE_URL__/g, siteUrl(req)));
});
app.get('/robots.txt', (req, res) => res.type('text/plain').send(`User-agent: *\nAllow: /\nSitemap: ${siteUrl(req)}/sitemap.xml\n`));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteUrl(req)}/</loc></url></urlset>\n`));

app.use(express.static(path.join(__dirname, 'public'), { index: false, maxAge: '1h' }));

const TYPES = ['Website development', 'Backend / API development', 'AI chatbot or automation',
  'Existing application improvements', 'Job opportunity', 'Collaboration', 'Something else'];

const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Too many messages from this connection. Please try again later or email me directly.' }
});

const oneLine = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
const multi = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let transporter;
function getTransporter() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
  return transporter;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, emailConfigured: !!getTransporter() }));

app.post('/api/inquiry', limiter, async (req, res) => {
  const b = req.body || {};

  // Spam protection: honeypot field and a minimum fill time
  if (b.company_site) return res.status(400).json({ ok: false, error: 'Request rejected.' });
  if (typeof b.t !== 'number' || b.t < 2500) return res.status(400).json({ ok: false, error: 'Please take a moment to fill in the form and try again.' });

  const d = {
    type: oneLine(b.type, 60), name: oneLine(b.name, 100), email: oneLine(b.email, 200),
    org: oneLine(b.org, 150), details: multi(b.details, 3000),
    budget: oneLine(b.budget, 60), timeline: oneLine(b.timeline, 100), link: oneLine(b.link, 300)
  };

  const fields = {};
  if (!TYPES.includes(d.type)) fields.type = 'Invalid inquiry type.';
  if (d.name.length < 2) fields.name = 'Please enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) fields.email = 'Please enter a valid email address.';
  if (d.details.length < 20) fields.details = 'Please write at least 20 characters.';
  if (d.link && !/^https?:\/\/\S+\.\S+$/i.test(d.link)) fields.link = 'Link must start with http:// or https://';
  if (Object.keys(fields).length) return res.status(422).json({ ok: false, error: 'Please check the form and try again.', fields });

  const mailer = getTransporter();
  if (!mailer) {
    console.error('Inquiry received but SMTP is not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS).');
    return res.status(503).json({ ok: false, error: 'The email service is not available right now. Please email alihaidergr8@gmail.com directly.' });
  }

  const rows = [['Type', d.type], ['Name', d.name], ['Email', d.email], ['Organization', d.org], ['Budget', d.budget], ['Timeline', d.timeline], ['Link', d.link]].filter(r => r[1]);
  const text = rows.map(r => `${r[0]}: ${r[1]}`).join('\n') + `\n\nDetails:\n${d.details}`;
  const html = `<table cellpadding="6">${rows.map(r => `<tr><td><b>${r[0]}</b></td><td>${esc(r[1])}</td></tr>`).join('')}</table><p style="white-space:pre-wrap">${esc(d.details)}</p>`;

  try {
    await mailer.sendMail({
      from: `"Portfolio inquiries" <${process.env.SMTP_USER}>`,
      to: process.env.MAIL_TO || 'alihaidergr8@gmail.com',
      replyTo: `"${d.name.replace(/"/g, '')}" <${d.email}>`,
      subject: `[Portfolio] ${d.type} from ${d.name}`,
      text, html
    });
    // Visitor confirmation (best effort: the inquiry itself was already delivered to Ali)
    let confirmation = false;
    try {
      await mailer.sendMail({
        from: `"Ali Haider" <${process.env.SMTP_USER}>`,
        to: d.email,
        replyTo: process.env.MAIL_TO || 'alihaidergr8@gmail.com',
        subject: 'Thanks for getting in touch',
        text: `Hi ${d.name},\n\nThanks for your message. I received your inquiry (${d.type}) and will reply to this email address soon.\n\nYour message:\n${d.details}\n\n— Ali Haider\nSoftware Engineer\nhttps://github.com/alihaider990`,
        html: `<p>Hi ${esc(d.name)},</p><p>Thanks for your message. I received your inquiry (<b>${esc(d.type)}</b>) and will reply to this email address soon.</p><p style="white-space:pre-wrap;color:#555;border-left:3px solid #8957FF;padding-left:12px">${esc(d.details)}</p><p>— Ali Haider<br>Software Engineer</p>`
      });
      confirmation = true;
    } catch (err) {
      console.error('Confirmation email failed:', err.message);
    }
    return res.json({ ok: true, confirmation });
  } catch (err) {
    console.error('Email send failed:', err.message);
    return res.status(502).json({ ok: false, error: 'Your message could not be delivered. Please email alihaidergr8@gmail.com directly.' });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ ok: false, error: 'Not found.' }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Portfolio running on http://localhost:${port}`));
