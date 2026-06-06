# -*- coding: utf-8 -*-
from backend.services.forma_sync.paths import (
    forma_sync_manifest_path,
    forma_sync_package_path,
    forma_sync_root_path,
)


def test_forma_sync_root_uses_disk_root_slash():
    assert forma_sync_root_path("515377576") == "/FormaSync/515377576"


def test_forma_sync_paths_no_disk_colon_prefix():
    uid = "515377576"
    assert forma_sync_manifest_path(uid) == "/FormaSync/515377576/manifest.json"
    assert forma_sync_package_path(uid, 1, "desktop") == (
        "/FormaSync/515377576/packages/000001-desktop.zip"
    )
    assert "disk:" not in forma_sync_manifest_path(uid)
    assert "app:" not in forma_sync_manifest_path(uid)
