# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

ROOT = Path.cwd().resolve()
if ROOT.name.lower() == "frontend":
    ROOT = ROOT.parent
frontend_dist = (ROOT / "frontend" / "dist").resolve()
# Use minimal packaging seed DBs — never bundle the developer workouts.db (user data).
seed_dir = (ROOT / "packaging" / "seed").resolve()
workouts_db = (seed_dir / "workouts.db").resolve()
shared_db = (seed_dir / "shared.db").resolve()

a = Analysis(
    ["backend/run_server.py"],
    pathex=[],
    binaries=[],
    datas=[
        (str(frontend_dist), "frontend/dist"),
        (str(workouts_db), "seed"),
        (str(shared_db), "seed"),
    ],
    hiddenimports=[
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.logging",
        "uvicorn.lifespan.on",
        "httpx",
        "httpcore",
        "yadisk.sessions.async_httpx_session",
        "yadisk.sessions._httpx_common",
    ]
    + collect_submodules("yadisk")
    + collect_submodules("httpx")
    + collect_submodules("httpcore"),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    icon="frontend/build/icon.ico",
)
