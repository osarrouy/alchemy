/* eslint-disable react/jsx-no-bind */

import * as React from "react";
import { connect } from "react-redux";
import { IProposalType, ISchemeState } from "@daostack/arc.js";
import { enableWalletProvider, getArc } from "arc";

import { ErrorMessage, Field, FieldArray, Form, Formik, FormikErrors, FormikProps, FormikTouched } from "formik";
import * as classNames from "classnames";
import Interweave from "interweave";

import { Action, ActionField, GenericSchemeInfo } from "genericSchemeRegistry";

import { IRootState } from "reducers";
import { NotificationStatus, showNotification } from "reducers/notifications";
import * as arcActions from "actions/arcActions";

import Analytics from "lib/analytics";
import { formatTokens, isValidUrl } from "lib/util";
import uniswap from "lib/uniswap";
import { exportUrl, importUrlValues } from "lib/proposalUtils";

import TagsSelector from "components/Proposal/Create/SchemeForms/TagsSelector";
import TrainingTooltip from "components/Shared/TrainingTooltip";
import * as css from "../CreateProposal.scss";
import MarkdownField from "./MarkdownField";
import HelpButton from "components/Shared/HelpButton";

const BN = require("bn.js");
const BigNum = require("bignumber.js");

interface IExternalProps {
  daoAvatarAddress: string;
  genericSchemeInfo: GenericSchemeInfo;
  handleClose: () => any;
  scheme: ISchemeState;
}

const mapStateToProps = (state: IRootState, ownProps: IExternalProps) => {
  return ownProps;
};

interface IDispatchProps {
  createProposal: typeof arcActions.createProposal;
  showNotification: typeof showNotification;
}

const mapDispatchToProps = {
  createProposal: arcActions.createProposal,
  showNotification,
};

type IProps = IExternalProps & IDispatchProps;

interface IFormValues {
  description: string;
  title: string;
  url: string;
  [key: string]: any;
}

interface IState {
  actions: Action[];
  currentAction: Action;
  tags: Array<string>;
  price: string;
  invertedPrice: string;
  executionPrice: string;
  liquidity: string;
  liquidityReturn1: string;
  liquidityReturn2: string;
}

interface IToken {
  symbol: string;
}

class CreateKnownSchemeProposal extends React.Component<IProps, IState> {

  initialFormValues: IFormValues;

  constructor(props: IProps) {
    super(props);

    if (!props.genericSchemeInfo) {
      throw Error("GenericSchemeInfo should be provided");
    }
    this.setInititialFormValues();
    const actions = props.genericSchemeInfo.actions();
    const initialActionId = this.initialFormValues.currentActionId;
    this.state = {
      actions: props.genericSchemeInfo.actions(),
      currentAction: initialActionId ? actions.find(action => action.id === initialActionId) : actions[0],
      tags: this.initialFormValues.tags,
      price: "0",
      invertedPrice: "0",
      executionPrice: "0",
      liquidity: "0",
      liquidityReturn1: "0",
      liquidityReturn2: "0",
    };
  }

  private async getBountyEth(values: IFormValues): Promise<any> {
    const currentAction = this.state.currentAction;
    let ethToSend = new BN(0);

    // Search for payable feilds in Standard Bounties, add to send as ETH
    for (const field of currentAction.getFields()) {
      if (["_depositAmount", "_amount"].includes(field.name)) {
        ethToSend = ethToSend.add(new BN(values[field.name]));
      }
    }
    return ethToSend;
  }

  private getNecBurnEth(values: IFormValues): any {
    const arc = getArc();
    const web3 = arc.web3;

    return web3.utils.toBN(web3.utils.toWei(values["_amount"].toString()));
  }

  private isNecBurnField = (field: ActionField, action: string, name: string): boolean => {
    if (this.props.genericSchemeInfo.specs.name === "necBurn" && this.state.currentAction.id === action && field.name === name ) {
      return true;
    }
    return false;
  }

