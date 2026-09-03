export type ZoyaState = 'idle' | 'listening' | 'speaking' | 'thinking';

export interface AppState {
  hasMicPermission: boolean;
  zoyaState: ZoyaState;
  isConnected: boolean;
}
