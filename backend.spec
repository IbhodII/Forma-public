# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

ROOT = Path.cwd().resolve()
if ROOT.name.lower() == "frontend":
    ROOT = ROOT.parent
frontend_dist = (ROOT / "frontend" / "dist").resolve()
workouts_db = (ROOT / "workouts.db").resolve()
shared_db = (ROOT / "shared.db").resolve()

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
    ] + collect_submodules("yadisk"),
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