  private uniswapTokensField = (name: string, touched: FormikTouched<IFormValues>, errors: FormikErrors<IFormValues>, action: string) => {
    return (
      <Field id={name} name={name}>
        {({ form }: any ) => (
          <div>
            <select id={name} name={name} className={touched[name] && errors[name] ? css.error : null} onChange={(e) => {
              form.handleChange(e);
              const values = form.values;
              values[e.target.id] = (document.getElementById(e.target.id) as HTMLInputElement).value;
              uniswap.fetchData(this, action, values);
            }}>
              <option value="" disabled selected>Choose ETH or an ERC20 token</option>
              {
                Object.entries(uniswap.tokens()).map(token => {
                  return (<option key={token[0] as string} value={token[0] as string}>{(token[1] as IToken).symbol}</option>);
                })
              }
            </select>
          </div>
        )}
      </Field>
    );
  }

  private handleSubmit = async (values: IFormValues, { setSubmitting }: any ): Promise<void> => {
    if (!await enableWalletProvider({ showNotification: this.props.showNotification })) { return; }

    const currentAction = this.state.currentAction;
    const callValues = [];

    for (const field of currentAction.getFields()) {
      if (uniswap.isField(this, field, "swap", "_amount")) {
        const callValue = field.callValue(uniswap.toBaseUnit(values["_from"], values["_amount"]));
        callValues.push(callValue);
      } else if (uniswap.isField(this, field, "swap", "_expected")) {
        const callValue = field.callValue(uniswap.toBaseUnit(values["_to"], uniswap.computeMinimumSwapReturn(this, values["_from"], values["_to"], values["_amount"], values["_expected"])));
        callValues.push(callValue);
      } else if (uniswap.isField(this, field, "pool", "_amount1")) {
        const callValue = field.callValue(uniswap.toBaseUnit(values["_token1"], values["_amount1"]));
        callValues.push(callValue);
      } else if (uniswap.isField(this, field, "pool", "_amount2")) {
        const amount = ((new BigNum(values["_amount1"])).times(new BigNum(this.state.price))).toString();
        const callValue = field.callValue(uniswap.toBaseUnit(values["_token2"], amount));
        callValues.push(callValue);
      } else if (uniswap.isField(this, field, "pool", "_slippage")) {
        const callValue = field.callValue((new BigNum(values["_slippage"])).times(new BigNum("10000")).toString());
        callValues.push(callValue);
      } else if (uniswap.isField(this, field, "unpool", "_amount")) {
        const callValue = field.callValue(uniswap.computePercentage(this.state.liquidity, values["_amount"]));
        callValues.push(callValue);
      } else if (uniswap.isField(this, field, "unpool", "_amount1")) {
        const callValue = field.callValue(uniswap.computeMinimumUnpoolReturn(this.state.liquidityReturn1, values["_amount"], values["_amount1"]));
        callValues.push(callValue);
      } else if (uniswap.isField(this, field, "unpool", "_amount2")) {
        const callValue = field.callValue(uniswap.computeMinimumUnpoolReturn(this.state.liquidityReturn2, values["_amount"], values["_amount1"]));
        callValues.push(callValue);
      } else if (this.isNecBurnField(field, "fund", "_amount")) {
        // do nothing
      }
      else {
        const callValue = field.callValue(values[field.name]);
        values[field.name] = callValue;
        callValues.push(callValue);
      }
    }

    let callData = "";
    try {
      callData = this.props.genericSchemeInfo.encodeABI(currentAction, callValues);
    } catch (err) {
      showNotification(NotificationStatus.Failure, err.message);
      setSubmitting(false);
      return;
    }
    setSubmitting(false);

    let ethValue = new BN(0);

    if (this.props.genericSchemeInfo.specs.name === "Standard Bounties") {
      const calcBountEth = await this.getBountyEth(values);
      ethValue = ethValue.add(calcBountEth);
    }

    if (this.props.genericSchemeInfo.specs.name === "necBurn") {
      ethValue = ethValue.add(this.getNecBurnEth(values));
    }

    const proposalValues = {
      ...values,
      callData,
      dao: this.props.daoAvatarAddress,
      scheme: this.props.scheme.address,
      tags: this.state.tags,
      type: IProposalType.GenericScheme,
      value: ethValue.toString(), // amount of eth to send with the call
    };

    try {
      await this.props.createProposal(proposalValues);
    } catch (err) {
      showNotification(NotificationStatus.Failure, err.message);
      throw err;
    }

    Analytics.track("Submit Proposal", {
      "DAO Address": this.props.daoAvatarAddress,
      "Proposal Title": values.title,
      "Scheme Address": this.props.scheme.address,
      "Scheme Name": this.props.scheme.name,
    });

    this.props.handleClose();
  }

