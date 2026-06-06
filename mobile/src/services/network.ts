import NetInfo from '@react-native-community/netinfo';

function netInfoOnline(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}): boolean {
  if (!state.isConnected) {
    return false;
  }
  // Android often reports null while Wi‑Fi is fine.
  if (state.isInternetReachable === false) {
    return false;
  }
  return true;
}

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return netInfoOnline(state);
}

export function subscribeNetwork(
  onChange: (online: boolean) => void,
): () => void {
  return NetInfo.addEventListener(state => {
    onChange(netInfoOnline(state));
  });
}
