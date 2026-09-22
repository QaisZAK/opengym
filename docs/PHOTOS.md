# Progress photos (Google Drive)

Progress photos are stored in **each user's own Google Drive**, never on the openGym server. The
app asks only for the `drive.file` scope, so it can see nothing in Drive except the files it
created (an **openGym Progress** folder). The access token lives in the browser's memory; the
server and the synced state only ever hold Drive **file ids**.

## For users

1. **Settings → Progress photos → Connect Google Drive** and pick your Google account.
2. When logging body weight, tap **Add progress photo** — or add one without a weigh-in from
   **Settings → Progress photos** (also the camera button on the Stats body-weight card).
3. The **Progress photos** sheet shows every photo in a grid and a **before & after** compare
   (first vs latest by default; pick any two).

Photos are resized to ~1080 px JPEG in the browser before upload. Disconnecting stops new uploads
and leaves your Drive untouched.

## For the instance owner (one-time)

The feature stays hidden until the server has a client id:

1. In Google Cloud Console, create or choose a project and enable the **Google Drive API**.
2. Configure the **OAuth consent screen** (External). Add your users as testers or publish the
   app; the only scope is `.../auth/drive.file`.
3. Create an **OAuth client ID** of type **Web application**. Under *Authorized JavaScript
   origins* add every origin you serve the app from (e.g. `https://gym.example.com`, and
   `http://localhost:5173` for development). No redirect URI is needed — this is the browser token
   flow.
4. Put `GOOGLE_CLIENT_ID=<client id>` in `.env` and restart the api. The client id is public;
   **no client secret is used or needed** — don't put one anywhere.

The id is exposed to the app through `GET /api/config` (`google.clientId`). All Drive calls are in
`frontend/src/lib/gdrive.js`.

Note: Google's sign-in popup doesn't complete inside some embedded browsers; test in a normal
browser tab.