  public handleTabClick = (tab: string) => (_e: any) => {
    this.setState({ currentAction: this.props.genericSchemeInfo.action(tab) });
  }

  public renderField(field: ActionField, values: IFormValues, touched: FormikTouched<IFormValues>, errors: FormikErrors<IFormValues>) {
    const type = "string";

    switch (field.type) {
      case "bool":
        return <div className={css.radioButtons}>
          <Field
            id={field.name + "_true"}
            name={field.name}
            checked={parseInt(values[field.name], 10) === 1}
            type="radio"
            value={1}
          />
          <label htmlFor={field.name + "_true"}>
            {field.labelTrue}
          </label>

          <Field
            id={field.name + "_false"}
            name={field.name}
            checked={parseInt(values[field.name], 10) === 0}
            type="radio"
            value={0}
          />
          <label htmlFor={field.name + "_false"}>
            {field.labelFalse}
          </label>
        </div>;
      default:
        if (this.isNecBurnField(field, "fund", "_amount")) {
          return (
            <Field id={field.name} name={field.name}>
              {({ field }: any ) => (
                <input
                  {...field}
                  id={field.name}
                  data-test-id={field.name}
                  name={field.name}
                  type="number"
                  placeholder={field.placeholder}
                  className={touched[field.name] && errors[field.name] ? css.error : null}
                >
                </input>
              )}
            </Field>
          );
        }
        if (uniswap.isField(this, field, "swap", "_from")) {
          return this.uniswapTokensField("_from", touched, errors, "swap");
        }
        if (uniswap.isField(this, field, "swap", "_to")) {
          return this.uniswapTokensField("_to", touched, errors, "swap");
        }
        if (uniswap.isField(this, field, "swap", "_amount")) {
          return (
            <Field id={field.name} name={field.name}>
              {({ field, form }: any ) => (
                <input
                  {...field}
                  id={field.name}
                  data-test-id={field.name}
                  name={field.name}
                  type="number"
                  placeholder={field.placeholder}
                  className={touched[field.name] && errors[field.name] ? css.error : null}
                  onChange={(e) => {
                    form.handleChange(e);
                    const values = form.values;
                    values["_amount"] = e.target.value;
                    uniswap.fetchData(this, "swap", values);
                  }}>
                </input>
              )}
            </Field>
          );
        }
        if (uniswap.isField(this, field, "swap", "_expected")) {
          return (
            <div>
              <Field
                id={field.name}
                data-test-id={field.name}
                placeholder={field.placeholder}
                name={field.name}
                type="number"
                className={touched[field.name] && errors[field.name] ? css.error : null}
              />
              {values["_from"] !== "" && values["_to"] !== "" &&
                <div className={css.uniswapInformations}>
                  <b>Price</b>
                  <pre>
                    {this.state.executionPrice} {uniswap.toToken(values["_to"]).symbol} / {uniswap.toToken(values["_from"]).symbol}
                  </pre>
                  <b>Expected return</b>
                  <pre>
                    {uniswap.computeExpectedSwapReturn(this, values["_from"], values["_to"], values["_amount"])} {uniswap.toToken(values["_to"]).symbol}
                  </pre>
                  <b>Minimum return (reverts otherwise)</b>
                  <pre>
                    {uniswap.computeMinimumSwapReturn(this, values["_from"], values["_to"], values["_amount"], values["_expected"])} {uniswap.toToken(values["_to"]).symbol}
                  </pre>
                </div>
              }
              {!(values["_from"] !== "" && values["_to"] !== "") &&
                <div className={css.uniswapInformations}>
                  <b>Price</b>
                  <pre>
                    Select a token pair first
                  </pre>
                  <b>Expected return</b>
                  <pre>
                    Select a token pair first
                  </pre>
                  <b>Minimum return (reverts otherwise)</b>
                  <pre>
                    Select a token pair first
                  </pre>
                </div>
              }
            </div>
          );
        }
        if (uniswap.isField(this, field, "pool", "_token1")) {
          return this.uniswapTokensField("_token1", touched, errors, "pool");
        }
        if (uniswap.isField(this, field, "pool", "_token2")) {
          return this.uniswapTokensField("_token2", touched, errors, "pool");
        }
        if (uniswap.isField(this, field, "pool", "_amount1")) {
          return (
            <Field id={field.name} name={field.name}>
              {({ field, form }: any ) => (
                <input
                  {...field}
                  id={field.name}
                  data-test-id={field.name}
                  name={field.name}
                  type="number"
                  placeholder={field.placeholder}
                  className={touched[field.name] && errors[field.name] ? css.error : null}
                  onChange={(e) => {
                    form.handleChange(e);
                    const values = form.values;
                    values["_amount1"] = e.target.value;
                    uniswap.fetchData(this, "pool", values);
                  }}>
                </input>
              )}
            </Field>
          );
        }
        if (uniswap.isField(this, field, "pool", "_amount2")) {
          return <Field
            id={field.name}
            data-test-id={field.name}
            placeholder={field.placeholder}
            name={field.name}
            type={type}
            className={css.hidden}
          />;
        }
        if (uniswap.isField(this, field, "pool", "_slippage")) {
          const tokens = uniswap.tokens();
          return (
            <div>
              <Field
                id={field.name}
                data-test-id={field.name}
                placeholder={field.placeholder}
                name={field.name}
                type="number"
                className={touched[field.name] && errors[field.name] ? css.error : null}
              />
              {values["_token1"] !== "" && values["_token2"] !== "" &&
                <div className={css.uniswapInformations}>
                  <b>Pool</b>
                  <pre>
                    {values["_amount1"]} {tokens[values["_token1"]].symbol}
                  </pre>
                  <pre>
                    {values["_amount1"] * Number(this.state.price)} {tokens[values["_token2"]].symbol}
                  </pre>
                  <b>Price</b>
                  <pre>
                    {this.state.price} {tokens[values["_token2"]].symbol} / {tokens[values["_token1"]].symbol}
                  </pre>
                  <pre>
                    {this.state.invertedPrice} {tokens[values["_token1"]].symbol} / {tokens[values["_token2"]].symbol}
                  </pre>
                </div>
              }
              {!(values["_token1"] !== "" && values["_token2"] !== "") &&
                <div className={css.uniswapInformations}>
                  <b>Pool</b>
                  <pre>
                    Select a token pair first
                  </pre>
                  <b>Price</b>
                  <pre>
                    Select a token pair first
                  </pre>
                </div>
              }
            </div>
          );
        }
        if (uniswap.isField(this, field, "unpool", "_token1")) {
          return this.uniswapTokensField("_token1", touched, errors, "unpool");
        }
        if (uniswap.isField(this, field, "unpool", "_token2")) {
          return this.uniswapTokensField("_token2", touched, errors, "unpool");
        }
        if (uniswap.isField(this, field, "unpool", "_amount1")) {
          const tokens = uniswap.tokens();
          return (
            <div>
              <Field id={field.name} name={field.name}>
                {({ field, form }: any ) => (
                  <input
                    {...field}
                    id={field.name}
                    data-test-id={field.name}
                    name={field.name}
                    type="number"
                    placeholder={field.placeholder}
                    className={touched[field.name] && errors[field.name] ? css.error : null}
                    onChange={(e) => {
                      form.handleChange(e);
                      const values = form.values;
                      values["_amount1"] = e.target.value;
                      uniswap.fetchData(this, "unpool", values);
                    }}>
                  </input>
                )}
              </Field>
              {values["_token1"] !== "" && values["_token2"] !== "" &&
                <div className={css.uniswapInformations}>
                  <b>Unpool</b>
                  <pre>
                    {formatTokens(new BN(uniswap.computePercentage(this.state.liquidity, values["_amount"])), tokens[values["_token1"]].symbol + " / " + tokens[values["_token2"]].symbol)} liquidity tokens
                  </pre>
                  <b>Expected returns</b>
                  <pre>
                    {formatTokens(new BN(uniswap.computePercentage(this.state.liquidityReturn1, values["_amount"])), tokens[values["_token1"]].symbol, tokens[values["_token1"]].decimals)}
                  </pre>
                  <pre>
                    {formatTokens(new BN(uniswap.computePercentage(this.state.liquidityReturn2, values["_amount"])), tokens[values["_token2"]].symbol, tokens[values["_token2"]].decimals)}
                  </pre>
                </div>
              }
              {!(values["_token1"] !== "" && values["_token2"] !== "") &&
                <div className={css.uniswapInformations}>
                  <b>Unpool</b>
                  <pre>
                    Select a token pair first
                  </pre>
                  <b>Expected returns</b>
                  <pre>
                    Select a token pair first
                  </pre>
                </div>
              }
              {values["_token1"] !== "" && values["_token2"] !== "" &&
                <div className={css.uniswapInformations}>
                  <b>Current position</b>
                  <pre>{formatTokens(new BN(this.state.liquidity), tokens[values["_token1"]].symbol + " / " + tokens[values["_token2"]].symbol)} liquidity tokens</pre>
                  <pre>{formatTokens(new BN(this.state.liquidityReturn1), tokens[values["_token1"]].symbol, tokens[values["_token1"]].decimals)}</pre>
                  <pre>{formatTokens(new BN(this.state.liquidityReturn2), tokens[values["_token2"]].symbol, tokens[values["_token2"]].decimals)}</pre>
                </div>
              }
              {!(values["_token1"] !== "" && values["_token2"] !== "") &&
                <div className={css.uniswapInformations}>
                  <b>Current position</b>
                  <pre>Select a token pair first</pre>
                </div>
              }
            </div>
          );
        }
        if (uniswap.isField(this, field, "unpool", "_amount2")) {
          return <Field
            id={field.name}
            data-test-id={field.name}
            placeholder={field.placeholder}
            name={field.name}
            type={type}
            className={css.hidden}
          />;
        }
        if (field.type.includes("[]")) {
          // eslint-disable-next-line react/jsx-no-bind
          return <FieldArray name={field.name} render={(arrayHelpers) => (
            <div className={css.arrayFieldContainer}>
              {values[field.name] && values[field.name].length > 0 ? (
                values[field.name].map((value: any, index: number) => (
                  <div key={field.name + "_" + index} className={css.arrayField}>
                    {this.renderField(
                      new ActionField({name: `${field.name}.${index}`, type: field.type.slice(0, -2), label: "", placeholder: field.placeholder}),
                      values,
                      touched,
                      errors
                    )}
                    <button
                      className={css.removeItemButton}
                      type="button"
                      onClick={() => arrayHelpers.remove(index)} // remove an item from the list
                    >
                      -
                    </button>
                  </div>
                ))
              ) : ""}
              <button className={css.addItemButton} data-test-id={field.name + ".add"} type="button" onClick={() => arrayHelpers.push("")}>
                Add {field.label}
              </button>
            </div>
          )}
          />;
        }
        break;
    }

    return <Field
      id={field.name}
      data-test-id={field.name}
      placeholder={field.placeholder}
      name={field.name}
      type={type}
      className={touched[field.name] && errors[field.name] ? css.error : null}
    />;
  }

