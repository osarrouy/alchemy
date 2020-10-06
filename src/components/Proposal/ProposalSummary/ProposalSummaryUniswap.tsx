import { IProposalState } from "@daostack/arc.js";

import BN = require("bn.js");
import classNames from "classnames";
import { GenericSchemeInfo } from "genericSchemeRegistry";
import { formatTokens, targetedNetwork } from "lib/util";

import * as React from "react";
import * as css from "./ProposalSummary.scss";

const BigNum = require("bignumber.js");
const TOKENS = require("../../../../data/tokens.json");
const PCT_BASE = new BigNum("10000");

interface IProps {
  genericSchemeInfo: GenericSchemeInfo;
  detailView?: boolean;
  proposal: IProposalState;
  transactionModal?: boolean;
}

const toUniswapToken = (address: string) => {
  const NA = { symbol: "N/A", decimals: 18 };
  const tokens = { "0x0000000000000000000000000000000000000000": { symbol: "ETH", decimals: 18 }, ...TOKENS[targetedNetwork()].tokens};

  return tokens[address.toLowerCase()] || NA;
};

export default class ProposalSummaryNecDAOUniswap extends React.Component<IProps, null> {

  public render(): RenderOutput {
    const { proposal, detailView, genericSchemeInfo, transactionModal } = this.props;
    let decodedCallData: any;
    try {
      decodedCallData = genericSchemeInfo.decodeCallData(proposal.genericScheme.callData);
    } catch (err) {
      if (err.message.match(/no action matching/gi)) {
        return <div>Error: {err.message} </div>;
      } else {
        throw err;
      }
    }
    const action = decodedCallData.action;

    const proposalSummaryClass = classNames({
      [css.detailView]: detailView,
      [css.transactionModal]: transactionModal,
      [css.proposalSummary]: true,
      [css.withDetails]: true,
    });

    switch (action.id) {
      case "swap": {
        const from = toUniswapToken(decodedCallData.values[0]);
        const to = toUniswapToken(decodedCallData.values[1]);
        const amount = new BN(decodedCallData.values[2]);
        const expected = new BN(decodedCallData.values[3]);

        return (
          <div className={proposalSummaryClass}>
            <span className={css.summaryTitle}>
              {action.label} {from.symbol} for {to.symbol}
            </span>
            { detailView ?
              <div className={css.summaryDetails}>
                <div>
                  <p>
                    Executing this proposal will swap
                  </p>
                  <pre>
                    {formatTokens(amount, from.symbol, from.decimals)} to {to.symbol}.
                  </pre>
                  <p>
                    Transaction will revert if the swap returns less than
                  </p>
                  <pre>
                    {formatTokens(expected, to.symbol, to.decimals)}.
                  </pre>
                </div>
              </div>
              : ""
            }
          </div>
        );
      }
      case "pool": {
        const token1 = toUniswapToken(decodedCallData.values[0]);
        const token2 = toUniswapToken(decodedCallData.values[1]);
        const amount1 = new BN(decodedCallData.values[2]);
        const amount2 = new BN(decodedCallData.values[3]);
        const slippage = (new BigNum(decodedCallData.values[4])).div(PCT_BASE).toString();

        return (
          <div className={proposalSummaryClass}>
            <span className={css.summaryTitle}>
              {action.label} {token1.symbol } / {token2.symbol}
            </span>
            { detailView ?
              <div className={css.summaryDetails}>
                <div>
                  <p>
                    Executing this proposal will pool
                  </p>
                  <pre>
                    {formatTokens(amount1, token1.symbol, token1.decimals)} and {formatTokens(amount2, token2.symbol, token2.decimals)}.
                  </pre>
                  <p>
                    Transaction will revert if the price slippage exceeds
                  </p>
                  <pre>
                    { slippage } %.
                  </pre>
                </div>
              </div>
              : ""
            }
          </div>
        );
      }
      case "unpool": {
        const token1 = toUniswapToken(decodedCallData.values[0]);
        const token2 = toUniswapToken(decodedCallData.values[1]);
        const amount = new BN(decodedCallData.values[2]);
        const min1 = new BN(decodedCallData.values[3]);
        const min2 = new BN(decodedCallData.values[4]);

        return (
          <div className={proposalSummaryClass}>
            <span className={css.summaryTitle}>
              {action.label} {token1.symbol} / {token2.symbol}
            </span>
            { detailView ?
              <div className={css.summaryDetails}>
                <div>
                  <p>
                    Executing this proposal will unpool
                  </p>
                  <pre>
                    {formatTokens(amount, token1.symbol + " / " + token2.symbol)} liquidity tokens.
                  </pre>
                  <p>
                    Transaction will revert if unpooling returns less than
                  </p>
                  <pre>
                    {formatTokens(min1, token1.symbol, token1.decimals)} and {formatTokens(min2, token2.symbol, token2.decimals)}.
                  </pre>
                </div>
              </div>
              : ""
            }
          </div>
        );
      }
      default:
        return "";
    }
  }
}
