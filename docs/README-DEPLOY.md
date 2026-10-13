# Deploying ride79.co.uk (GitHub Pages + Cloudflare + IONOS domain)

Upload **everything inside this folder** (not the folder itself) to the repo root. Include the hidden `.nojekyll` file.

## 1. GitHub (about 10 min)
1. Sign in at github.com → **New repository** → name it `ride79-site` → **Public** → Create.
2. Click **uploading an existing file** → drag in all files and folders from this folder → **Commit changes**.
   - Uploads are limited to 100 files at a time. If it complains, upload `assets/` in a second go.
   - On a Mac, press Cmd+Shift+. in Finder to show `.nojekyll` so you can drag it in.
3. Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `(root)` → Save.
4. Wait about 1 min, then open `https://<your-username>.github.io/ride79-site/`. Assets and links will look broken at that address, which is expected. They work once the custom domain is set up.
5. In **Settings → Pages → Custom domain**, it should already show `ride79.co.uk` (from the CNAME file). If not, type it in and save.

## 2. Cloudflare (about 15 min)
1. Sign up at cloudflare.com → **Add a domain** → `ride79.co.uk` → **Free** plan.
2. Cloudflare imports your existing DNS. **Keep every MX, TXT (SPF/DKIM) and email-related record from IONOS**, otherwise hello@ride79.co.uk stops working.
3. Delete any existing A/AAAA/CNAME records for `ride79.co.uk` and `www` (these point to IONOS's parking page). Add:
   | Type | Name | Content | Proxy |
   |---|---|---|---|
   | A | @ | 185.199.108.153 | DNS only (grey) |
   | A | @ | 185.199.109.153 | DNS only (grey) |
   | A | @ | 185.199.110.153 | DNS only (grey) |
   | A | @ | 185.199.111.153 | DNS only (grey) |
   | CNAME | www | <your-username>.github.io | DNS only (grey) |
4. Cloudflare shows two nameservers (e.g. `xxx.ns.cloudflare.com`). Copy them.

## 3. IONOS (about 5 min)
1. IONOS → **Domains & SSL** → ride79.co.uk → **Nameservers** → **Use custom nameservers** → paste Cloudflare's two → Save.
2. This takes from 10 minutes to 24 hours to take effect. Cloudflare emails you when it's active.

## 4. HTTPS, then turn the proxy on
1. GitHub → Settings → Pages: wait for "DNS check successful" → tick **Enforce HTTPS** (the certificate can take up to an hour).
2. Then in Cloudflare: switch the 5 records to **Proxied** (orange), set **SSL/TLS → Full**, and turn on **Always Use HTTPS**.
   If you ever see "too many redirects", SSL is on Flexible. Change it to **Full**.

## 5. Test before you announce it
- [ ] ride79.co.uk and www.ride79.co.uk both load with the padlock
- [ ] Every nav and footer link works, and /falcon-gt, /terms etc. load
- [ ] Hero video plays on your phone, and the sound button works
- [ ] Buy now → Stripe → pay (refund yourself afterwards) → lands on /order-confirmed
- [ ] Contact form sends → arrives at hello@ride79.co.uk (confirm the first submission in Formspree's email)
- [ ] Send an email to hello@ride79.co.uk from Gmail to check mail still works after the DNS move
- [ ] Share the link on WhatsApp and check the preview image shows
- [ ] Google Search Console → add ride79.co.uk → submit `https://ride79.co.uk/sitemap.xml`

## Updating the site later
Edit or replace a file in the GitHub repo → Commit. The site updates in about 1 min. Cloudflare may cache for a few minutes; use **Caching → Purge Everything** if you need it instantly.

## File map
| Address | File |
|---|---|
| / | index.html |
| /falcon-gt, /falcon-pro | falcon-gt.html, falcon-pro.html |
| /compare, /buying-and-support, /contact, /about | matching .html |
| /warranty, /terms, /privacy | matching .html |
| /order-confirmed | order-confirmed.html (Stripe redirect, hidden from Google) |
| Nav, Footer, ProductPage, OrderEnquiry, Rivals, DealerAdvantage .dc.html | Shared parts loaded by the pages. Don't rename them |
| support.js | Page runtime. Don't edit |
| checkout.js | Stripe payment links |
