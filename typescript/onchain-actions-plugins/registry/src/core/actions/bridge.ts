import type { TransactionPlan } from '../schemas/core.js';

export type BridgeEthL1ToL2Request = {
  amountWeiHex: string;
  recipient: string;
  userAddress: string;
};
export type BridgeEthL1ToL2Response = {
  transactions: TransactionPlan[];
};
export type BridgeEthL2ToL1Request = {
  amountWeiHex: string;
  recipient: string;
  userAddress: string;
};
export type BridgeEthL2ToL1Response = {
  transactions: TransactionPlan[];
};
export type BridgeErc20L1ToL2Request = {
  token: string;
  amountWeiHex: string;
  recipient: string;
  userAddress: string;
};
export type BridgeErc20L1ToL2Response = {
  transactions: TransactionPlan[];
};
export type BridgeErc20L2ToL1Request = {
  token: string;
  amountWeiHex: string;
  recipient: string;
  userAddress: string;
};
export type BridgeErc20L2ToL1Response = {
  transactions: TransactionPlan[];
};
export type BridgeEstimateRequest = {
  fromChainId: string;
  toChainId: string;
  token?: string;
  amountWeiHex: string;
};
export type BridgeEstimateResponse = {
  estimatedGas: string;
  estimatedCost: string;
};
export type BridgeStatusRequest = {
  chainId: string;
  txHash: string;
};
export type BridgeStatusResponse = {
  status: 'pending' | 'completed' | 'failed';
  blockNumber?: string;
};

export type BridgeEthL1ToL2Callback = (
  request: BridgeEthL1ToL2Request
) => Promise<BridgeEthL1ToL2Response>;
export type BridgeEthL2ToL1Callback = (
  request: BridgeEthL2ToL1Request
) => Promise<BridgeEthL2ToL1Response>;
export type BridgeErc20L1ToL2Callback = (
  request: BridgeErc20L1ToL2Request
) => Promise<BridgeErc20L1ToL2Response>;
export type BridgeErc20L2ToL1Callback = (
  request: BridgeErc20L2ToL1Request
) => Promise<BridgeErc20L2ToL1Response>;
export type BridgeEstimateCallback = (
  request: BridgeEstimateRequest
) => Promise<BridgeEstimateResponse>;
export type BridgeStatusCallback = (
  request: BridgeStatusRequest
) => Promise<BridgeStatusResponse>;

export type BridgeActions =
  | 'bridge-eth-l1-to-l2'
  | 'bridge-eth-l2-to-l1'
  | 'bridge-erc20-l1-to-l2'
  | 'bridge-erc20-l2-to-l1'
  | 'bridge-estimate'
  | 'bridge-status';




