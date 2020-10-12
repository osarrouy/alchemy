import { IProposalState } from "@daostack/arc.js";
import classNames from "classnames";
import { GenericSchemeInfo } from "genericSchemeRegistry";
import { formatTokens } from "lib/util";

import * as React from "react";
import * as css from "./ProposalSummary.scss";

interface IProps {
  genericSchemeInfo: GenericSchemeInfo;
  detailView?: boolean;
  proposal: IProposalState;
  transactionModal?: boolean;
}

export default class ProposalSummaryNecBurn extends React.Component<IProps, null> {

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
      case "fund": {
        return (
          <div className={proposalSummaryClass}>
            <span className={css.summaryTitle}>
            Fund the necBurn auction process with {formatTokens(proposal.genericScheme.value)} ETH
            </span>
            { detailView ?
              <div className={css.summaryDetails}>
                <div>
                  <p>
                    Executing this proposal will fund the necBurn auction process with
                  </p>
                  <pre>
                    {formatTokens(proposal.genericScheme.value)} ETH.
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