  private onTagsChange = (tags: any[]): void => {
    this.setState({tags});
  }

  private setInititialFormValues(){
    this.initialFormValues = {
      description: "",
      title: "",
      url: "",
      currentActionId: "",
      tags: [],
    };
    const actions = this.props.genericSchemeInfo.actions();
    const daoAvatarAddress = this.props.daoAvatarAddress;
    actions.forEach((action) => action.getFields().forEach((field: ActionField) => {
      if (typeof(field.defaultValue) !== "undefined") {
        if (field.defaultValue === "_avatar") {
          this.initialFormValues[field.name] = daoAvatarAddress;
        } else {
          this.initialFormValues[field.name] = field.defaultValue;
        }
      } else {
        switch (field.type) {
          case "uint64":
          case "uint256":
          case "bytes32":
          case "bytes":
          case "address":
          case "string":
            this.initialFormValues[field.name] = "";
            break;
          case "bool":
            this.initialFormValues[field.name] = 0;
            break;
          case "address[]":
            this.initialFormValues[field.name] = [""];
            break;
        }
      }
    }));
    this.initialFormValues = importUrlValues<IFormValues>(this.initialFormValues);
  }

  public exportFormValues(values: IFormValues) {
    values = {
      ...values,
      currentActionId: this.state.currentAction.id,
      ...this.state,
    };
    exportUrl(values);
    this.props.showNotification(NotificationStatus.Success, "Exportable url is now in clipboard :)");
  }

