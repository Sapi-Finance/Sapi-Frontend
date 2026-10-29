export const STELLAR_TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const STELLAR_PUBLIC_PASSPHRASE =
  "Public Global Stellar Network ; September 2015";

export const FREIGHTER_TESTNET_WARNING =
  "Please switch Freighter to Test SDF Network";
export const PAYMENT_SIGNATURE_CANCELLED =
  "Payment signature cancelled. You can retry when ready.";

/** Freighter returns this code when the user closes or rejects a prompt. */
export const FREIGHTER_USER_DECLINED_CODE = -4;

export type StellarNoticeTone = "error" | "warning" | "cancelled";

export interface InterpretedConnection {
  connected: boolean;
  address: string;
  network?: string;
  warning?: string;
  error?: string;
}

export interface ParsedWalletFailure {
  cancelled: boolean;
  message: string;
}

interface HorizonErrorBody {
  detail?: unknown;
  title?: unknown;
  extras?: {
    result_codes?: {
      transaction?: unknown;
      operations?: unknown;
    };
  };
}

const OPERATION_MESSAGES: Record<string, string> = {
  op_underfunded:
    "Your Stellar account does not have enough funds to cover this payment.",
  op_low_reserve:
    "This payment would drop the account below the Stellar minimum reserve.",
  op_no_destination:
    "The destination account does not exist on Stellar Testnet.",
  op_no_trust: "The destination account is not set up to receive this asset.",
  op_not_authorized:
    "This account is not authorized to send or receive that asset.",
  op_src_not_authorized: "This account is not authorized to send that asset.",
  op_line_full:
    "The destination trustline cannot accept any more of this asset.",
  op_no_issuer: "The asset issuer account does not exist.",
};

const TRANSACTION_MESSAGES: Record<string, string> = {
  tx_bad_seq: "This transaction is out of date. Please try the payment again.",
  tx_insufficient_balance:
    "Your Stellar account does not have enough funds to cover this payment and its fee.",
  tx_insufficient_fee:
    "The network fee was too low for current conditions. Please try again.",
  tx_bad_auth:
    "The transaction signature was not accepted by the Stellar network.",
  tx_too_early: "This transaction is not valid yet. Please try again in a moment.",
  tx_too_late:
    "This transaction expired before it reached the network. Please try again.",
  tx_no_source_account: "The paying account does not exist on Stellar Testnet.",
  tx_failed:
    "The Stellar network rejected this transaction. Please review the payment and try again.",
};

function isTestnetName(network: string): boolean {
  return network.toUpperCase().replace(/\s+/g, "") === "TESTNET";
}

export function warningForFreighterNetwork(input: {
  network?: string;
  networkPassphrase?: string;
}): string | null {
  const passphrase = (input.networkPassphrase || "").trim();
  const network = (input.network || "").trim();
  if (!passphrase && !network) return null;
  if (passphrase === STELLAR_TESTNET_PASSPHRASE) return null;
  if (!passphrase && isTestnetName(network)) return null;
  return FREIGHTER_TESTNET_WARNING;
}

export function interpretWalletConnection(
  address: string,
  network?: string,
  networkPassphrase?: string,
): InterpretedConnection {
  const warning = warningForFreighterNetwork({ network, networkPassphrase });
  if (warning) {
    return {
      connected: false,
      address,
      network: network || undefined,
      warning,
      error: warning,
    };
  }

  return {
    connected: true,
    address,
    network: network || "TESTNET",
  };
}

export function freighterErrorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown };
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error;
    }
  }
  return "";
}

export function isFreighterUserCancellation(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (code === FREIGHTER_USER_DECLINED_CODE || code === "-4") return true;
  }
  const text = freighterErrorText(error).toLowerCase();
  if (!text) return false;
  return (
    text.includes("user rejected") ||
    text.includes("user declined") ||
    text.includes("rejected this request") ||
    text.includes("declined access") ||
    text.includes("user cancelled") ||
    text.includes("user canceled") ||
    text.includes("transaction cancelled") ||
    text.includes("transaction canceled")
  );
}

function friendlyResultCode(code: string): string | null {
  if (code === "op_success" || code === "tx_success") return null;
  return OPERATION_MESSAGES[code] || TRANSACTION_MESSAGES[code] || null;
}

export function messageForResultCodes(codes: string[]): string | null {
  const specific = codes.filter((code) => code !== "tx_failed" && code !== "op_success");
  for (const code of specific) {
    const message = friendlyResultCode(code);
    if (message) return message;
  }
  for (const code of codes) {
    const message = friendlyResultCode(code);
    if (message) return message;
  }
  const unknown = codes.find((code) => code !== "op_success");
  if (unknown) {
    return `The Stellar network rejected this transaction (${unknown}).`;
  }
  return null;
}

function collectResultCodes(body: HorizonErrorBody): string[] {
  const codes: string[] = [];
  const resultCodes = body.extras?.result_codes;
  const operations = resultCodes?.operations;
  if (Array.isArray(operations)) {
    for (const operation of operations) {
      if (typeof operation === "string" && operation.trim()) codes.push(operation);
    }
  } else if (typeof operations === "string" && operations.trim()) {
    codes.push(operations);
  }
  if (typeof resultCodes?.transaction === "string" && resultCodes.transaction.trim()) {
    codes.push(resultCodes.transaction);
  }
  return codes;
}

export function messageForHorizonBody(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const body = data as HorizonErrorBody;
  const fromCodes = messageForResultCodes(collectResultCodes(body));
  if (fromCodes) return fromCodes;
  if (typeof body.detail === "string" && body.detail.trim()) return body.detail;
  if (typeof body.title === "string" && body.title.trim()) return body.title;
  return null;
}

function messageFromErrorText(text: string): string | null {
  const knownCodes = [
    ...Object.keys(OPERATION_MESSAGES),
    ...Object.keys(TRANSACTION_MESSAGES),
  ];
  const found = knownCodes.filter((code) => text.includes(code));
  return messageForResultCodes(found);
}

export function parseWalletFailure(error: unknown): ParsedWalletFailure {
  if (isFreighterUserCancellation(error)) {
    return { cancelled: true, message: PAYMENT_SIGNATURE_CANCELLED };
  }

  const text = freighterErrorText(error);
  const fromText = text ? messageFromErrorText(text) : null;
  if (fromText) return { cancelled: false, message: fromText };

  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const horizonMessage = messageForHorizonBody(JSON.parse(trimmed));
      if (horizonMessage) return { cancelled: false, message: horizonMessage };
    } catch {
      // The wallet returned a non-JSON string.
    }
  }

  return {
    cancelled: false,
    message: text || "Failed to sign or submit transaction",
  };
}

export function noticeToneForConnection(result: {
  connected: boolean;
  warning?: string;
}): StellarNoticeTone | null {
  if (result.warning) return "warning";
  if (!result.connected) return "error";
  return null;
}

export function noticeToneForPayment(result: {
  cancelled?: boolean;
  networkMismatch?: boolean;
}): StellarNoticeTone {
  if (result.networkMismatch) return "warning";
  if (result.cancelled) return "cancelled";
  return "error";
}
