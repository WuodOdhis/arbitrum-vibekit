import { encodeFunctionData } from 'viem';
import type { Address } from 'viem';

import {
  bridgeEthToArbitrum,
  bridgeEthFromArbitrum,
  bridgeErc20ToArbitrum,
  bridgeErc20FromArbitrum,
  generateBridgeTransaction,
} from './simple-tools.js';

// Minimal type copies aligned with Ember Plugin System (upstream registry)

export type PluginType = 'swap';

export interface TokenIdentifier {
  chainId: string;
  address: string;
}

export interface Token {
  tokenUid: TokenIdentifier;
  name: string;
  symbol: string;
  isNative: boolean;
  decimals: number;
  iconUri?: string | null;
  isVetted: boolean;
}

export interface TransactionPlan {
  type: 'EVM_TX';
  to: string;
  data: string;
  value: string;
  chainId: string;
}

export interface SwapTokensRequest {
  fromToken: Token;
  toToken: Token;
  amount: bigint; // exact amount in base units
  limitPrice?: string;
  slippageTolerance?: string;
  expiration?: string;
  recipient: string; // EVM address
}

export interface SwapTokensResponse {
  fromToken: Token;
  toToken: Token;
  exactFromAmount: string; // hex string amount
  displayFromAmount: string;
  exactToAmount: string; // hex string amount
  displayToAmount: string;
  transactions: TransactionPlan[];
  // Optional fields from upstream omitted for brevity
}

export type SwapActions = 'swap';

export interface TokenSet {
  chainId: string;
  tokens: string[]; // list of token addresses
}

export type Action = SwapActions;

export type SwapActionCallback = (request: SwapTokensRequest) => Promise<SwapTokensResponse>;

export type ActionCallback<T extends Action> = T extends 'swap' ? SwapActionCallback : never;

export interface ActionDefinition<T extends Action> {
  name: string;
  type: T;
  callback: ActionCallback<T>;
  inputTokens: () => Promise<TokenSet[]>;
  outputTokens?: () => Promise<TokenSet[]>;
}

export interface EmberPlugin<Type extends PluginType> {
  id?: string;
  type: Type;
  actions: ActionDefinition<Action>[];
  // Swap plugins usually have no queries
  queries: Record<string, never> | undefined;
  name: string;
  description?: string;
  x?: string;
  website?: string;
}

function formatDisplayAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString();
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const frac = amount % base;
  // Trim trailing zeros in fractional part
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fracStr.length > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
}

function bigintToHex(amount: bigint): string {
  return '0x' + amount.toString(16);
}

async function createBridgeTransactionPlan(
  req: SwapTokensRequest
): Promise<{ plan: TransactionPlan; exactToAmount: bigint }> {
  const fromChainId = req.fromToken.tokenUid.chainId;
  const toChainId = req.toToken.tokenUid.chainId;
  const isEth = req.fromToken.isNative;
  const amountHex = bigintToHex(req.amount);

  // Prefer pure generator when available (ETH L1->L2)
  let res:
    | Awaited<ReturnType<typeof generateBridgeTransaction['execute']>>
    | Awaited<ReturnType<typeof bridgeEthToArbitrum['execute']>>
    | Awaited<ReturnType<typeof bridgeEthFromArbitrum['execute']>>
    | Awaited<ReturnType<typeof bridgeErc20ToArbitrum['execute']>>
    | Awaited<ReturnType<typeof bridgeErc20FromArbitrum['execute']>>;

  if (fromChainId === '1' && toChainId === '42161') {
    if (isEth) {
      // Use pure tx generator for ETH L1->L2
      res = await generateBridgeTransaction.execute({
        amount: amountHex,
        recipient: req.recipient,
        userAddress: req.recipient,
        slippageBps: 100,
        deadlineMinutes: 30,
      });
    } else {
      res = await bridgeErc20ToArbitrum.execute({
        tokenAddress: req.fromToken.tokenUid.address,
        amount: amountHex,
        recipient: req.recipient,
        userAddress: req.recipient,
        slippageBps: 100,
        deadlineMinutes: 30,
      });
    }
  } else if (fromChainId === '42161' && toChainId === '1') {
    if (isEth) {
      res = await bridgeEthFromArbitrum.execute({
        amount: amountHex,
        recipient: req.recipient,
        userAddress: req.recipient,
        slippageBps: 100,
        deadlineMinutes: 30,
      });
    } else {
      res = await bridgeErc20FromArbitrum.execute({
        tokenAddress: req.fromToken.tokenUid.address,
        amount: amountHex,
        recipient: req.recipient,
        userAddress: req.recipient,
        slippageBps: 100,
        deadlineMinutes: 30,
      });
    }
  } else {
    throw new Error(`Unsupported chain pair ${fromChainId} -> ${toChainId}`);
  }

  if (!res.transaction) {
    throw new Error('Bridge tool did not return a transaction');
  }

  // Encode data if object contains abi, functionName, args
  let dataHex = '0x';
  const maybe = res.transaction.data as any;
  if (maybe && maybe.abi && maybe.functionName) {
    try {
      dataHex = encodeFunctionData({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        abi: maybe.abi as any,
        functionName: maybe.functionName as any,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        args: (maybe.args || []) as any,
      });
    } catch {
      dataHex = '0x';
    }
  } else if (typeof res.transaction.data === 'string') {
    dataHex = res.transaction.data as string;
  }

  const plan: TransactionPlan = {
    type: 'EVM_TX',
    to: res.transaction.to as string,
    data: dataHex,
    value: (res.transaction.value ?? '0x0') as string,
    chainId: fromChainId,
  };

  // For native bridge, assume 1:1 nominally (fees excluded)
  return { plan, exactToAmount: req.amount };
}

export async function getArbitrumBridgePlugin(): Promise<EmberPlugin<'swap'>> {
  const action: ActionDefinition<'swap'> = {
    type: 'swap',
    name: 'Arbitrum native bridge',
    inputTokens: async () =>
      Promise.resolve([
        { chainId: '1', tokens: ['ETH'] },
        { chainId: '42161', tokens: ['ETH'] },
      ]),
    outputTokens: async () =>
      Promise.resolve([
        { chainId: '1', tokens: ['ETH'] },
        { chainId: '42161', tokens: ['ETH'] },
      ]),
    callback: async (req: SwapTokensRequest): Promise<SwapTokensResponse> => {
      const { plan, exactToAmount } = await createBridgeTransactionPlan(req);
      const exactFromAmountHex = bigintToHex(req.amount);
      const exactToAmountHex = bigintToHex(exactToAmount);
      const displayFrom = formatDisplayAmount(req.amount, req.fromToken.decimals);
      const displayTo = formatDisplayAmount(exactToAmount, req.toToken.decimals);

      return {
        fromToken: req.fromToken,
        toToken: req.toToken,
        exactFromAmount: exactFromAmountHex,
        displayFromAmount: displayFrom,
        exactToAmount: exactToAmountHex,
        displayToAmount: displayTo,
        transactions: [plan],
      };
    },
  };

  return {
    id: 'ARBITRUM_NATIVE_BRIDGE',
    type: 'swap',
    name: 'Arbitrum Native Bridge',
    description: 'Bridge ETH and ERC20 between Ethereum and Arbitrum using the native bridge',
    actions: [action],
    queries: undefined,
    website: 'https://arbitrum.io',
  } as const;
}


