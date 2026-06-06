import {useEffect, useState} from 'react';
import {
  resolveClientCapabilities,
  type ClientCapabilities,
} from '../config/clientCapabilities';

const PRODUCTION_FALLBACK: ClientCapabilities = {
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

export function useClientCapabilities(): ClientCapabilities {
  const [caps, setCaps] = useState<ClientCapabilities>(PRODUCTION_FALLBACK);

  useEffect(() => {
    let cancelled = false;
    resolveClientCapabilities().then(c => {
      if (!cancelled) setCaps(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return caps;
}
