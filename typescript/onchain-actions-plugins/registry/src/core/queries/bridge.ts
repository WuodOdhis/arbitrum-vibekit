export type BridgeGetStatus = (request: { chainId: string; txHash: string }) => Promise<{
  status: 'pending' | 'completed' | 'failed';
  blockNumber?: string;
}>;

export type BridgeQueries = {
  getStatus: BridgeGetStatus;
};




