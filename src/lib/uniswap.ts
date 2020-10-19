import { ChainId, Token, WETH, Fetcher, Route, Trade, TokenAmount, TradeType } from "@uniswap/sdk";
import { getArc } from "arc";
import BigNum from "bignumber.js";
import { ethers } from "ethers";
import { ActionField } from "genericSchemeRegistry";
import { targetedNetwork, toBaseUnit } from "lib/util";

const TOKENS = require("../../data/tokens.json");
const ERC20 = require("../../data/ERC20.json");

const uniswap = {
  network: () => {
    switch (targetedNetwork()) {
      case "rinkeby":
        return ChainId.RINKEBY;
      default:
        return ChainId.MAINNET;
    }
  },
  isField: (ctx: any, field: ActionField, action: string, name: string): boolean => {
    if (ctx.props.genericSchemeInfo.specs.name === "Uniswap" && ctx.state.currentAction.id === action && field.name === name) {
      return true;
    }
    return false;
  },
  tokens: () => {
    return { "0x0000000000000000000000000000000000000000": { symbol: "ETH", decimals: 18 }, ...TOKENS[targetedNetwork()].tokens};
  },
  toToken: (address: string) => {
    const NA = { symbol: "N/A", decimals: 18 };

    return uniswap.tokens()[address.toLowerCase()] || NA;
  },
  toBaseUnit: (token: string, amount: string): string => {
    return toBaseUnit(amount.toString(), uniswap.toToken(token).decimals).toString();
  },
  computePercentage: (value: string, percentage: string) => {
    const _value = new BigNum(value);
    const _percentage = new BigNum(percentage);
    const _hundred = new BigNum("100");
    return _percentage.times(_value).div(_hundred).toFixed(0);
  },
  computeExpectedSwapReturn: (ctx: any, from: string, amount: string) => {
    const _amount = new BigNum(uniswap.toBaseUnit(from, amount));
    const _price = new BigNum(ctx.state.executionPrice);
    const _return = _amount.times(_price);
    return _return.toFixed(0);
  },
  computeMinimumSwapReturn: (ctx: any, from: string, amount: string, slippage: string) => {
    const _expected = new BigNum(uniswap.computeExpectedSwapReturn(ctx, from, amount));
    const _slippage = uniswap.computePercentage(_expected.toString(), slippage);
    return _expected.minus(_slippage).toFixed(0);
  },
  computeMinimumUnpoolReturn: (max: string, percentage: string, slippage: string) => {
    const _hundred = new BigNum("100");
    const _slippage = new BigNum(slippage);
    const _expected = new BigNum(uniswap.computePercentage(max, percentage));
    return _expected.times(_hundred.minus(_slippage)).div(_hundred).toFixed(0);
  },
  fetchData: async (ctx: any, action: string, values: any): Promise<any> => {
    try {
      const arc = getArc();
      const provider = new ethers.providers.Web3Provider(arc.web3.currentProvider);
      const network = uniswap.network();

      if (action === "pool" && values["_token1"] !== "" && values["_token2"] !== "") {
        try {
          const _token1 = values["_token1"] !== "0x0000000000000000000000000000000000000000" ? values["_token1"] : WETH[network].address;
          const _token2 = values["_token2"] !== "0x0000000000000000000000000000000000000000" ? values["_token2"] : WETH[network].address;

          const token1 = new Token(network, _token1, uniswap.toToken(_token1).decimals);
          const token2 = new Token(network, _token2, uniswap.toToken(_token2).decimals);

          const pair = await Fetcher.fetchPairData(token1, token2, provider);
          const route = new Route([pair], token1);

          ctx.setState({ price: route.midPrice.toSignificant(6), invertedPrice: route.midPrice.invert().toSignificant(6) });
        } catch (e) {
          console.warn("Failed to fetch Uniswap data: " + e);
          ctx.setState({ price: "0", invertedPrice: "0" });
        }
      } else if (action === "swap" && values["_from"] !== "" && values["_to"] !== "") {
        try {
          const from = values["_from"] !== "0x0000000000000000000000000000000000000000" ? values["_from"] : WETH[network].address;
          const to = values["_to"] !== "0x0000000000000000000000000000000000000000" ? values["_to"] : WETH[network].address;

          const token1 = new Token(network, from, uniswap.toToken(from).decimals);
          const token2 = new Token(network, to, uniswap.toToken(to).decimals);

          const pair = await Fetcher.fetchPairData(token1, token2, provider);
          const route = new Route([pair], token1);
          const trade = new Trade(route, new TokenAmount(token1, uniswap.toBaseUnit(token1.address, values["_amount"])), TradeType.EXACT_INPUT);

          ctx.setState({executionPrice: trade.executionPrice.toSignificant(6)});
        } catch (e) {
          console.warn("Failed to fetch Uniswap data: " + e);
          ctx.setState({ executionPrice: "0" });
        }
      } else if (action === "unpool" && values["_token1"] !== "" && values["_token2"] !== "") {
        try {
          const _token1 = values["_token1"] !== "0x0000000000000000000000000000000000000000" ? values["_token1"] : WETH[network].address;
          const _token2 = values["_token2"] !== "0x0000000000000000000000000000000000000000" ? values["_token2"] : WETH[network].address;

          const token1 = new Token(network, _token1, uniswap.toToken(_token1).decimals);
          const token2 = new Token(network, _token2, uniswap.toToken(_token2).decimals);

          const pair = await Fetcher.fetchPairData(token1, token2, provider);
          const liquidity = new arc.web3.eth.Contract(ERC20, pair.liquidityToken.address);
          const totalSupply = await liquidity.methods.totalSupply().call();
          const balance = await liquidity.methods.balanceOf(ctx.props.daoAvatarAddress).call();

          const liquidityReturn1 = await pair.getLiquidityValue(token1, new TokenAmount(pair.liquidityToken, totalSupply), new TokenAmount(pair.liquidityToken, balance));
          const liquidityReturn2 = await pair.getLiquidityValue(token2, new TokenAmount(pair.liquidityToken, totalSupply), new TokenAmount(pair.liquidityToken, balance));

          ctx.setState({ liquidity: balance, liquidityReturn1: liquidityReturn1.raw.toString(), liquidityReturn2: liquidityReturn2.raw.toString() });
        }
        catch (e) {
          console.warn("Failed to fetch Uniswap data: " + e);
          ctx.setState({ liquidity: "0", liquidityReturn1: "0", liquidityReturn2: "0" });
        }
      }
    } catch (e) {
      console.warn("Failed to fetch Uniswap data: " + e);
    }
  },
};

export default uniswap;
