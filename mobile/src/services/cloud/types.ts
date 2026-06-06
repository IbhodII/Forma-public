export type CloudBackupFile = {
  filename: string;
  remotePath?: string;
  createdAt?: string | null;
  sizeBytes?: number | null;
};

export type CloudConnectionInfo = {
  connected: boolean;
  provider: 'yandex' | 'google';
  expiresAt?: string | null;
};
