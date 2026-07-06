# Self-hosting on your own server

Docker + host nginx. Two containers: the Next.js **app** and the realtime **collab**
server. nginx terminates TLS and forwards to them.

## Prerequisites on the server
- Docker + the `docker compose` plugin
- nginx
- A domain's DNS A record pointing at the server
- certbot (`sudo apt install certbot python3-certbot-nginx`) for TLS

## 1. Clone
```bash
git clone git@github.com:clankweedmuff1n/YOUR-REPO.git
cd YOUR-REPO
```

## 2. Configure env
```bash
cp .env.deploy.example .env
nano .env
```
Set:
- `NEXT_PUBLIC_COLLAB_WS_URL=wss://your-domain/collab`

Leave `GTNH_DATASET_BACKEND_URL` empty — the dataset is downloaded and baked into the
app image at build time, so the container is self-contained (no proxy, no volume).

> `NEXT_PUBLIC_*` are baked in at build time. If you change them later, rebuild:
> `docker compose up -d --build`.

## 3. Start the containers
```bash
docker compose up -d --build
```
This builds and runs `app` on `127.0.0.1:3000` and `collab` on `127.0.0.1:1234`
(localhost only — nginx is the public entry point).

> The **first** build downloads the dataset (~600 MB, ~90k icons) into the image, so
> it takes a while. It is cached as its own layer — later rebuilds reuse it unless you
> change `DATASET_SOURCE` / `DATASET_VERSION`.

Check:
```bash
docker compose ps
curl -s localhost:3000 -o /dev/null -w '%{http_code}\n'   # 200
```

## 4. nginx + TLS
```bash
sudo cp docker/nginx/gtnh-factory-flow.conf.example \
        /etc/nginx/sites-available/gtnh-factory-flow.conf
sudo sed -i 's/your-domain.example/YOUR_DOMAIN/g' \
        /etc/nginx/sites-available/gtnh-factory-flow.conf
sudo ln -s /etc/nginx/sites-available/gtnh-factory-flow.conf \
        /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d YOUR_DOMAIN
```

## 5. Verify
- Open `https://YOUR_DOMAIN` — the planner loads, recipes come from the bundled dataset.
- The **Share** button appears (collab enabled). Open in two windows, Share in one,
  paste the invite link in the other — edits sync.

## Updating later
```bash
git pull
docker compose up -d --build
```

## Notes
- Rooms live in memory in the collab server; a restart drops in-flight sessions and
  clients rejoin from whoever is still connected.
- The dataset is baked into the app image at build time (`docker/app/Dockerfile`,
  `dataset` stage) via `npm run dataset:download`. Pick a different one with the
  `DATASET_SOURCE` / `DATASET_VERSION` vars in `.env`, then rebuild.
- To pull the dataset outside Docker (e.g. for local dev), run it directly:
  ```bash
  npm run dataset:download https://dev-gtnh.samiracle.fr stable-2.8.4
  ```
  It fills `public/datasets/gtnh` (~600 MB; resumable, skips existing files).
