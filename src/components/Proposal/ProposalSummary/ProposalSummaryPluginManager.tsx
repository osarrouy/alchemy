import { IDAOState, IPluginManagerProposalState, NULL_ADDRESS } from "@daostack/arc.js";
import classNames from "classnames";
import { copyToClipboard, getNetworkName, linkToEtherScan } from "lib/util";
import { pluginNameAndAddress, decodePluginToRegisterData } from "lib/pluginUtils";
import * as React from "react";
import { NotificationStatus, showNotification } from "reducers/notifications";
import { IProfileState } from "reducers/profilesReducer";
import { connect } from "react-redux";
import * as css from "./ProposalSummary.scss";

interface IDispatchProps {
  showNotification: typeof showNotification;
}

interface IExternalProps {
  beneficiaryProfile?: IProfileState;
  detailView?: boolean;
  daoState: IDAOState;
  proposalState: IPluginManagerProposalState;
  transactionModal?: boolean;
}

type IProps = IExternalProps & IDispatchProps;

interface IState {
  network: string;
}

const mapDispatchToProps = {
  showNotification,
};

class ProposalSummary extends React.Component<IProps, IState> {

  constructor(props: IProps) {
    super(props);
    this.state = {
      network: "",
    };
  }

  private copyToClipboardHandler = (str: string) => (_event: any) => {
    copyToClipboard(str);
    this.props.showNotification(NotificationStatus.Success, "Copied to clipboard!");
  };

  public async componentDidMount (): Promise<void> {
    this.setState({
      network: (await getNetworkName()).toLowerCase(),
    });
  }

  public render(): RenderOutput {
    const { proposalState, detailView, transactionModal } = this.props;
    const decodedData = decodePluginToRegisterData(proposalState.pluginToRegisterName, proposalState.pluginToRegisterData);
    const pluginName = decodedData.pluginName;

    const votingParams = decodedData.votingParams.map((param: string, index: number) => {
      const params = ["Boosted Vote Period Limit:", "DAO Bounty Constant:", "Proposal Reputation Reward:", "Minimum DAO Bounty:", "Pre-Boosted Vote Period Limit:", "Queued Vote Period Limit:", "Queued Vote Required:", "Quiet Ending Period:", "Threshold Constant:", "DAO Bounty Const:", "Activation Time:"];
      return (
        <tr key={index}>
          <th>{params[index]}</th>
          <td>{param}</td>
        </tr>
      );
    });

    const proposalSummaryClass = classNames({
      [css.detailView]: detailView,
      [css.transactionModal]: transactionModal,
      [css.proposalSummary]: true,
      [css.withDetails]: true,
    });

    const permissions = parseInt(proposalState.pluginToRegisterPermission, 16);
    const isReplace = proposalState.pluginToRemove !== NULL_ADDRESS && pluginName ? true : false;

    return (
      <div className={proposalSummaryClass}>
        { proposalState.pluginToRemove !== NULL_ADDRESS && !isReplace ?
          <div>
            <span className={css.summaryTitle}>
              <img src="/assets/images/Icon/delete.svg"/>&nbsp;
                  Remove Plugin&nbsp;
              <a href={linkToEtherScan(proposalState.pluginToRemove)} target="_blank" rel="noopener noreferrer">{pluginNameAndAddress(proposalState.pluginToRemove)}</a>
            </span>
            { detailView ?
              <div className={css.summaryDetails}>
                <table><tbody>
                  <tr>
                    <th>
                          Address:
                      <a href={linkToEtherScan(proposalState.pluginToRemove)} target="_blank" rel="noopener noreferrer">
                        <img src="/assets/images/Icon/Link-blue.svg"/>
                      </a>
                    </th>
                    <td>{proposalState.pluginToRemove}</td>
                  </tr>
                </tbody></table>
              </div>
              : ""
            }
          </div>
          : pluginName ?
            <div>
              <span className={css.summaryTitle}>
                <b className={css.pluginRegisterIcon}>{isReplace ? <img src="/assets/images/Icon/edit-sm.svg"/> : "+"}</b>&nbsp;
                {isReplace ? "Replace" : "Add"} Plugin&nbsp;
                {isReplace ? pluginNameAndAddress(proposalState.pluginToRemove) : pluginName}
                {isReplace ? " With " + pluginName : ""}
              </span>
              { detailView ?
                <div className={css.summaryDetails}>
                  <table>
                    <tbody>
                      {isReplace ?
                        <tr>
                          <th>
                                Address:
                            <a href={linkToEtherScan(proposalState.pluginToRemove)} target="_blank" rel="noopener noreferrer">
                              <img src="/assets/images/Icon/Link-blue.svg"/>
                            </a>
                          </th>
                          <td>{proposalState.pluginToRemove}</td>
                        </tr>
                        : <></>}
                      <tr>
                        <th>Name:</th>
                        <td>{pluginName}</td>
                      </tr>
                      <tr>
                        <th>Version:</th>
                        <td>{proposalState.pluginToRegisterPackageVersion.join(".")}</td>
                      </tr>
                      <tr>
                        <th>Init Calldata:</th>
                        <td>
                          {proposalState.pluginToRegisterData.substr(0, 10)}...
                          <img className={css.copyButton} src="/assets/images/Icon/Copy-blue.svg" onClick={this.copyToClipboardHandler(proposalState.pluginToRegisterData)} />
                        </td>
                      </tr>
                      {votingParams}
                      {decodedData.pluginType === "GenericScheme" &&
                        <tr>
                          <th>Contract to Call:</th>
                          <td>{decodedData.contractToCall}</td>
                        </tr>
                      }
                      <tr>
                        <th>Permissions:</th>
                        <td>
                          {
                            // eslint-disable-next-line no-bitwise
                            permissions & 2 ? <div>Register other Plugins</div> : ""
                          }
                          {
                            // eslint-disable-next-line no-bitwise
                            permissions & 4 ? <div>Change constraints</div> : ""
                          }
                          {
                            // eslint-disable-next-line no-bitwise
                            permissions & 8 ? <div>Upgrade the controller</div> : ""
                          }
                          {
                            // eslint-disable-next-line no-bitwise
                            permissions & 16 ? <div>Call genericCall on behalf of</div> : ""
                          }
                          {
                            <div>Mint or burn reputation</div>
                          }
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                : ""
              }
            </div>
            :
            ""
        }
      </div>
    );
  }
}

export default connect(null, mapDispatchToProps)(ProposalSummary);
