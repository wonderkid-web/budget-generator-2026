"use client";

import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  ClipboardCopy,
  ClipboardPaste,
  Trash2,
} from "lucide-react";
import { GeneratorNavbar } from "../_components/GeneratorNavbar";

type RawRow = Record<string, string>;

type PaymentLine = {
  "Tanggal Pelunasan": string;
  "Jenis Penerimaan": string;
  Nominal: number;
  "No. Penjualan": string;
};

type CustomerPaymentGroup = {
  "Kode Kustomer": string;
  "Nama Kustomer": string;
  Transaksi: PaymentLine[];
};

type SettlementGroup = {
  "Tanggal Pelunasan": string;
  "Pelunasan Penjualan": CustomerPaymentGroup[];
  Kota: [];
  Kecamatan: [];
};

const METHOD_COLUMNS = ["BANK", "BAYAR DP", "SETOR"] as const;

const SAMPLE_INPUT = [
  "Sum of Total Setor\t\t\t\t\tMetode\t\t\t",
  "Tanggal Setor\tNPWP/NIK\tNama Customer\tTgl. Faktur\tNo. Faktur\tBANK\tBAYAR DP\tSETOR\tGrand Total",
  "02/01/25\t0650186554119000\tCV.Agri Jaya Abadi\t02/01/25\t7922\t\t83.000.000\t\t83.000.000",
  "02/01/25\t0650186554119000\tCV.Agri Jaya Abadi Total\t\t\t\t83.000.000\t\t83.000.000",
  "02/01/25\t1209195601710002\tAini\t18/12/24\t7830\t41.750.000\t\t\t41.750.000",
  "02/01/25\t1209195601710002\tAini Total\t\t\t41.750.000\t\t\t41.750.000",
  "02/01/25 Total\t\t\t\t\t41.750.000\t83.000.000\t\t124.750.000",
].join("\n");

const normalizeKey = (key: string) =>
  key.replace(/\s+/g, " ").trim().toLowerCase();

const findValue = (row: RawRow, possibleKeys: string[]) => {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [
    normalizeKey(key),
    value,
  ]);
  const normalizedRow = Object.fromEntries(normalizedEntries);

  for (const key of possibleKeys) {
    const value = normalizedRow[normalizeKey(key)];
    if (value !== undefined) {
      return value;
    }
  }

  return "";
};

