import {isDeveloperModeEnabled} from './developerMode';

export type ClientMode = 'admin_browser' | 'desktop_app' | 'mobile_app';

export type ClientCapabilities = {
  mode: ClientMode;
  enableDeveloperTools: boolean;
  enableDebugPanels: boolean;
  enableRawSyncViews: boolean;
  enableOAuthDebug: boolean;
  enableHealthConnectDebug: boolean;
  enableLanControls: boolean;
  enableLegacyImportTools: boolean;
  enableLocalAdminLogin: boolean;
  enableLegacyApiMode: boolean;
  enableLocalHcTestMode: boolean;
};

const PRODUCTION_MOBILE: ClientCapabilities = {
  mode: 'mobile_app',
  enableDeveloperTools: false,
  enableDebugPanels: false,
  enableRawSyncViews: false,
  enableOAuthDebug: false,
  enableHealthConnectDebug: false,
  enableLanControls: false,
  enableLegacyImportTools: false,
  enableLocalAdminLogin: false,
  enableLegacyApiMode: false,
  enableLocalHcTestMode: false,
};

export async function resolveClientCapabilities(): Promise<ClientCapabilities> {
  if (__DEV__) {
    const devOn = await isDeveloperModeEnabled();
    return {
      mode: 'mobile_app',
      enableDeveloperTools: devOn,
      enableDebugPanels: devOn,
      enableRawSyncViews: devOn,
      enableOAuthDebug: devOn,
      enableHealthConnectDebug: devOn,
      enableLanControls: devOn,
      enableLegacyImportTools: devOn,
      enableLocalAdminLogin: false,
      enableLegacyApiMode: devOn,
      enableLocalHcTestMode: devOn,
    };
  }
  return {...PRODUCTION_MOBILE};
}

export function clientModeHeaderValue(): string {
  return 'mobile_app';
}
