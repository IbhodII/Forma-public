# Desktop App Icon

Put your production Windows icon file here:

- `build/icon.ico` (recommended for Electron Windows builds)

Then add this back to `frontend/package.json` under `build.win`:

```json
"icon": "build/icon.ico"
```

If `icon` is not set, Electron Builder uses a default icon and the app still builds.