const parseAmount = (value: string) => {
  const sanitized = value
    .replace(/rp/gi, "")
    .replace(/\s/g, "")
    .replace(/"/g, "")
    .trim();

  if (!sanitized || sanitized === "-") {
    return 0;
  }

  const withoutDecimal = sanitized.includes(",")
    ? sanitized.split(",")[0]
    : sanitized;
  const parsed = Number(withoutDecimal.replace(/\./g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeDate = (value: string, outputYear: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (!match) {
    return trimmed;
  }

  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = outputYear.trim() || match[3];

  return `${day}/${month}/${year}`;
};

const isTotalRow = (row: RawRow) => {
  const tanggalSetor = findValue(row, ["Tanggal Setor"]);
  const namaCustomer = findValue(row, ["Nama Customer"]);

  return (
    /\btotal\b/i.test(tanggalSetor) ||
    /\btotal\b/i.test(namaCustomer) ||
    !tanggalSetor.trim()
  );
};

const parsePastedPivot = (text: string): RawRow[] => {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "");

  const headerIndex = lines.findIndex((line) => {
    const normalized = normalizeKey(line);
    return (
      normalized.includes("tanggal setor") &&
      normalized.includes("npwp") &&
      normalized.includes("grand total")
    );
  });

  if (headerIndex === -1 || headerIndex === lines.length - 1) {
    return [];
  }

  const headers = lines[headerIndex].split("\t").map((header) => header.trim());

  return lines.slice(headerIndex + 1).map((line) => {
    const cells = line.split("\t");
    const row: RawRow = {};

    headers.forEach((header, index) => {
      row[header] = cells[index]?.trim() ?? "";
    });

    return row;
  });
};

const buildSettlementGroups = (
  rawRows: RawRow[],
  outputYear: string,
): SettlementGroup[] => {
  const groups = new Map<string, SettlementGroup>();
  const customerMapByDate = new Map<string, Map<string, CustomerPaymentGroup>>();

  for (const row of rawRows) {
    if (isTotalRow(row)) {
      continue;
    }

    const tanggalSetor = normalizeDate(findValue(row, ["Tanggal Setor"]), outputYear);
    const kodeKustomer = findValue(row, ["NPWP/NIK", "NPWP", "NIK"]);
    const namaCustomer = findValue(row, ["Nama Customer", "Nama Cust"]);
    const noFaktur = findValue(row, ["No. Faktur", "No Faktur"]);

    const methodAmounts = METHOD_COLUMNS.map((method) => ({
      method,
      amount: parseAmount(findValue(row, [method])),
    })).filter((item) => item.amount > 0);

    if (!methodAmounts.length) {
      continue;
    }

    if (!groups.has(tanggalSetor)) {
      groups.set(tanggalSetor, {
        "Tanggal Pelunasan": tanggalSetor,
        "Pelunasan Penjualan": [],
        Kota: [],
        Kecamatan: [],
      });
      customerMapByDate.set(tanggalSetor, new Map());
    }

    const group = groups.get(tanggalSetor);
    const customerMap = customerMapByDate.get(tanggalSetor);
    if (!group || !customerMap) {
      continue;
    }

    const customerKey = namaCustomer;
    const customerPaymentGroup: CustomerPaymentGroup = customerMap.get(
      customerKey,
    ) ?? {
      "Kode Kustomer": kodeKustomer,
      "Nama Kustomer": namaCustomer,
      Transaksi: [],
    };

    for (const { method, amount } of methodAmounts) {
      customerPaymentGroup.Transaksi.push({
        "Tanggal Pelunasan": tanggalSetor,
        "Jenis Penerimaan": method,
        Nominal: amount,
        "No. Penjualan": noFaktur,
      });
    }

    customerMap.set(customerKey, customerPaymentGroup);
  }

  for (const group of groups.values()) {
    const customerMap = customerMapByDate.get(group["Tanggal Pelunasan"]);
    group["Pelunasan Penjualan"] = Array.from(customerMap?.values() ?? []);
  }

  return Array.from(groups.values());
};

const formatPythonValue = (value: unknown, level = 0): string => {
  const indent = "  ".repeat(level);
  const nextIndent = "  ".repeat(level + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }

    const items = value
      .map((item) => `${nextIndent}${formatPythonValue(item, level + 1)}`)
      .join(",\n");

    return `[\n${items}\n${indent}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(
        ([key, entryValue]) =>
          `${nextIndent}${JSON.stringify(key)}: ${formatPythonValue(
            entryValue,
            level + 1,
          )}`,
      )
      .join(",\n");

    return `{\n${entries}\n${indent}}`;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "None";
  }

  if (value === null || value === undefined) {
    return "None";
  }

  return JSON.stringify(String(value));
};

export default function PelunasanPenjualanGenerator() {
  const currentYear = String(new Date().getFullYear());
  const [rawText, setRawText] = useState("");
  const [outputYear, setOutputYear] = useState(currentYear);
  const [rows, setRows] = useState<RawRow[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const settlementGroups = useMemo(
    () => buildSettlementGroups(rows, outputYear),
    [rows, outputYear],
  );

  const pythonCollection = useMemo(
    () => formatPythonValue(settlementGroups),
    [settlementGroups],
  );

  const handleProcess = () => {
    setError("");
    setCopied(false);

    const parsedRows = parsePastedPivot(rawText);
    if (!parsedRows.length) {
      setRows([]);
      setError("Data belum terbaca. Pastikan paste tabel pivot lengkap dengan header Tanggal Setor.");
      return;
    }

    setRows(parsedRows);
  };

  const handleClear = () => {
    setRawText("");
    setRows([]);
    setError("");
    setCopied(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(pythonCollection);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Gagal copy ke clipboard. Browser mungkin belum mengizinkan akses clipboard.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <GeneratorNavbar active="pelunasan-penjualan" />

        <div>
          <h1 className="text-2xl font-semibold">
            Generator Pelunasan Penjualan
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Paste tabel pivot total setor, lalu generate Python collection per tanggal pelunasan.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
            <ClipboardPaste className="h-4 w-4" />
            Paste data pivot dari Excel
          </div>

          <textarea
            value={rawText}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setRawText(event.target.value)
            }
            placeholder="Paste tabel pivot di sini, termasuk header Tanggal Setor sampai Grand Total."
            className="h-72 w-full resize-y rounded-2xl border bg-slate-50 p-4 font-mono text-sm outline-none focus:border-slate-400 focus:bg-white"
          />

          <label className="mt-4 block text-sm font-medium text-slate-700">
            Tahun Output Tanggal
            <input
              value={outputYear}
              onChange={(event) => setOutputYear(event.target.value)}
              className="mt-1 w-40 rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:border-slate-400"
              placeholder="2026"
            />
          </label>

          {error ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleProcess}
              disabled={!rawText.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Proses Data
            </button>

            <button
              type="button"
              onClick={handleCopy}
              disabled={!settlementGroups.length}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ClipboardCopy className="h-4 w-4" />
              {copied ? "Tersalin" : "Copy Python Collection"}
            </button>

            <button
              type="button"
              onClick={() => setRawText(SAMPLE_INPUT)}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-700"
            >
              Pakai Contoh
            </button>

            <button
              type="button"
              onClick={handleClear}
              disabled={!rawText && !rows.length}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              Bersihkan
            </button>
          </div>

          {rows.length > 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              Data mentah terbaca: <span className="font-medium">{rows.length}</span>{" "}
              baris. Tanggal hasil:{" "}
              <span className="font-medium">{settlementGroups.length}</span>.
            </p>
          ) : null}
        </div>

        {settlementGroups.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Preview groups={settlementGroups} />
            <div className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="font-semibold">Python Collection</h2>
              <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
                {pythonCollection}
              </pre>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Preview({ groups }: { groups: SettlementGroup[] }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Preview Ringkas</h2>
      <div className="mt-4 space-y-4">
        {groups.slice(0, 5).map((group) => {
          const transactionCount = group["Pelunasan Penjualan"].reduce(
            (total, customer) => total + customer.Transaksi.length,
            0,
          );
          const grandTotal = group["Pelunasan Penjualan"].reduce(
            (total, customer) =>
              total +
              customer.Transaksi.reduce(
                (subtotal, transaction) => subtotal + transaction.Nominal,
                0,
              ),
            0,
          );

          return (
            <div
              key={group["Tanggal Pelunasan"]}
              className="rounded-xl border bg-slate-50 p-4 text-sm"
            >
              <div className="font-medium">{group["Tanggal Pelunasan"]}</div>
              <div className="mt-2 text-slate-600">
                Customer: {group["Pelunasan Penjualan"].length} customer
              </div>
              <div className="text-slate-600">
                Transaksi: {transactionCount} transaksi
              </div>
              <div className="text-slate-600">
                Grand total: {grandTotal.toLocaleString("id-ID")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
