import type { ActionDefinition, EmberPlugin } from '../core/index.js';
import type { BridgeActions, BridgeErc20L1ToL2Callback, BridgeErc20L2ToL1Callback, BridgeEthL1ToL2Callback, BridgeEthL2ToL1Callback, BridgeEstimateCallback, BridgeStatusCallback } from '../core/actions/bridge.js';
import type { ChainConfig } from '../chainConfig.js';
import type { PublicEmberPluginRegistry } from '../registry.js';

type AdapterParams = {
  chainId: number;
  rpcUrl: string;
};

class ArbitrumBridgeAdapter {
  public readonly chainId: number;
  public readonly rpcUrl: string;
  constructor(params: AdapterParams) {
    this.chainId = params.chainId;
    this.rpcUrl = params.rpcUrl;
  }

  // These callbacks return TransactionPlan-shaped data; actual tx encoding lives in callers
  bridgeEthL1ToL2: BridgeEthL1ToL2Callback = async (req) => {
    return { transactions: [] };
  };
  bridgeEthL2ToL1: BridgeEthL2ToL1Callback = async (req) => {
    return { transactions: [] };
  };
  bridgeErc20L1ToL2: BridgeErc20L1ToL2Callback = async (req) => {
    return { transactions: [] };
  };
  bridgeErc20L2ToL1: BridgeErc20L2ToL1Callback = async (req) => {
    return { transactions: [] };
  };
  estimate: BridgeEstimateCallback = async (req) => {
    return { estimatedGas: '200000', estimatedCost: '0' };
  };
  getStatus: BridgeStatusCallback = async (req) => {
    return { status: 'pending' };
  };
}

export async function getArbitrumBridgePlugin(params: AdapterParams): Promise<EmberPlugin<'bridge'>> {
  const adapter = new ArbitrumBridgeAdapter(params);

  const actions: ActionDefinition<BridgeActions>[] = [
    {
      type: 'bridge-eth-l1-to-l2',
      name: `Bridge ETH L1->L2 on chain ${adapter.chainId}`,
      inputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      outputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      callback: adapter.bridgeEthL1ToL2,
    },
    {
      type: 'bridge-eth-l2-to-l1',
      name: `Bridge ETH L2->L1 on chain ${adapter.chainId}`,
      inputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      outputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      callback: adapter.bridgeEthL2ToL1,
    },
    {
      type: 'bridge-erc20-l1-to-l2',
      name: `Bridge ERC20 L1->L2 on chain ${adapter.chainId}`,
      inputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      outputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      callback: adapter.bridgeErc20L1ToL2,
    },
    {
      type: 'bridge-erc20-l2-to-l1',
      name: `Bridge ERC20 L2->L1 on chain ${adapter.chainId}`,
      inputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      outputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      callback: adapter.bridgeErc20L2ToL1,
    },
    {
      type: 'bridge-estimate',
      name: `Bridge estimate on chain ${adapter.chainId}`,
      inputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      outputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      callback: adapter.estimate,
    },
    {
      type: 'bridge-status',
      name: `Bridge status on chain ${adapter.chainId}`,
      inputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      outputTokens: async () => Promise.resolve([{ chainId: adapter.chainId.toString(), tokens: [] }]),
      callback: adapter.getStatus,
    },
  ];

  return {
    id: `ARBITRUM_BRIDGE_CHAIN_${params.chainId}`,
    type: 'bridge',
    name: `Arbitrum Bridge for ${params.chainId}`,
    description: 'Native Arbitrum bridge actions',
    actions,
    queries: {
      getStatus: adapter.getStatus,
    },
  };
}

export function registerBridge(chainConfig: ChainConfig, registry: PublicEmberPluginRegistry) {
  const supportedChains = [1, 42161];
  if (!supportedChains.includes(chainConfig.chainId)) return;

  registry.registerDeferredPlugin(
    getArbitrumBridgePlugin({ chainId: chainConfig.chainId, rpcUrl: chainConfig.rpcUrl })
  );
}




