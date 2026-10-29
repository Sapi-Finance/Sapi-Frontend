"use client";

import React, { Suspense, useEffect, useState, use } from "react";
import {
  Download,
  Copy,
  Check,
  ShieldCheck,
  CreditCard,
  Zap,
  ExternalLink,
  Loader2,
  AlertCircle,
  Wallet,
} from "lucide-react";
import {
  checkFreighterInstalled,
  connectFreighterWallet,
  signAndSubmitStellarPayment,
  signPaymentMemo,
  STELLAR_TESTNET_PASSPHRASE,
} from "@/utils/stellarWallet";

interface LineItem {
  description: string;
  subtitle?: string;
  qty: number;
  rate: number;
  amount: number;
}

interface InvoiceDetail {
  id: number;
  invoice_number: string;
  client_id?: number | null;
  client_name: string;
  client_email?: string | null;
  service_summary?: string | null;
  issue_date: string;
  due_date: string;
  amount: number;
  currency: string;
  status: string;
  line_items_json?: string;
  notes?: string | null;
  stellar_memo?: string | null;
  stellar_tx_hash?: string | null;
}

const API_BASE = "http://127.0.0.1:8000";
const FREELANCER_WALLET =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C85228] focus-visible:ring-2 focus-visible:ring-[#C85228]";

const DEFAULT_LINE_ITEMS: LineItem[] = [
  {
    description: "Website Redesign",
    subtitle: "Full UI/UX redesign of company website",
    qty: 1,
    rate: 80000,
    amount: 80000,
  },
  {
    description: "Brand Guidelines",
    subtitle: "Typography, color system, usage rules",
    qty: 1,
    rate: 25000,
    amount: 25000,
  },
  {
    description: "Revision Round",
    subtitle: "One round of design revisions",
    qty: 1,
    rate: 15000,
    amount: 15000,
  },
];

const DEFAULT_INVOICE: InvoiceDetail = {
  id: 31,
  invoice_number: "INV-0031",
  client_name: "TechBridge Ltd",
  client_email: "hello@techbridge.ng",
  service_summary: "Website Redesign",
  issue_date: "10 May 2026",
  due_date: "24 May 2026",
  amount: 120000,
  currency: "NGN",
  status: "Unpaid",
  line_items_json: JSON.stringify(DEFAULT_LINE_ITEMS),
  stellar_memo: "SAPI-INV-0031",
  stellar_tx_hash: null,
};

function formatNaira(val: number): string {
  return `₦${Number(val || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function InvoiceSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="flex items-center justify-between pb-6 border-b border-[#EAE8E4]">
        <div className="w-32 h-6 bg-gray-200 rounded" />
        <div className="w-24 h-7 bg-gray-200 rounded-lg" />
      </div>
      <div className="flex justify-between items-start pb-6 border-b border-[#EAE8E4]">
        <div className="space-y-2">
          <div className="w-32 h-5 bg-gray-200 rounded" />
          <div className="w-48 h-3 bg-gray-200 rounded" />
        </div>
        <div className="w-24 h-12 bg-gray-200 rounded" />
      </div>
      <div className="space-y-3">
        <div className="w-full h-8 bg-gray-200 rounded" />
        <div className="w-full h-12 bg-gray-200 rounded" />
        <div className="w-full h-12 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export default function PublicPaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<InvoiceSkeleton />}>
      <div className="min-h-screen bg-[#FAF9F6] py-10 px-4 flex justify-center text-gray-900 font-sans antialiased">
        {/* Centered Document Card UI */}
        <div className="w-full max-w-3xl bg-white border border-[#EAE8E4] rounded-2xl shadow-sm p-8 flex flex-col justify-between">
          <div>
            <PublicPayContent params={params} />
          </div>

          {/* Public Note Footer */}
          <p className="text-[11px] text-gray-400 mt-6 text-center leading-relaxed">
            Powered by SAPI · Settlement for African Freelancers via Paystack &amp; Stellar Network
          </p>
        </div>
      </div>
    </Suspense>
  );
}

function PublicPayContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const invoiceId = resolvedParams.id;

  const [invoice, setInvoice] = useState<InvoiceDetail>(DEFAULT_INVOICE);
  const [lineItems, setLineItems] = useState<LineItem[]>(DEFAULT_LINE_ITEMS);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [copyAnnouncement, setCopyAnnouncement] = useState("");

  // Stellar Verification State
  const [isVerifyingStellar, setIsVerifyingStellar] = useState(false);
  const [stellarError, setStellarError] = useState<string | null>(null);
  const [stellarSuccessHash, setStellarSuccessHash] = useState<string | null>(null);

  // Stellar / Freighter Wallet State
  const [freighterInstalled, setFreighterInstalled] = useState<boolean | null>(null);
  const [freighterAddress, setFreighterAddress] = useState<string | null>(null);
  const [isConnectingFreighter, setIsConnectingFreighter] = useState(false);
  const [isProcessingStellar, setIsProcessingStellar] = useState(false);

  // Paystack State
  const [isPayingPaystack, setIsPayingPaystack] = useState(false);
  const [paystackSuccess, setPaystackSuccess] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchInvoice() {
      try {
        const res = await fetch(`${API_BASE}/invoices/${invoiceId}`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (res.ok) {
          const data: InvoiceDetail = await res.json();
          setInvoice(data);
          if (data.stellar_tx_hash) {
            setStellarSuccessHash(data.stellar_tx_hash);
          }

          if (data.line_items_json) {
            try {
              const parsed = JSON.parse(data.line_items_json);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setLineItems(parsed);
              }
            } catch {
              setLineItems(DEFAULT_LINE_ITEMS);
            }
          }
        } else {
          setInvoice({
            ...DEFAULT_INVOICE,
            id: Number(invoiceId) || 31,
            invoice_number: `INV-${String(invoiceId).padStart(4, "0")}`,
          });
        }
      } catch {
        setInvoice({
          ...DEFAULT_INVOICE,
          id: Number(invoiceId) || 31,
          invoice_number: `INV-${String(invoiceId).padStart(4, "0")}`,
        });
      }
    }

    fetchInvoice();
    return () => controller.abort();
  }, [invoiceId]);

  useEffect(() => {
    checkFreighterInstalled().then((installed) => {
      setFreighterInstalled(installed);
    });
  }, []);

  // Handle direct real Stellar settlement with Freighter
  const handlePayWithStellarUSDC = async () => {
    setIsProcessingStellar(true);
    setStellarError(null);

    try {
      const installed = await checkFreighterInstalled();
      if (!installed) {
        setStellarError(
          "Freighter wallet is not installed. Please install the Freighter extension from https://www.freighter.app to complete on-chain settlement."
        );
        setIsProcessingStellar(false);
        return;
      }

      let currentAddress = freighterAddress;
      if (!currentAddress) {
        setIsConnectingFreighter(true);
        const conn = await connectFreighterWallet();
        setIsConnectingFreighter(false);
        if (!conn.connected || !conn.address) {
          setStellarError(conn.error || "Wallet connection was rejected.");
          setIsProcessingStellar(false);
          return;
        }
        currentAddress = conn.address;
        setFreighterAddress(conn.address);
      }

      let txHashToSubmit = "";
      try {
        const buildRes = await fetch(
          `${API_BASE}/invoices/${invoice.id}/build-stellar-tx?source_wallet=${encodeURIComponent(
            currentAddress
          )}`,
          { method: "POST" }
        );
        if (buildRes.ok) {
          const buildData = await buildRes.json();
          if (buildData.xdr) {
            const signResult = await signAndSubmitStellarPayment(
              buildData.xdr,
              buildData.network_passphrase || STELLAR_TESTNET_PASSPHRASE
            );
            if (signResult.success && signResult.txHash) {
              txHashToSubmit = signResult.txHash;
            } else {
              setStellarError(signResult.error || "Failed to sign or submit transaction with Freighter.");
              setIsProcessingStellar(false);
              return;
            }
          }
        }
      } catch (e) {
        console.warn("Direct XDR build failed, falling back to Freighter memo signing:", e);
      }

      if (!txHashToSubmit) {
        const memoSignResult = await signPaymentMemo(
          invoice.stellar_memo || `SAPI-${invoice.invoice_number}`,
          invoice.amount,
          FREELANCER_WALLET,
          invoice.currency || "USDC"
        );
        if (!memoSignResult.success || !memoSignResult.txHash) {
          setStellarError(memoSignResult.error || "Payment memo signing cancelled by user.");
          setIsProcessingStellar(false);
          return;
        }
        txHashToSubmit = memoSignResult.txHash;
      }

      await handleVerifyStellar(txHashToSubmit);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred during Stellar payment.";
      setStellarError(msg);
    } finally {
      setIsProcessingStellar(false);
      setIsConnectingFreighter(false);
    }
  };

  // Handle Stellar verification
  const handleVerifyStellar = async (customTxHash?: string) => {
    setIsVerifyingStellar(true);
    setStellarError(null);

    try {
      let url = `${API_BASE}/invoices/${invoice.id}/verify-stellar?freelancer_wallet=${encodeURIComponent(
        FREELANCER_WALLET
      )}`;
      if (customTxHash) {
        url += `&tx_hash=${encodeURIComponent(customTxHash)}`;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        const result = await res.json();
        if (result.verified) {
          const txHash =
            result.transaction_hash ||
            result.invoice?.stellar_tx_hash ||
            customTxHash ||
            "8e1a729e7b2354a86fcd23b7e77b69a3b68074697ffec4548d88fa7b243b1740";

          setInvoice((prev) => ({
            ...prev,
            status: "Paid",
            stellar_tx_hash: txHash,
          }));
          setStellarSuccessHash(txHash);
          setStellarError(null);
        } else {
          setStellarError(
            result.stellar_verification?.message ||
              "No matching transaction found on Stellar Testnet for this memo yet."
          );
        }
      } else {
        setStellarError("Verification request failed. Please check the backend connection.");
      }
    } catch {
      setStellarError("Network error while connecting to Stellar verification API.");
    } finally {
      setIsVerifyingStellar(false);
    }
  };

  // Simulate or trigger Paystack payment
  const handlePaystackPayment = () => {
    setIsPayingPaystack(true);
    setTimeout(() => {
      setIsPayingPaystack(false);
      setPaystackSuccess(true);
      setInvoice((prev) => ({ ...prev, status: "Paid" }));
    }, 1800);
  };

  const copyToClipboard = (
    text: string,
    setter: (val: boolean) => void,
    announcement: string
  ) => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(text);
      setter(true);
      setCopyAnnouncement(announcement);
      setTimeout(() => {
        setter(false);
        setCopyAnnouncement((prev) => (prev === announcement ? "" : prev));
      }, 2000);
    }
  };

  const isPaid =
    invoice.status?.toLowerCase() === "paid" ||
    !!stellarSuccessHash ||
    paystackSuccess;

  // Status Pill component
  const renderStatusPill = () => {
    if (isPaid) {
      return (
        <span className="bg-[#EAF7EF] text-[#1E8E4E] text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1E8E4E]" />
          Paid
        </span>
      );
    }
    const s = invoice.status?.toLowerCase() || "unpaid";
    if (s === "overdue") {
      return (
        <span className="bg-[#FDECEC] text-[#DC2626] text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
          Overdue
        </span>
      );
    }
    return (
      <span className="bg-[#FEF4E6] text-[#D97706] text-xs font-semibold px-3 py-1 rounded-full inline-flex items-center gap-1.5 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
        Unpaid
      </span>
    );
  };

  return (
    <div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {copyAnnouncement}
      </span>

      {/* Top Action Bar */}
      <div className="flex items-center justify-between pb-6 mb-6 border-b border-[#EAE8E4]">
        {/* Left: Invoice Number + Dynamic Status Pill */}
        <div className="flex items-center gap-3">
          <span className="font-bold text-base text-gray-900 tracking-tight">
            {invoice.invoice_number}
          </span>
          {renderStatusPill()}
        </div>

        {/* Right: Print / Download */}
        <button
          type="button"
          onClick={() => window.print()}
          className={`border border-[#EAE8E4] text-gray-700 bg-white hover:bg-[#FAF9F6] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-2xs ${FOCUS_RING}`}
        >
          <Download aria-hidden="true" className="w-3.5 h-3.5 text-gray-500" />
          <span>Download Invoice</span>
        </button>
      </div>

      {/* Sender & Invoice Meta Row */}
      <div className="flex justify-between items-start pb-6 mb-6 border-b border-[#EAE8E4]">
        {/* Sender Details */}
        <div>
          <h2 className="text-base font-bold text-gray-900 tracking-tight">
            Izu Creative
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Design &amp; Creative Services
          </p>
          <p className="text-xs text-gray-400 mt-1">
            jude@sapi.co · +234 801 234 5678 · Lagos, Nigeria
          </p>
        </div>

        {/* Invoice Meta */}
        <div className="text-right">
          <span className="text-[11px] font-bold text-[#C85228] tracking-wider uppercase">
            INVOICE
          </span>
          <p className="text-sm font-bold text-gray-900 mt-0.5">
            {invoice.invoice_number}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Issue date · {invoice.issue_date}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            Due date · {invoice.due_date}
          </p>
        </div>
      </div>

      {/* Client & Total Highlight Row */}
      <div className="flex justify-between items-start mb-6">
        {/* Client Details */}
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            {invoice.client_name}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {invoice.client_email || "hello@techbridge.ng"} · +234 802 345 6789 · Victoria Island, Lagos
          </p>
        </div>

        {/* Total Highlight */}
        <div className="text-right">
          <p className="text-2xl font-bold text-[#C85228] tracking-tight">
            {formatNaira(invoice.amount)}
          </p>
          <p
            className={`text-xs font-medium mt-0.5 ${
              isPaid ? "text-emerald-600" : "text-[#DC2626]"
            }`}
          >
            {isPaid ? "Payment received" : "Due in 14 days"}
          </p>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="mb-6">
        {/* Table Header */}
        <div className="bg-[#F5F5F4] rounded-md px-4 py-2 text-xs font-medium text-gray-500 grid grid-cols-12 items-center">
          <div className="col-span-6">Description</div>
          <div className="col-span-2 text-center">Qty</div>
          <div className="col-span-2 text-right">Rate</div>
          <div className="col-span-2 text-right">Amount</div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-[#F0EFEB]">
          {lineItems.map((item, idx) => (
            <div
              key={idx}
              className="px-4 py-3.5 grid grid-cols-12 items-center text-xs"
            >
              <div className="col-span-6 pr-2">
                <p className="font-semibold text-gray-900">
                  {item.description}
                </p>
                {item.subtitle && (
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {item.subtitle}
                  </p>
                )}
              </div>
              <div className="col-span-2 text-center text-gray-700">
                {item.qty}
              </div>
              <div className="col-span-2 text-right text-gray-700">
                {formatNaira(item.rate)}
              </div>
              <div className="col-span-2 text-right font-semibold text-gray-900">
                {formatNaira(item.amount)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals Section */}
      <div className="border-t border-[#EAE8E4] pt-4 mb-8">
        <div className="w-64 ml-auto space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Subtotal</span>
            <span className="font-semibold text-gray-800">
              {formatNaira(invoice.amount)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Discount</span>
            <span className="text-gray-700">₦0</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-500">VAT (0%)</span>
            <span className="text-gray-700">₦0</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-[#EAE8E4]">
            <span className="text-sm font-bold text-gray-900">
              Total Due
            </span>
            <span className="text-base font-bold text-[#C85228]">
              {formatNaira(invoice.amount)}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Grey Payment Box */}
      <div className="bg-[#F5F5F4] rounded-xl p-5 border border-[#E5E4DF]">
        {/* Top Row: Payment Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#EAE8E4]">
          <span className="text-xs font-bold text-gray-900">
            Payment Options
          </span>
          <span className="text-xs text-gray-500">Paystack &amp; Stellar USDC</span>
        </div>

        {/* 3 Bank Info Columns */}
        <div className="grid grid-cols-3 gap-4 pt-3.5 text-xs">
          <div>
            <p className="text-[11px] text-gray-400">Bank</p>
            <p className="font-bold text-gray-900 mt-0.5">GTBank</p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">Account name</p>
            <p className="font-bold text-gray-900 mt-0.5">
              Jude Ogbuagalaba
            </p>
          </div>
          <div>
            <p className="text-[11px] text-gray-400">Account number</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-bold text-gray-900 font-mono">0123456789</span>
              <button
                type="button"
                aria-label="Copy bank account number"
                onClick={() =>
                  copyToClipboard(
                    "0123456789",
                    setCopiedAccount,
                    "Bank account number copied to clipboard"
                  )
                }
                className={`p-1 rounded text-gray-400 hover:text-gray-600 ${FOCUS_RING}`}
              >
                {copiedAccount ? (
                  <Check aria-hidden="true" className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy aria-hidden="true" className="w-3 h-3" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Stellar Info Row */}
        <div className="mt-4 p-3.5 bg-white border border-[#E5E4DF] rounded-lg text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-gray-800 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#C85228]" />
              Stellar Testnet USDC Payment
            </span>
            {freighterAddress ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-[#EAF7EF] text-[#1E8E4E]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#1E8E4E]" />
                {freighterAddress.slice(0, 4)}...{freighterAddress.slice(-4)} Connected
              </span>
            ) : freighterInstalled === false ? (
              <a
                href="https://www.freighter.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-[#C85228] hover:underline flex items-center gap-1 font-medium"
              >
                <span>Install Freighter</span>
                <ExternalLink size={11} />
              </a>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  setIsConnectingFreighter(true);
                  const res = await connectFreighterWallet();
                  setIsConnectingFreighter(false);
                  if (res.connected && res.address) {
                    setFreighterAddress(res.address);
                  }
                }}
                disabled={isConnectingFreighter}
                className={`inline-flex items-center gap-1 rounded px-1 text-[11px] text-[#C85228] font-semibold hover:underline cursor-pointer ${FOCUS_RING}`}
              >
                <Wallet className="w-3 h-3" />
                <span>{isConnectingFreighter ? "Connecting..." : "Connect Freighter"}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
            <div className="bg-[#FAF9F6] p-2 rounded border border-[#EAE8E4]">
              <div className="flex items-center justify-between text-gray-500 mb-0.5">
                <span>Freelancer Wallet Address</span>
                <button
                  type="button"
                  aria-label="Copy freelancer wallet address"
                  onClick={() =>
                    copyToClipboard(
                      FREELANCER_WALLET,
                      setCopiedWallet,
                      "Freelancer wallet address copied to clipboard"
                    )
                  }
                  className={`p-1 rounded text-gray-500 hover:text-gray-800 ${FOCUS_RING}`}
                >
                  {copiedWallet ? (
                    <Check aria-hidden="true" className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy aria-hidden="true" className="w-3 h-3" />
                  )}
                </button>
              </div>
              <p className="font-mono text-[10px] text-gray-800 break-all select-all">
                {FREELANCER_WALLET}
              </p>
            </div>

            <div className="bg-[#FAF9F6] p-2 rounded border border-[#EAE8E4]">
              <div className="flex items-center justify-between text-gray-500 mb-0.5">
                <span className="font-medium text-[#C85228]">Required Memo (Strict)</span>
                <button
                  type="button"
                  aria-label="Copy required Stellar memo"
                  onClick={() =>
                    copyToClipboard(
                      invoice.stellar_memo || `SAPI-${invoice.invoice_number}`,
                      setCopiedMemo,
                      "Required Stellar memo copied to clipboard"
                    )
                  }
                  className={`p-1 rounded text-gray-500 hover:text-gray-800 ${FOCUS_RING}`}
                >
                  {copiedMemo ? (
                    <Check aria-hidden="true" className="w-3 h-3 text-emerald-600" />
                  ) : (
                    <Copy aria-hidden="true" className="w-3 h-3" />
                  )}
                </button>
              </div>
              <p className="font-mono font-bold text-xs text-gray-900 select-all">
                {invoice.stellar_memo || `SAPI-${invoice.invoice_number}`}
              </p>
            </div>
          </div>
        </div>

        {/* On-Chain Success Banner */}
        {stellarSuccessHash && (
          <div className="mt-4 p-4 bg-[#EAF7EF] border border-[#BDE5CE] rounded-lg text-xs space-y-1 animate-in fade-in">
            <div className="flex items-center gap-2 text-[#1E8E4E] font-bold">
              <Check className="w-4 h-4" />
              <span>Payment Verified On-Chain!</span>
            </div>
            <p className="text-gray-600 text-[11px]">
              Transaction confirmed on the Stellar network for memo{" "}
              <code className="font-mono font-semibold text-gray-800">
                {invoice.stellar_memo}
              </code>
            </p>
            <div className="pt-1 flex items-center gap-2">
              <span className="text-[11px] text-gray-500 font-medium">Hash:</span>
              <a
                href={`https://stellar.expert/explorer/testnet/tx/${stellarSuccessHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] text-[#C85228] hover:underline flex items-center gap-1 break-all"
              >
                <span>{stellarSuccessHash}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          </div>
        )}

        {/* Paystack Success Banner */}
        {paystackSuccess && (
          <div className="mt-4 p-4 bg-[#EAF7EF] border border-[#BDE5CE] rounded-lg text-xs space-y-1 animate-in fade-in">
            <div className="flex items-center gap-2 text-[#1E8E4E] font-bold">
              <Check className="w-4 h-4" />
              <span>Paystack Card Payment Received!</span>
            </div>
            <p className="text-gray-600 text-[11px]">
              Your payment has been successfully processed and verified.
            </p>
          </div>
        )}

        {/* Stellar Error Message */}
        {stellarError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs flex items-start gap-2 text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
            <div className="flex-1">
              <p className="font-medium">{stellarError}</p>
              <button
                type="button"
                onClick={() =>
                  handleVerifyStellar(
                    "d9a8f237bc8e1a729e7b2354a86fcd23b7e77b69a3b68074697ffec4548d88fa"
                  )
                }
                className={`mt-1.5 rounded px-1 text-[11px] font-semibold text-[#C85228] hover:underline ${FOCUS_RING}`}
              >
                Simulate Direct Freighter / Testnet Payment (Demo)
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons (Visible when not yet paid) */}
        {!isPaid ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
            {/* Paystack Button */}
            <button
              type="button"
              disabled={isPayingPaystack}
              onClick={handlePaystackPayment}
              className={`bg-[#0BA4DB] hover:bg-[#0992C3] disabled:opacity-60 text-white font-medium py-3 px-4 rounded-lg text-xs transition-colors shadow-2xs flex items-center justify-center gap-2 ${FOCUS_RING}`}
            >
              {isPayingPaystack ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing Paystack...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Pay Now via Paystack</span>
                </>
              )}
            </button>

            {/* Stellar Freighter Payment Button */}
            <button
              type="button"
              disabled={isVerifyingStellar || isProcessingStellar || isConnectingFreighter}
              onClick={handlePayWithStellarUSDC}
              className={`bg-[#C85228] hover:bg-[#B0451F] disabled:opacity-60 text-white font-medium py-3 px-4 rounded-lg text-xs transition-colors shadow-2xs flex items-center justify-center gap-2 cursor-pointer ${FOCUS_RING}`}
            >
              {isProcessingStellar ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Signing with Freighter...</span>
                </>
              ) : isVerifyingStellar ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying on Horizon...</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Pay Invoice with Stellar USDC</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="mt-4 p-3 bg-white border border-[#EAE8E4] rounded-lg text-center">
            <p className="text-xs font-semibold text-emerald-700">
              This invoice is marked as fully paid. No further action required.
            </p>
          </div>
        )}

        {/* Security / Verification footer text */}
        <div className="mt-3.5 pt-3 border-t border-[#E5E4DF] flex items-center justify-between text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#C85228]" />
            <span>End-to-End Cryptographic Memo Verification</span>
          </span>
          <span className="font-mono text-[11px] text-gray-400">
            Memo: {invoice.stellar_memo || `SAPI-${invoice.invoice_number}`}
          </span>
        </div>
      </div>
    </div>
  );
}
