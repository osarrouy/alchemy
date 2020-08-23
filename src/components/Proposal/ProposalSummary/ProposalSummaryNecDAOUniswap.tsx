import { IProposalState } from "@daostack/arc.js";

import BN = require("bn.js");
import classNames from "classnames";
import { GenericSchemeInfo } from "genericSchemeRegistry";
import { formatTokens, targetedNetwork } from "lib/util";

import * as React from "react";
import * as css from "./ProposalSummary.scss";
const TOKENS = require("../../../../data/tokens.json");

interface IProps {
  genericSchemeInfo: GenericSchemeInfo;
  detailView?: boolean;
  proposal: IProposalState;
  transactionModal?: boolean;
}

const NA = { symbol: "N/A", decimals: 18 };

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
        const from = TOKENS[targetedNetwork()].tokens[decodedCallData.values[0].toLowerCase()] || NA;
        const to = TOKENS[targetedNetwork()].tokens[decodedCallData.values[1].toLowerCase()] || NA;
        const amount = decodedCallData.values[2];
        const expected = decodedCallData.values[3];

        return (
          <div className={proposalSummaryClass}>
            <span className={css.summaryTitle}>
              {action.label}
            </span>
            { detailView ?
              <div className={css.summaryDetails}>
                <div>
                  <p>
                    Executing this proposal will swap
                  </p>
                  <pre>
                    {formatTokens(new BN(amount), from.symbol, from.decimals)} to {to.symbol}.
                  </pre>
                  <p>
                    Transaction will revert if the swap returns less than
                  </p>
                  <pre>
                    {formatTokens(new BN(expected), to.symbol, to.decimals)}.
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
