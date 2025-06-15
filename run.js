import "dotenv/config";
import { ethers } from "ethers";
import { setTimeout as sleep } from 'timers/promises';

// Konfigurasi dari environment variable
const RPC_URL = process.env.RPC_URL;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS;
const USDT_ADDRESS = process.env.USDT_ADDRESS;
const ETH_ADDRESS = process.env.ETH_ADDRESS;
const BTC_ADDRESS = process.env.BTC_ADDRESS;

// Setup provider dan wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// Contract ABI
const ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "tokenIn", type: "address" },
          { internalType: "address", name: "tokenOut", type: "address" },
          { internalType: "uint24", name: "fee", type: "uint24" },
          { internalType: "address", name: "recipient", type: "address" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
          { internalType: "uint256", name: "amountIn", type: "uint256" },
          { internalType: "uint256", name: "amountOutMinimum", type: "uint256" },
          { internalType: "uint160", name: "sqrtPriceLimitX96", type: "uint160" },
        ],
        internalType: "struct ISwapRouter.ExactInputSingleParams",
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ internalType: "uint256", name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
];

const ERC20_ABI = [
  {
    constant: false,
    inputs: [
      { name: "_spender", type: "address" },
      { name: "_value", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    constant: true,
    inputs: [{ name: "_owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "balance", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    constant: true,
    inputs: [
      { name: "_owner", type: "address" },
      { name: "_spender", type: "address" }
    ],
    name: "allowance",
    outputs: [{ name: "remaining", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

// Konfigurasi trading pair
const PAIRS = [
  // ETH <> USDT
  {
    from: ETH_ADDRESS,
    to: USDT_ADDRESS,
    fromSymbol: 'ETH',
    toSymbol: 'USDT',
    decimals: 18,
    minBalance: 0.005
  },
  {
    from: USDT_ADDRESS,
    to: ETH_ADDRESS,
    fromSymbol: 'USDT',
    toSymbol: 'ETH',
    decimals: 6,
    minBalance: 10
  },
  // BTC <> USDT
  {
    from: BTC_ADDRESS,
    to: USDT_ADDRESS,
    fromSymbol: 'BTC',
    toSymbol: 'USDT',
    decimals: 8,
    minBalance: 0.0005
  },
  {
    from: USDT_ADDRESS,
    to: BTC_ADDRESS,
    fromSymbol: 'USDT',
    toSymbol: 'BTC',
    decimals: 6,
    minBalance: 10
  },
  // ETH <> BTC
  {
    from: ETH_ADDRESS,
    to: BTC_ADDRESS,
    fromSymbol: 'ETH',
    toSymbol: 'BTC',
    decimals: 18,
    minBalance: 0.005
  },
  {
    from: BTC_ADDRESS,
    to: ETH_ADDRESS,
    fromSymbol: 'BTC',
    toSymbol: 'ETH',
    decimals: 8,
    minBalance: 0.0005
  }
];

// Helper functions
async function getRandomPair() {
  return PAIRS[Math.floor(Math.random() * PAIRS.length)];
}

async function getBalance(tokenAddress) {
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
  return contract.balanceOf(wallet.address);
}

async function calculateSafeAmount(pair) {
  const balance = await getBalance(pair.from);
  const balanceInUnits = ethers.formatUnits(balance, pair.decimals);

  const available = Math.max(balanceInUnits - pair.minBalance, 0);
  if (available <= 0) return null;

  const percentage = (Math.random() * 0.4 + 0.3); // 30-70%
  const amount = available * percentage;

  return ethers.parseUnits(amount.toFixed(pair.decimals), pair.decimals);
}

async function approveIfNeeded(tokenAddress, symbol) {
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const allowance = await tokenContract.allowance(wallet.address, ROUTER_ADDRESS);

  if (allowance === 0n) {
    console.log(`Mengapprove unlimited ${symbol}...`);
    const tx = await tokenContract.approve(ROUTER_ADDRESS, ethers.MaxUint256);
    await tx.wait();
  }
}

async function executeSwap(pair, amount) {
  const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);

  const swapParams = {
    tokenIn: pair.from,
    tokenOut: pair.to,
    fee: 3000,
    recipient: wallet.address,
    deadline: Math.floor(Date.now()/1000) + 300,
    amountIn: amount,
    amountOutMinimum: 0,
    sqrtPriceLimitX96: 0
  };

  console.log(`Swap ${ethers.formatUnits(amount, pair.decimals)} ${pair.fromSymbol} ➔ ${pair.toSymbol}`);
  const tx = await router.exactInputSingle(swapParams, {
    gasLimit: 150000
  });

  console.log(`Tx dikirim: ${tx.hash}`);
  await tx.wait();
  console.log('Swap berhasil!\n');
}

async function humanDelay() {
  const delay = Math.floor(Math.random() * (90000 - 30000) + 30000);
  console.log(`Menunggu ${Math.round(delay/1000)} detik...\n`);
  await sleep(delay);
}

async function main() {
  console.log("Memulai program auto swap...\n");

  while(true) {
    try {
      const pair = await getRandomPair();
      const amount = await calculateSafeAmount(pair);

      if (!amount) {
        console.log(`Saldo ${pair.fromSymbol} tidak mencukupi, mencari pair lain...`);
        await humanDelay();
        continue;
      }

      await approveIfNeeded(pair.from, pair.fromSymbol);
      await executeSwap(pair, amount);
      await humanDelay();

    } catch (error) {
      console.error(`Error: ${error.message}`);
      console.log("Mencoba lagi setelah delay...\n");
      await humanDelay();
    }
  }
}

main();
