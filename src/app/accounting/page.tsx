"use client";
import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertCircle, ClipboardCopy, ClipboardPaste, Download, Trash2 } from "lucide-react";
import { GeneratorNavbar } from "../_components/GeneratorNavbar";

type RowData = Record<string, unknown>;

type PreviewTableProps = {
  title: string;
  data: RowData[];
  onDownload: () => void;
  onCopy: () => Promise<void>;
};

export default function ExcelGeneratorPembelianPenjualan() {
  const [rawText, setRawText] = useState<string>("");
  const [rows, setRows] = useState<RowData[]>([]);
  const [error, setError] = useState<string>("");

  const normalizeKey = (key: string): string =>
    String(key || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const findValue = (row: RowData, possibleKeys: string[]): unknown => {
    const normalizedRow: Record<string, unknown> = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
    );

    for (const key of possibleKeys) {
      const found = normalizedRow[normalizeKey(key)];
      if (found !== undefined && found !== null) return found;
    }

    return "";
  };

  const cleanNumber = (value: unknown): number | string => {
    if (value === undefined || value === null || value === "") return "";

    if (typeof value === "number") return value;

    let text = String(value)
      .replace(/rp/gi, "")
      .replaceAll(" ", "")
      .replaceAll("\t", "")
      .trim();

    if (text.includes(",")) {
      text = text.split(",")[0];
    }

    const onlyNumber = text.split(".").join("");
    const parsed = Number(onlyNumber);

    return Number.isNaN(parsed) ? String(value) : parsed;
  };

  const isDittoValue = (value: unknown): boolean => {
    const text = String(value ?? "").trim();
    return text !== "" && /^["'“”]+$/.test(text);
  };

  const hasActualValue = (value: unknown): boolean => {
    const text = String(value ?? "").trim();
    return text !== "" && !isDittoValue(text);
  };

  const hasAnyActualValue = (row: RowData, possibleKeyGroups: string[][]): boolean => {
    return possibleKeyGroups.some((possibleKeys) => hasActualValue(findValue(row, possibleKeys)));
  };

  const applyDittoValuesFromPreviousRow = (dataRows: RowData[]): RowData[] => {
    let previousRow: RowData = {};

    return dataRows.map((row) => {
      const normalizedRow: RowData = {};

      for (const [key, value] of Object.entries(row)) {
        normalizedRow[key] = isDittoValue(value) ? (previousRow[key] ?? "") : value;
      }

      previousRow = normalizedRow;
      return normalizedRow;
    });
  };

  const parsePastedExcel = (text: string): RowData[] => {
    const lines = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line) => line.trim() !== "");

    if (lines.length < 2) return [];

    const headers = lines[0].split("\t").map((header) => header.trim());

    return lines.slice(1).map((line) => {
      const cells = line.split("\t");
      const row: RowData = {};

      headers.forEach((header, index) => {
        row[header] = cells[index]?.trim() ?? "";
      });

      return row;
    });
  };

  const handleConvert = () => {
    setError("");

    const parsedRows = parsePastedExcel(rawText);

    if (!parsedRows.length) {
      setRows([]);
      setError("Data belum terbaca. Paste data dari Excel harus menyertakan header kolom.");
      return;
    }

    setRows(parsedRows);
  };

  const handleClear = () => {
    setRawText("");
    setRows([]);
    setError("");
  };

  const pembelianRows = useMemo<RowData[]>(() => {
    return rows
      .filter((row) =>
        hasAnyActualValue(row, [
          ["No. Bukti", "No Bukti"],
          ["Q Beli(Kg)", "Q Beli", "Q Beli (Kg)"],
          ["Harga Beli @", "Harga Beli"],
          ["Total Pembelian (Rp)", "Total Pembelian", "Pembelian (Rp)"],
        ])
      )
      .map((row) => ({
        "Tgl. Pembelian": findValue(row, ["Tgl. Faktur", "Tanggal Faktur"]),
        "Kode Supplier": findValue(row, ["PT"]),
        "Kode Referensi": findValue(row, ["No. Bukti", "No Bukti"]),
        Qty: cleanNumber(findValue(row, ["Q Beli(Kg)", "Q Beli", "Q Beli (Kg)"])),
        "Price @": cleanNumber(findValue(row, ["Harga Beli @", "Harga Beli"])),
        "Sub. Total": cleanNumber(
          findValue(row, ["Total Pembelian (Rp)", "Total Pembelian", "Pembelian (Rp)"])
        ),
      }));
  }, [rows]);

  const penjualanRows = useMemo<RowData[]>(() => {
    const rowsWithSplitTransactionValues = applyDittoValuesFromPreviousRow(rows);

    return rowsWithSplitTransactionValues
      .filter((row) =>
        hasAnyActualValue(row, [
          ["No. Faktur", "No Faktur"],
          ["Q Jual (Kg)", "Q Jual", "Q Jual(Kg)"],
          ["Harga Jual @", "Harga Jual"],
          ["Total Penjualan (Rp)", "Total Penjualan", " Total Penjualan (Rp) "],
        ])
      )
      .map((row) => ({
        "Nomor Penjualan": findValue(row, ["No. Faktur", "No Faktur"]),
        "Tgl. Penjualan": findValue(row, ["Tgl. Faktur", "Tanggal Faktur"]),
        "Code Customer": findValue(row, ["NPWP/KTP", "NPWP", "KTP"]),
        Qty: cleanNumber(findValue(row, ["Q Jual (Kg)", "Q Jual", "Q Jual(Kg)"])),
        "Price @": cleanNumber(findValue(row, ["Harga Jual @", "Harga Jual"])),
        Total: cleanNumber(
          findValue(row, ["Total Penjualan (Rp)", "Total Penjualan", " Total Penjualan (Rp) "])
        ),
      }));
  }, [rows]);

  const autoFitColumns = (data: RowData[]) => {
    const headers = Object.keys(data[0] || {});
    return headers.map((header) => {
      const maxLength = Math.max(
        header.length,
        ...data.map((row) => String(row[header] ?? "").length)
      );
      return { wch: Math.min(Math.max(maxLength + 2, 12), 35) };
    });
  };

  const downloadResult = () => {
    if (!rows.length) return;

    const workbook = XLSX.utils.book_new();

    const pembelianSheet = XLSX.utils.json_to_sheet(pembelianRows);
    pembelianSheet["!cols"] = autoFitColumns(pembelianRows);

    const penjualanSheet = XLSX.utils.json_to_sheet(penjualanRows);
    penjualanSheet["!cols"] = autoFitColumns(penjualanRows);

    XLSX.utils.book_append_sheet(workbook, pembelianSheet, "Pembelian");
    XLSX.utils.book_append_sheet(workbook, penjualanSheet, "Penjualan");

    XLSX.writeFile(workbook, "hasil-konversi-pembelian-penjualan.xlsx");
  };

  const downloadSingleSheet = (data: RowData[], sheetName: string, fileName: string) => {
    if (!data.length) return;

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(data);
    sheet["!cols"] = autoFitColumns(data);

    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
    XLSX.writeFile(workbook, fileName);
  };

  const formatPythonValue = (value: unknown): string => {
    if (value === undefined || value === null) return "None";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "None";
    return JSON.stringify(String(value));
  };

  const toPythonCollection = (data: RowData[]): string => {
    const newLine = String.fromCharCode(10);
    const lines: string[] = ["["];

    data.forEach((row, rowIndex) => {
      const entries = Object.entries(row).map(
        ([key, value]) => `    ${JSON.stringify(key)}: ${formatPythonValue(value)}`
      );

      lines.push("  {");
      lines.push(entries.join("," + newLine));
      lines.push(`  }${rowIndex === data.length - 1 ? "" : ","}`);
    });

    lines.push("]");
    return lines.join(newLine);
  };

  const copyAsPythonCollection = async (data: RowData[]) => {
    try {
      await navigator.clipboard.writeText(toPythonCollection(data));
    } catch {
      setError("Gagal copy ke clipboard. Browser mungkin belum mengizinkan akses clipboard.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <GeneratorNavbar active="accounting" />

        <div>
          <h1 className="text-2xl font-semibold">Generator Pembelian & Penjualan</h1>
          <p className="mt-1 text-sm text-slate-600">
            Copy data dari Excel, paste ke field, lalu sistem membuat 2 sheet: Pembelian dan Penjualan.
          </p>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
            <ClipboardPaste className="h-4 w-4" />
            Paste data mentah dari Excel
          </div>

          <textarea
            value={rawText}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setRawText(event.target.value)
            }
            placeholder="Copy dari Excel termasuk header kolom, lalu paste di sini."
            className="h-72 w-full resize-y rounded-2xl border bg-slate-50 p-4 font-mono text-sm outline-none focus:border-slate-400 focus:bg-white"
          />

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={handleConvert}
              disabled={!rawText.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Proses Data
            </button>

            <button
              onClick={downloadResult}
              disabled={!rows.length}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Download Excel
            </button>

            <button
              onClick={handleClear}
              disabled={!rawText && !rows.length}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              Bersihkan
            </button>
          </div>

          {rows.length > 0 && (
            <p className="mt-4 text-sm text-slate-600">
              Data terbaca: <span className="font-medium">{rows.length}</span> baris.
            </p>
          )}
        </div>

        {rows.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <PreviewTable
              title="Preview Pembelian"
              data={pembelianRows}
              onDownload={() =>
                downloadSingleSheet(pembelianRows, "Pembelian", "hasil-pembelian.xlsx")
              }
              onCopy={() => copyAsPythonCollection(pembelianRows)}
            />
            <PreviewTable
              title="Preview Penjualan"
              data={penjualanRows}
              onDownload={() =>
                downloadSingleSheet(penjualanRows, "Penjualan", "hasil-penjualan.xlsx")
              }
              onCopy={() => copyAsPythonCollection(penjualanRows)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewTable({ title, data, onDownload, onCopy }: PreviewTableProps) {
  const headers = Object.keys(data[0] || {});
  const previewRows = data.slice(0, 5);
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopy = async () => {
    await onCopy();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-slate-500">
            Preview 5 baris pertama dari {data.length} baris.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onDownload}
            disabled={!data.length}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Excel
          </button>

          <button
            onClick={handleCopy}
            disabled={!data.length}
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ClipboardCopy className="h-4 w-4" />
            {copied ? "Tersalin" : "Copy Python"}
          </button>
        </div>
      </div>

      <div className="overflow-auto rounded-xl border">
        <table className="w-full min-w-max text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-3 py-2 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, index) => (
              <tr key={index} className="border-t">
                {headers.map((header) => (
                  <td key={header} className="px-3 py-2">
                    {String(row[header] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
