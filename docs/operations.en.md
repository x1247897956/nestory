**English** | [简体中文](operations.md)

# Deploy Nestory

For an existing installation, preserve its `.env`, Compose project, port, image, and data volume rather than using fresh-install defaults.

Run Nestory on your own device with Docker Compose. Nestory is designed for personal use on a local device or trusted local network.

## Install

Install Docker and Compose v2. On Windows, use Docker Desktop in Linux container mode. Standard deployment does not require Python, Git Bash, or commands run from a WSL terminal.

For a new installation, prepare the configuration from the project root. On Linux/macOS:

```sh
[ -f .env ] || cp .env.example .env
```

On Windows PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Open `.env` in a text editor and confirm `APP_TIMEZONE=Asia/Shanghai` or change it to your desired IANA timezone, such as `UTC` or `Europe/Berlin`. Deployment never reads the host timezone or overwrites this value. Then run on any platform:

```sh
docker compose up -d --build
docker compose ps
```

The command builds and starts two independent services: `noteapp` (Go API) and `frontend` (Nginx SPA and API proxy). Once both services are `healthy`, use the address configured for your deployment. The default port is `8080`, with access restricted to the local device. For access from other devices, see [local network configuration (简体中文)](configuration.md#局域网访问).

If the service does not start, check the logs:

```sh
docker compose logs --tail=100 noteapp frontend
```

## Data storage

Notes, tasks, events, and attachments are stored in a Docker volume, named `noteapp_noteapp-data` by default. Stopping or recreating the container preserves your data.

To stop the application:

```sh
docker compose down
```

Do not add `-v`: it deletes the data volume. The service and volume retain the engineering name `noteapp`; existing installations do not need to rename them.

## Update

Daily recovery uses the recycle bin. There are no scheduled backups, background snapshots, or automatic restore rehearsals. For moving to another device, manually export a workspace ZIP from Settings and import it into an empty instance. The offline commands below are optional operator tools.

After obtaining the new source version, keep your existing `.env` and data volume, then explicitly run:

```sh
docker compose up -d --build --force-recreate
docker compose ps
```

Once the service is healthy, refresh your browser and check that your projects and attachments open correctly.

## Independent updates

With mutable local image tags, update only the frontend or backend:

```sh
docker compose up -d --build --no-deps frontend
docker compose up -d --build --no-deps noteapp
```

`APP_IMAGE` selects the backend; `APP_FRONTEND_IMAGE` selects the frontend. Settings displays their separate build versions. For pinned image IDs/digests, first build or obtain a new image, explicitly update its pin, then recreate that service using `--no-build --no-deps` instead of building into an immutable pin.

## Migrating from the old single container

Record the current Compose project, external port, image, data volume, `.env`, and old Compose file. Preserve the same project name, `.env`, and `APP_VOLUME_NAME`; the backend retains the `noteapp` service and `/data` mount. Do not replace existing configuration with fresh-install defaults.

Build the new images under distinct tags:

```sh
docker build --build-arg APP_VERSION=YOUR_VERSION -t noteapp:split .
docker build --build-arg APP_VERSION=YOUR_VERSION -t noteapp-web:split web
```

Point `APP_IMAGE` to the new backend and add `APP_FRONTEND_IMAGE=noteapp-web:split`. Explicitly run `docker compose up -d --no-build`. The external port moves from backend to frontend, causing a brief interruption. Check both services, existing projects, trash and attachments.

This split introduces no schema change. To roll back the deployment layout, stop the new Compose services without `-v`, restore the old Compose file, `.env` and image, then start them. Changing only `APP_IMAGE` does not restore the old port layout. If a separate database migration occurred, follow the restore procedure instead of opening a newer schema with an older image.

## Optional offline migration

The optional offline tool requires Docker and Python 3.9+ on the host. It briefly stops the application, backs up the database and attachments, and attempts to restore the container's previous running state. The multiline examples below use POSIX shell syntax (Linux/macOS/WSL). On Windows PowerShell, invoke `py scripts/operations.py backup` or `restore` with the same argument values.

Run the following only when you choose to perform an offline export. It reads the actual data volume from the container; use a new output directory each time.

```sh
mkdir -p backups
nestory_container=$(docker compose ps -q noteapp)
nestory_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$nestory_container")
python3 scripts/operations.py backup \
  --container "$nestory_container" \
  --volume "$nestory_volume" \
  --image "$(docker inspect --format '{{.Image}}' "$nestory_container")" \
  --app-version "$(git rev-parse HEAD)" \
  --output "$PWD/backups/before-update"
```

`Verified backup` confirms that validation succeeded. Keep the entire backup directory, and store a copy together with `.env` and `compose.yaml` somewhere other than the deployment device.

## Restore

Find `image_id` in the backup's `manifest.json` and replace `IMAGE_ID` below with that value. Restore with the original image into a newly created, empty volume.

```sh
docker volume create noteapp-restored
python3 scripts/operations.py restore \
  --volume noteapp-restored \
  --image IMAGE_ID \
  --backup "$PWD/backups/before-update"
```

After a successful restore, set these values in `.env`:

```dotenv
APP_VOLUME_NAME=noteapp-restored
APP_IMAGE=IMAGE_ID
```

Replace `IMAGE_ID` with the backend image ID from the backup manifest and select a compatible frontend using `APP_FRONTEND_IMAGE`. Offline manifests record backend data and image metadata, not the frontend. Then start the application and check the restored content:

```sh
docker compose up -d --no-build --force-recreate
```

Keep the original volume and backup until you have checked your content and attachments. Follow the same process to restore an older version; do not point an old image at an upgraded database.

Older Markdown databases (schema6 and earlier) require an additional offline conversion. New installations do not need this step. If you have an older database, read the [legacy content migration instructions (简体中文)](migrations/legacy-markdown.md).
