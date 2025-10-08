#!/usr/bin/env node

/**
 * MCP Server Wrapper for Arbitrum Bridge Tools
 * 
 * This creates an MCP server that exposes the refactored tools
 * for use with the MCP inspector and other MCP clients.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';
import { encodeFunctionData } from 'viem';
import { generateBridgeTransaction, bridgeEthFromArbitrum, bridgeErc20ToArbitrum, bridgeErc20FromArbitrum, estimateBridgeGas, getBridgeStatus } from './simple-tools.js';
import { loadRuntimeContext } from './context.js';
// Using dynamic import of the built registry package to avoid cross-package TS compile issues

// Create MCP server
const server = new Server(
  {
    name: 'arbitrum-bridge-tools',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper function to convert Zod schema to JSON Schema
function zodToJsonSchema(zodSchema: any): any {
  if (zodSchema._def?.typeName === 'ZodObject') {
    const shape = zodSchema._def.shape();
    const properties: any = {};
    const required: string[] = [];
    
    Object.entries(shape).forEach(([key, value]: [string, any]) => {
      let fieldSchema = value._def;
      let isOptional = false;
      let actualSchema = fieldSchema;
      
      // Handle optional and default fields
      if (fieldSchema.typeName === 'ZodOptional') {
        isOptional = true;
        actualSchema = fieldSchema.inner?._def || fieldSchema.inner;
      } else if (fieldSchema.typeName === 'ZodDefault') {
        isOptional = true;
        actualSchema = fieldSchema.inner?._def || fieldSchema.inner;
      }
      
      // Handle ZodEffects (refinements)
      if (actualSchema?.typeName === 'ZodEffects') {
        actualSchema = actualSchema.schema?._def || actualSchema.schema;
      }
      
      // Determine field type and properties
      if (actualSchema?.typeName === 'ZodString') {
        properties[key] = {
          type: 'string',
          description: actualSchema.description || fieldSchema.description || '',
        };
      } else if (actualSchema?.typeName === 'ZodNumber') {
        properties[key] = {
          type: 'number',
          description: actualSchema.description || fieldSchema.description || '',
        };
        if (actualSchema.min !== undefined) {
          properties[key].minimum = actualSchema.min;
        }
        if (actualSchema.max !== undefined) {
          properties[key].maximum = actualSchema.max;
        }
      } else if (actualSchema?.typeName === 'ZodUnion') {
        properties[key] = {
          type: 'string',
          description: actualSchema.description || fieldSchema.description || '',
          enum: actualSchema.options?.map((opt: any) => opt._def?.value || opt) || [],
        };
      } else {
        // Fallback for other types
        properties[key] = {
          type: 'string',
          description: fieldSchema.description || actualSchema?.description || '',
        };
      }
      
      // Add to required array if not optional
      if (!isOptional) {
        required.push(key);
      }
    });
    
    return {
      type: 'object',
      properties,
      required,
    };
  }
  
  // Fallback for unknown schema types
  return {
    type: 'object',
    properties: {},
    required: [],
  };
}

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  type ChainConfig = { chainId: number; name: string; rpcUrl: string };
  const chains: ChainConfig[] = [
    { chainId: 1, name: 'Ethereum', rpcUrl: loadRuntimeContext().ethereumRpcUrl },
    { chainId: 42161, name: 'Arbitrum One', rpcUrl: loadRuntimeContext().arbitrumRpcUrl },
  ];
  const registryModulePath = process.env.VIBEKIT_REGISTRY_PATH || path.join(process.cwd(), 'typescript', 'onchain-actions-plugins', 'registry', 'dist', 'index.js');
  const { initializePublicRegistry } = await import(registryModulePath);
  const registry = (initializePublicRegistry as any)(chains);
  const toolsList: { name: string; description: string; inputSchema: any }[] = [];
  for await (const plugin of (registry as any).getPlugins()) {
    for (const action of plugin.actions as any[]) {
      let inputSchema: any = { type: 'object', properties: {}, required: [] };
      if (plugin.type === 'bridge') {
        switch (String(action.type)) {
          case 'bridge-eth-l1-to-l2':
          case 'bridge-eth-l2-to-l1':
            inputSchema = {
              type: 'object',
              properties: {
                amount: { type: 'string', description: 'Amount in wei as hex string (e.g., 0xde0b6b3a7640000)' },
                recipient: { type: 'string', description: 'Destination EVM address (0x...)' },
                userAddress: { type: 'string', description: 'Sender EVM address (0x...)' },
                maxSubmissionCost: { type: 'string', description: 'Hex wei (optional)' },
                maxGas: { type: 'string', description: 'Hex units (optional)' },
                gasPriceBid: { type: 'string', description: 'Hex wei per gas (optional)' },
                slippageBps: { type: 'number', description: 'Basis points, default 100' },
                deadlineMinutes: { type: 'number', description: 'Default 30' },
              },
              required: ['amount', 'recipient', 'userAddress'],
            };
            break;
          case 'bridge-erc20-l1-to-l2':
          case 'bridge-erc20-l2-to-l1':
            inputSchema = {
              type: 'object',
              properties: {
                tokenAddress: { type: 'string', description: 'ERC20 token address (0x...)' },
                amount: { type: 'string', description: 'Amount in base units as hex string' },
                recipient: { type: 'string', description: 'Destination EVM address (0x...)' },
                userAddress: { type: 'string', description: 'Sender EVM address (0x...)' },
                maxSubmissionCost: { type: 'string', description: 'Hex wei (optional)' },
                maxGas: { type: 'string', description: 'Hex units (optional)' },
                gasPriceBid: { type: 'string', description: 'Hex wei per gas (optional)' },
                slippageBps: { type: 'number', description: 'Basis points, default 100' },
                deadlineMinutes: { type: 'number', description: 'Default 30' },
              },
              required: ['tokenAddress', 'amount', 'recipient', 'userAddress'],
            };
            break;
          case 'bridge-estimate':
            inputSchema = {
              type: 'object',
              properties: {
                fromChain: { type: 'string', enum: ['ethereum', 'arbitrum'] },
                toChain: { type: 'string', enum: ['ethereum', 'arbitrum'] },
                tokenAddress: { type: 'string', description: 'Optional token address; omit for ETH' },
                amount: { type: 'string', description: 'Amount in base units as hex string' },
              },
              required: ['fromChain', 'toChain', 'amount'],
            };
            break;
          case 'bridge-status':
            inputSchema = {
              type: 'object',
              properties: {
                transactionHash: { type: 'string', description: 'Tx hash (0x + 64 hex chars)' },
                chainId: { type: 'number', enum: [1, 42161], description: 'Chain where tx was submitted' },
              },
              required: ['transactionHash'],
            };
            break;
        }
      }
      toolsList.push({
        name: `${plugin.type}:${action.type}`,
        description: action.name,
        inputSchema,
      });
    }
  }
  return { tools: toolsList };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const [pluginType, actionType] = String(name).split(':');
  type ChainConfig = { chainId: number; name: string; rpcUrl: string };
  const chains: ChainConfig[] = [
    { chainId: 1, name: 'Ethereum', rpcUrl: loadRuntimeContext().ethereumRpcUrl },
    { chainId: 42161, name: 'Arbitrum One', rpcUrl: loadRuntimeContext().arbitrumRpcUrl },
  ];
  const registryModulePath = process.env.VIBEKIT_REGISTRY_PATH || path.join(process.cwd(), 'typescript', 'onchain-actions-plugins', 'registry', 'dist', 'index.js');
  const { initializePublicRegistry } = await import(registryModulePath);
  const registry = (initializePublicRegistry as any)(chains);
  let foundAction: { plugin: any; action: any } | null = null;
  for await (const plugin of (registry as any).getPlugins()) {
    if (plugin.type !== pluginType) continue;
    for (const action of plugin.actions as any[]) {
      if (String(action.type) === actionType) {
        foundAction = { plugin, action };
        break;
      }
    }
    if (foundAction) break;
  }
  if (!foundAction) {
    throw new Error(`Tool '${name}' not found`);
  }
  try {
    // Bridge adapter: route to existing simple-tools and normalize result to TransactionPlan when applicable
    if (pluginType === 'bridge') {
      let result: any;
      if (actionType === 'bridge-eth-l1-to-l2') {
        result = await generateBridgeTransaction.execute(args as any);
        const tx = result.transaction;
        const encoded = encodeFunctionData({ abi: tx.data.abi, functionName: tx.data.functionName, args: tx.data.args });
        return { content: [{ type: 'text', text: JSON.stringify({ transactions: [{ type: 'EVM_TX', to: tx.to, data: encoded, value: tx.value, chainId: '1' }] }, null, 2) }] };
      }
      if (actionType === 'bridge-eth-l2-to-l1') {
        result = await bridgeEthFromArbitrum.execute(args as any);
        const tx = result.transaction;
        const encoded = encodeFunctionData({ abi: tx.data.abi, functionName: tx.data.functionName, args: tx.data.args });
        return { content: [{ type: 'text', text: JSON.stringify({ transactions: [{ type: 'EVM_TX', to: tx.to, data: encoded, value: tx.value, chainId: '42161' }] }, null, 2) }] };
      }
      if (actionType === 'bridge-erc20-l1-to-l2') {
        result = await bridgeErc20ToArbitrum.execute(args as any);
        const tx = result.transaction;
        const encoded = encodeFunctionData({ abi: tx.data.abi, functionName: tx.data.functionName, args: tx.data.args });
        return { content: [{ type: 'text', text: JSON.stringify({ transactions: [{ type: 'EVM_TX', to: tx.to, data: encoded, value: '0x0', chainId: '1' }] }, null, 2) }] };
      }
      if (actionType === 'bridge-erc20-l2-to-l1') {
        result = await bridgeErc20FromArbitrum.execute(args as any);
        const tx = result.transaction;
        const encoded = encodeFunctionData({ abi: tx.data.abi, functionName: tx.data.functionName, args: tx.data.args });
        return { content: [{ type: 'text', text: JSON.stringify({ transactions: [{ type: 'EVM_TX', to: tx.to, data: encoded, value: '0x0', chainId: '42161' }] }, null, 2) }] };
      }
      if (actionType === 'bridge-estimate') {
        result = await estimateBridgeGas.execute(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
      if (actionType === 'bridge-status') {
        result = await getBridgeStatus.execute(args as any);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    }
    const result = await (foundAction.action.callback as any)(args as any);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', tool: name, args }, null, 2) }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Arbitrum Bridge Tools MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});