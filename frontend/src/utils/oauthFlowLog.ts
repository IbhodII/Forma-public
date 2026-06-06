/** Structured OAuth flow logs (packaged desktop + dev browser). */
export type OAuthFlowEvent =
  | "oauth_window_opened"
  | "oauth_redirect_seen"
  | "oauth_callback_url"
  | "oauth_callback_received"
  | "oauth_code_extracted"
  | "oauth_state_validated"
  | "token_exchange_started"
  | "token_exchange_success"
  | "token_exchange_failed"
  | "token_saved_to_backend"
  | "cloud_link_saved"
  | "main_window_notified"
  | "auth_context_refresh_started"
  | "auth_context_refresh_success"
  | "auth_context_refresh_failure"
  | "auth_refresh_success"
  | "auth_refresh_failed"
  | "cloud_status_reload_started"
  | "cloud_status_reload_success"
  | "oauth_ui_success_shown"
  | "oauth_ui_error_shown"
  | "renderer_notified"
  | "oauth_debug_status"
  | "oauth_debug_status_failed"
  | "oauth_post_close_status"
  | "oauth_post_close_status_failed"
  | "callback_page_loaded"
  | "callback_html_detected"
  | "callback_payload_element_found"
  | "callback_payload_text"
  | "preload_dom_ready"
  | "preload_payload_read_success"
  | "preload_payload_read_failed"
  | "ipc_payload_sent"
  | "main_payload_received"
  | "renderer_payload_received"
  | "oauth_window_close_requested";

export function oauthFlowLog(event: OAuthFlowEvent, detail?: unknown): void {
  if (detail === undefined) {
    console.info(`[forma-oauth] ${event}`);
  } else {
    console.info(`[forma-oauth] ${event}`, detail);
  }
  try {
    window.electronAPI?.logOAuthFlow?.(event, detail);
  } catch {
    // ignore
  }
}
