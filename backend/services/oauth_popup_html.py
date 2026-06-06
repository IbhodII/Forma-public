# -*- coding: utf-8 -*-
"""HTML for OAuth popup close + postMessage (browser and Electron)."""
from __future__ import annotations

import json


def oauth_popup_html(
    message_type: str,
    status: str,
    message: str,
    *,
    user_id: int | None = None,
    email: str | None = None,
    cloud_provider: str | None = None,
    linked_only: bool = False,
    use_custom_scheme: bool = True,
    auto_close_ms: int | None = 800,
) -> str:
    safe_message = message.replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")
    safe_email = (email or "").replace("\\", "\\\\").replace('"', '\\"')
    uid_js = "null" if user_id is None else str(int(user_id))
    payload_obj = {
        "type": message_type,
        "status": status,
        "message": message,
        "user_id": int(user_id) if user_id is not None else None,
        "email": email or "",
        "provider": cloud_provider,
        "linked_only": linked_only,
    }
    payload_json = json.dumps(payload_obj, ensure_ascii=False).replace("</", "<\\/")
    custom_scheme_block = ""
    if use_custom_scheme and user_id is not None and status == "success":
        custom_scheme_block = f"""
  if ({uid_js} !== null && "{status}" === "success") {{
    var q = "user_id=" + encodeURIComponent(String({uid_js}))
      + "&status=success"
      + "&email=" + encodeURIComponent("{safe_email}")
      + (payload.provider ? "&provider=" + encodeURIComponent(String(payload.provider)) : "");
    try {{
      window.location.href = "myhealthdashboard://auth/login?" + q;
    }} catch (e) {{}}
  }}"""
    close_block = ""
    if auto_close_ms is not None and auto_close_ms > 0:
        close_block = f"""
  setTimeout(function () {{ window.close(); }}, {int(auto_close_ms)});"""
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>OAuth</title>
<style>
  body {{
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #0f172a;
    color: #e2e8f0;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }}
  main {{
    width: min(28rem, calc(100vw - 2rem));
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 1rem;
    background: rgba(15, 23, 42, 0.92);
    padding: 1.5rem;
    text-align: center;
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
  }}
  #msg {{ margin: 0; font-size: 1rem; font-weight: 650; }}
  #hint {{ margin: 0.75rem 0 0; color: #94a3b8; font-size: 0.85rem; line-height: 1.45; }}
</style>
</head>
<body>
<main>
<p id="msg">Завершаем подключение…</p>
<p id="hint">Окно закроется автоматически после передачи результата в приложение.</p>
</main>
<script type="application/json" id="forma-oauth-data">{payload_json}</script>
<script>
(function () {{
  var payload = JSON.parse(document.getElementById("forma-oauth-data").textContent);
  console.info("[forma-oauth-page] callback_html_detected");
  console.info("[forma-oauth-page] callback_payload_element_found");
  if (window.opener) {{
    window.opener.postMessage(payload, "*");
  }}
{custom_scheme_block}
  document.getElementById("msg").textContent = "{safe_message}";
{close_block}
}})();
</script>
</body>
</html>"""
