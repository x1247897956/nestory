**English** | [简体中文](operations.md)

# Deploy Nestory

Run Nestory on your own device with Docker Compose. Nestory is designed for personal use on a local device or trusted local network.

## Install

Install Docker and Compose v2, then run these commands from the project root:

```sh
cp .env.example .env
docker compose up -d --build
docker compose ps
```

The first start builds the image. Once the `noteapp` service is `healthy`, use the address configured for your deployment. The default port is `8080`, with access restricted to the local device. For access from other devices, see [local network configuration (简体中文)](configuration.md#局域网访问).

If the service does not start, check the logs:

```sh
docker compose logs --tail=100 noteapp
```

## Data storage

Notes, tasks, events, and attachments are stored in a Docker volume, named `noteapp_noteapp-data` by default. Stopping or recreating the container preserves your data.

To stop the application:

```sh
docker compose down
```

Do not add `-v`: it deletes the data volume. The service and volume retain the engineering name `noteapp`; existing installations do not need to rename them.

## Update

Back up your data first, as described below. After obtaining the new source version, keep your existing `.env` and data volume, then run:

```sh
docker compose up -d --build --force-recreate
docker compose ps
```

Once the service is healthy, refresh your browser and check that your projects and attachments open correctly.

## Back up

The backup script requires Python 3.9+ on the host. It briefly stops the application, backs up the database and attachments, and attempts to restore the container's previous running state.

Run the following from the deployment directory. If you changed the volume name, replace `--volume` with its actual name. Use a new output directory for each backup.

```sh
mkdir -p backups
nestory_container=$(docker compose ps -q noteapp)
scripts/backup.sh \
  --container "$nestory_container" \
  --volume noteapp_noteapp-data \
  --image "$(docker inspect --format '{{.Image}}' "$nestory_container")" \
  --app-version "$(git rev-parse HEAD)" \
  --output "$PWD/backups/before-update"
```

`Verified backup` confirms that validation succeeded. Keep the entire backup directory, and store a copy together with `.env` and `compose.yaml` somewhere other than the deployment device.

## Restore

Find `image_id` in the backup's `manifest.json` and replace `IMAGE_ID` below with that value. Restore with the original image into a newly created, empty volume.

```sh
docker volume create noteapp-restored
scripts/restore.sh \
  --volume noteapp-restored \
  --image IMAGE_ID \
  --backup "$PWD/backups/before-update"
```

After a successful restore, set these values in `.env`:

```dotenv
APP_VOLUME_NAME=noteapp-restored
APP_IMAGE=IMAGE_ID
```

Replace `IMAGE_ID` with the image ID from the backup manifest, then start the application and check the restored content:

```sh
docker compose up -d --no-build --force-recreate
```

Keep the original volume and backup until you have checked your content and attachments. Follow the same process to restore an older version; do not point an old image at an upgraded database.

Older Markdown databases (schema6 and earlier) require an additional offline conversion. New installations do not need this step. If you have an older database, read the [legacy content migration instructions (简体中文)](implementation/2026-10-25-block-migration-tool.md).
