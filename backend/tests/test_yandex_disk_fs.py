# -*- coding: utf-8 -*-
from unittest.mock import MagicMock

from backend.services.yandex_disk_fs import is_disk_not_found, iter_parent_paths


def test_iter_parent_paths_disk():
    paths = iter_parent_paths("disk:/FormaSync/12345/packages")
    assert paths == [
        "disk:/FormaSync",
        "disk:/FormaSync/12345",
        "disk:/FormaSync/12345/packages",
    ]


def test_iter_parent_paths_disk_root():
    paths = iter_parent_paths("/MyHealthDashboard/Backups")
    assert paths == ["/MyHealthDashboard", "/MyHealthDashboard/Backups"]


def test_is_disk_not_found_from_message():
    resp = MagicMock()
    resp.status_code = 400
    resp.json.return_value = {"message": "No item with that key"}
    assert is_disk_not_found(resp) is True
