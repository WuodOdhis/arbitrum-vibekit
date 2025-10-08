export type RuntimeContext = {
  ethereumRpcUrl: string;
  arbitrumRpcUrl: string;
  privateKey?: string | null;
};

export function loadRuntimeContext(): RuntimeContext {
  const ethereumRpcUrl = process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';
  const arbitrumRpcUrl = process.env.ARBITRUM_RPC_URL || '';
  const privateKey = process.env.PRIVATE_KEY || null;
  return { ethereumRpcUrl, arbitrumRpcUrl, privateKey };
}