  public render(): RenderOutput {
    const { handleClose } = this.props;
    const arc = getArc();

    const actions = this.state.actions;
    const currentAction = this.state.currentAction;
    const fnDescription = () => (<span>Short description of the proposal.<ul><li>What are you proposing to do?</li><li>Why is it important?</li><li>How much will it cost the DAO?</li><li>When do you plan to deliver the work?</li></ul></span>);

    return (
      <div className={css.containerWithSidebar}>
        <div className={css.sidebar}>
          { actions.map((action) =>
            <button
              data-test-id={"action-tab-" + action.id}
              key={action.id}
              className={classNames({
                [css.tab]: true,
                [css.selected]: currentAction.id === action.id,
              })}
              onClick={this.handleTabClick(action.id)}>
              <span></span>
              { action.label }
            </button>
          )}
        </div>

        <div className={css.contentWrapper}>
          <Formik
            initialValues={this.initialFormValues}
            // eslint-disable-next-line react/jsx-no-bind
            validate={(values: IFormValues): void => {
              const errors: any = {};

              const valueIsRequired = (name: string) => {
                const value = values[name];
                if (value === 0) {
                  return;
                }
                if (!value || (Array.isArray(value) && value.length === 0)) {
                  errors[name] = "Required";
                }
              };

              valueIsRequired("description");
              valueIsRequired("title");

              if (values.title.length > 120) {
                errors.title = "Title is too long (max 120 characters)";
              }

              if (!isValidUrl(values.url)) {
                errors.url = "Invalid URL";
              }

              for (const field of this.state.currentAction.getFields()) {
                if (field.type !== "bool" && !field.optional) {
                  valueIsRequired(field.name);
                }

                // Check if value can be interpreted correctly for this particular field
                let value = values[field.name];
                try {
                  value = field.callValue(value);
                } catch (error) {
                  if (error.message === "Assertion failed") {
                    // thank you BN.js for your helpful error messages
                    errors[field.name] = "Invalid number value";
                  } else {
                    errors[field.name] = error.message;
                  }
                }

                if (field.type === "address") {
                  if (!arc.web3.utils.isAddress(value)) {
                    errors[field.name] = "Invalid address";
                  }
                }

                if (field.type.includes("bytes")) {
                  if (!arc.web3.utils.isHexStrict(value)) {
                    errors[field.name] = "Must be a hex value";
                  }
                }

                if (field.type === "address[]") {
                  for (const i of value) {
                    if (!arc.web3.utils.isAddress(i)) {
                      errors[field.name] = "Invalid address";
                    }
                  }
                }

                if (field.type === "uint256" && !(this.isNecBurnField(field, "fund", "_amount") || uniswap.isField(this, field, "swap", "_amount") || uniswap.isField(this, field, "swap", "_expected") || uniswap.isField(this, field, "pool", "_amount1") || uniswap.isField(this, field, "pool", "_slippage"))) {
                  if (/^\d+$/.test(value) === false) {
                    errors[field.name] = "Must contain only digits";
                  }
                }

                if (this.isNecBurnField(field, "fund", "_amount")) {
                  if (value <= 0) {
                    errors[field.name] = "Must contain a positive value";
                  }
                }

                if (uniswap.isField(this, field, "swap", "_amount") || uniswap.isField(this, field, "pool", "_amount1")) {
                  if (value <= 0) {
                    errors[field.name] = "Must contain a positive value";
                  }
                }

                if (uniswap.isField(this, field, "unpool", "_amount")) {
                  if (value <= 0 || value > 100) {
                    errors[field.name] = "Must contain a positive percentage";
                  }
                }

                if (uniswap.isField(this, field, "swap", "_expected") || uniswap.isField(this, field, "pool", "_slippage") || uniswap.isField(this, field, "unpool", "_amount1")) {
                  if (value < 0 || value > 100) {
                    errors[field.name] = "Must contain a valid percentage between 0 and 100";
                  }
                }
              }
              return errors;
            }}
            onSubmit={this.handleSubmit}
            // eslint-disable-next-line react/jsx-no-bind
            render={({
              errors,
              touched,
              isSubmitting,
              setFieldValue,
              values,
            }: FormikProps<IFormValues>) => {
              return (
                <Form noValidate>
                  <label className={css.description}>What to Expect</label>
                  <div className={css.description}>
                    <Interweave content={currentAction.description} />
                  </div>
                  <label htmlFor="titleInput">
                    <div className={css.requiredMarker}>*</div>
                      Title
                    <ErrorMessage name="title">{(msg) => <span className={css.errorMessage}>{msg}</span>}</ErrorMessage>
                  </label>
                  <Field
                    autoFocus
                    id="titleInput"
                    maxLength={120}
                    placeholder="Summarize your proposal"
                    name="title"
                    type="text"
                    className={touched.title && errors.title ? css.error : null}
                  />

                  <TrainingTooltip overlay={fnDescription} placement="right">
                    <label htmlFor="descriptionInput">
                      <div className={css.proposalDescriptionLabelText}>
                        <div className={css.requiredMarker}>*</div>
                        <div className={css.body}>Description</div><HelpButton text={HelpButton.helpTextProposalDescription} />
                      </div>
                      <ErrorMessage name="description">{(msg) => <span className={css.errorMessage}>{msg}</span>}</ErrorMessage>
                    </label>
                  </TrainingTooltip>
                  <Field
                    component={MarkdownField}
                    onChange={(value: any) => { setFieldValue("description", value); }}
                    id="descriptionInput"
                    placeholder="Describe your proposal in greater detail"
                    name="description"
                    className={touched.description && errors.description ? css.error : null}
                  />

                  <label className={css.tagSelectorLabel}>
                    Tags
                  </label>

                  <div className={css.tagSelectorContainer}>
                    <TagsSelector onChange={this.onTagsChange} tags={this.state.tags}></TagsSelector>
                  </div>

                  <label htmlFor="urlInput">
                    URL
                    <ErrorMessage name="url">{(msg) => <span className={css.errorMessage}>{msg}</span>}</ErrorMessage>
                  </label>
                  <Field
                    id="urlInput"
                    maxLength={120}
                    placeholder="Description URL"
                    name="url"
                    type="text"
                    className={touched.url && errors.url ? css.error : null}
                  />

                  <div key={currentAction.id}
                    className={classNames({
                      [css.tab]: true,
                      [css.selected]: this.state.currentAction.id === currentAction.id,
                    })
                    }
                  >
                    {
                      currentAction.getFields().map((field: ActionField) => {
                        if (uniswap.isField(this, field, "pool", "_amount2") || uniswap.isField(this, field, "unpool", "_amount2")) {
                          return (
                            <div key={field.name}>
                              {this.renderField(field, values, touched, errors)}
                            </div>
                          );
                        } else {
                          return (
                            <div key={field.name}>
                              <label htmlFor={field.name}>
                                {field.type !== "bool" && !field.optional ? <div className={css.requiredMarker}>*</div> : ""}
                                { field.label }
                                <ErrorMessage name={field.name}>{(msg) => <span className={css.errorMessage}>{msg}</span>}</ErrorMessage>
                              </label>
                              {this.renderField(field, values, touched, errors)}
                            </div>
                          );
                        }
                      })
                    }
                  </div>

                  <div className={css.createProposalActions}>
                    <TrainingTooltip overlay="Export proposal" placement="top">
                      <button id="export-proposal" className={css.exportProposal} type="button" onClick={() => this.exportFormValues(values)}>
                        <img src="/assets/images/Icon/share-blue.svg" />
                      </button>
                    </TrainingTooltip>
                    <button className={css.exitProposalCreation} type="button" onClick={handleClose}>
                      Cancel
                    </button>
                    <TrainingTooltip overlay="Once the proposal is submitted it cannot be edited or deleted" placement="top">
                      <button className={css.submitProposal} type="submit" disabled={isSubmitting}>
                        Submit proposal
                      </button>
                    </TrainingTooltip>
                  </div>
                </Form>
              );
            }}
          />
        </div>
      </div>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(CreateKnownSchemeProposal);
