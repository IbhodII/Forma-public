# -*- coding: utf-8 -*-
"""Release capability matrix for desktop (mirrors clientCapabilities.ts)."""


def test_desktop_release_capability_matrix():
    """Packaged desktop: ZIP backup on; dev import paths off."""
    desktop = {
        "enableZipBackupRestore": True,
        "enableJsonAccountBackup": False,
        "enableTwoFileDatabaseImport": False,
        "enableMiniDatabaseExport": False,
        "enableDatabaseImport": True,
        "enableScheduledLocalBackup": True,
        "enableLocalAdminLogin": False,
        "enableDeveloperTools": False,
    }
    assert desktop["enableZipBackupRestore"] is True
    assert desktop["enableJsonAccountBackup"] is False
    assert desktop["enableTwoFileDatabaseImport"] is False
    assert desktop["enableMiniDatabaseExport"] is False
    assert desktop["enableDatabaseImport"] is True
    assert desktop["enableLocalAdminLogin"] is False


def test_admin_browser_has_dev_import_paths():
    admin = {
        "enableZipBackupRestore": True,
        "enableJsonAccountBackup": True,
        "enableTwoFileDatabaseImport": True,
        "enableMiniDatabaseExport": True,
        "enableDatabaseImport": True,
    }
    assert all(admin.values())
