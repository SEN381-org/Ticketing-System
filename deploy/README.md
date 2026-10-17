# Deployment configuration

The host configuration that DEC-003 v0.5 relies on, held in the repository so that a
redeploy or a replacement VM does not depend on what is on the old one.

| File | Installed on the staging VM as | DEC-003 row |
|---|---|---|
| `nginx/civicconnect-staging.conf` | `/etc/nginx/sites-enabled/civicconnect-staging` | Edge |
| `systemd/civicconnect-staging.service` | `/etc/systemd/system/civicconnect-staging.service` | Process model, Secrets |

**Not here, on purpose:** the environment file (`/etc/civicconnect/staging.env`: `MONGODB_URI`,
`PORT`, `RELEASE_COMMIT`), the TLS private key and the VM's IP address. None of them may be
committed (NFR-3.5; DEC-003 v0.4 redacts the IP). Neither file needs any of them.

There is no production configuration: production has no host (DEC-003 v0.4 and v0.5).

## Where the contents come from

The live files on the VM were never captured in full. The deploy record says so: "The unit
file's contents are not recorded here" (section 5) and "The Nginx server block's
ssl_certificate and ssl_certificate_key lines are not recorded here" (section 3a). These
files are written from what the record does show:

- `docs/evidence/M3_Staging_Deploy_v3.0-M3-rc.md`, sections 1, 3a, 5 and 7;
- its note of 15/10/2026 (E. Lindsay), which records the Nginx correction line by line.

Each line the record does not support is marked `NOT RECORDED` in the file. Until the
comparison below has been run on the VM and recorded, these files describe the intended
configuration and are not evidence of what staging runs.

## Compare with the VM

On the VM, from a checkout of this repository at the deployed tag (`/opt/civicconnect`):

```sh
sudo diff -u /etc/nginx/sites-enabled/civicconnect-staging /opt/civicconnect/deploy/nginx/civicconnect-staging.conf
sudo diff -u /etc/systemd/system/civicconnect-staging.service /opt/civicconnect/deploy/systemd/civicconnect-staging.service
command -v npm
```

Comment lines will differ. Any other difference is either a fault in these files (fix them
by pull request) or drift on the VM (record it, then install these files).

## Install

Run as a user with `sudo`, after DEC-003's deployment steps 1 to 3 have put the release at
`/opt/civicconnect` and built `client/dist`.

```sh
sudo install -m 644 /opt/civicconnect/deploy/nginx/civicconnect-staging.conf /etc/nginx/sites-enabled/civicconnect-staging
sudo nginx -t && sudo systemctl reload nginx

sudo install -m 644 /opt/civicconnect/deploy/systemd/civicconnect-staging.service /etc/systemd/system/civicconnect-staging.service
sudo systemd-analyze verify /etc/systemd/system/civicconnect-staging.service
sudo systemctl daemon-reload
sudo systemctl enable --now civicconnect-staging
```

Keep the previous file outside `sites-enabled` (for example
`/etc/nginx/civicconnect-staging.bak-<date>`), as the 15/10/2026 correction did, so that Nginx
does not load both.

## Check after installing

The six checks from the note of 15/10/2026, with the certificate verified, never skipped
(`--cacert`, not `-k`). Write the expected results down first.

| Request | Expected |
|---|---|
| `nginx -t` | syntax ok, test successful |
| `https://<IP>/` | 200, `text/html` |
| `https://<IP>/requests/x` | 200, `text/html` (falls back to `index.html`) |
| `https://<IP>/api/v1/health` | 200, JSON, `release` equal to the deployed tag's commit, database up |
| `http://<IP>/` | 301 to `https://` |
| `https://<IP>/api/v1/nonexistent` | 404 `application/problem+json`, answered by the API |
