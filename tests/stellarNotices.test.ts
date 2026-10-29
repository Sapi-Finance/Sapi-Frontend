import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  FREIGHTER_TESTNET_WARNING,
  FREIGHTER_USER_DECLINED_CODE,
  PAYMENT_SIGNATURE_CANCELLED,
  STELLAR_PUBLIC_PASSPHRASE,
  STELLAR_TESTNET_PASSPHRASE,
  interpretWalletConnection,
  messageForHorizonBody,
  noticeToneForConnection,
  noticeToneForPayment,
  parseWalletFailure,
} from "../src/utils/stellarNotices.ts";

const ADDRESS = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

describe("Freighter network mismatch", () => {
  it("warns when Freighter is on the public network", () => {
    const result = interpretWalletConnection(
      ADDRESS,
      "PUBLIC",
      STELLAR_PUBLIC_PASSPHRASE,
    );

    assert.equal(result.connected, false);
    assert.equal(result.warning, FREIGHTER_TESTNET_WARNING);
    assert.equal(result.error, FREIGHTER_TESTNET_WARNING);
    assert.equal(noticeToneForConnection(result), "warning");
  });

  it("warns for mainnet names even without a passphrase", () => {
    for (const network of ["PUBLIC", "MAINNET", "Main Net"]) {
      const result = interpretWalletConnection(ADDRESS, network);
      assert.equal(result.connected, false, network);
      assert.equal(result.warning, FREIGHTER_TESTNET_WARNING, network);
    }
  });

  it("accepts the Test SDF network", () => {
    const result = interpretWalletConnection(
      ADDRESS,
      "TESTNET",
      STELLAR_TESTNET_PASSPHRASE,
    );

    assert.equal(result.connected, true);
    assert.equal(result.warning, undefined);
    assert.equal(result.network, "TESTNET");
    assert.equal(noticeToneForConnection(result), null);
  });

  it("does not invent a mainnet warning when Freighter reports no network", () => {
    const result = interpretWalletConnection(ADDRESS);
    assert.equal(result.connected, true);
    assert.equal(result.network, "TESTNET");
  });
});

describe("payment signature cancellation", () => {
  it("turns Freighter's declined-request object into a retry notice", () => {
    const declined = {
      code: FREIGHTER_USER_DECLINED_CODE,
      message: "The user rejected this request.",
    };

    const parsed = parseWalletFailure(declined);
    assert.equal(String(declined), "[object Object]");
    assert.equal(parsed.cancelled, true);
    assert.equal(parsed.message, PAYMENT_SIGNATURE_CANCELLED);
    assert.equal(noticeToneForPayment({ cancelled: true }), "cancelled");
    assert.notEqual(parsed.message, "[object Object]");
  });

  it("recognizes cancellation messages thrown as errors", () => {
    const parsed = parseWalletFailure(new Error("User declined access"));
    assert.equal(parsed.cancelled, true);
    assert.equal(parsed.message, PAYMENT_SIGNATURE_CANCELLED);
  });
});

describe("Horizon submission errors", () => {
  it("prefers op_underfunded over the generic tx_failed code", () => {
    const body = {
      title: "Transaction Failed",
      detail: "The transaction failed when submitted to the stellar network.",
      extras: {
        result_codes: {
          transaction: "tx_failed",
          operations: ["op_underfunded"],
        },
      },
    };

    const currentCode = body.extras.result_codes.transaction;
    assert.equal(currentCode, "tx_failed");
    assert.equal(
      messageForHorizonBody(body),
      "Your Stellar account does not have enough funds to cover this payment.",
    );
    assert.equal(noticeToneForPayment({}), "error");
  });

  it("translates tx_bad_seq into a retry message", () => {
    const message = messageForHorizonBody({
      extras: { result_codes: { transaction: "tx_bad_seq" } },
    });
    assert.equal(
      message,
      "This transaction is out of date. Please try the payment again.",
    );
  });

  it("translates result codes embedded in a wallet error string", () => {
    const parsed = parseWalletFailure("Horizon submit failed: op_no_destination");
    assert.equal(parsed.cancelled, false);
    assert.equal(
      parsed.message,
      "The destination account does not exist on Stellar Testnet.",
    );
  });

  it("keeps an internal wallet error as a fatal message", () => {
    const parsed = parseWalletFailure({
      code: -1,
      message: "The wallet encountered an internal error. Please try again.",
    });
    assert.equal(parsed.cancelled, false);
    assert.equal(
      parsed.message,
      "The wallet encountered an internal error. Please try again.",
    );
    assert.notEqual(parsed.message, "[object Object]");
  });
});
