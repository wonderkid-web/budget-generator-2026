"use client";

import { useEffect, useMemo, useState } from "react";

type OutputRow = {
  "Budget Name": string;
  "Start Date": string;
  "End Date": string;
  Company: string;
  "Budget Lines/Budgetary Position": string;
  "Budget Lines/Analytic Account": string;
  "Budget Lines/Start Date": string;
  "Budget Lines/End Date": string;
  "Budget Lines/Planned Amount": number;
};

type OutputHeader = keyof OutputRow;

type TransformOptions = {
  budgetName: string;
  startDate: string;
  endDate: string;
  company: string;
  forceNegative: boolean;
  fillEmptyNominalWithZero: boolean;
  useCostCenter: boolean;
  costCenter: string;
};

type ExportFormat = "excel" | "csv" | "pdf";

const MONTH_COUNT = 12;

const OUTPUT_HEADERS_WITHOUT_COST_CENTER: OutputHeader[] = [
  "Budget Name",
  "Start Date",
  "End Date",
  "Company",
  "Budget Lines/Budgetary Position",
  "Budget Lines/Start Date",
  "Budget Lines/End Date",
  "Budget Lines/Planned Amount",
];

const OUTPUT_HEADERS_WITH_COST_CENTER: OutputHeader[] = [
  "Budget Name",
  "Start Date",
  "End Date",
  "Company",
  "Budget Lines/Budgetary Position",
  "Budget Lines/Analytic Account",
  "Budget Lines/Start Date",
  "Budget Lines/End Date",
  "Budget Lines/Planned Amount",
];

const getOutputHeaders = (useCostCenter: boolean): OutputHeader[] =>
  useCostCenter
    ? OUTPUT_HEADERS_WITH_COST_CENTER
    : OUTPUT_HEADERS_WITHOUT_COST_CENTER;

const SAMPLE_INPUT = [
  "NOMOR AKUN\tRINCIAN DESKRIPSI\tJan\tFeb\tMrt\tAprl\tMei\tJuni\tJuli\tAgt\tSept\tOkt\tNov\tDes",
  "51.03.01.0000.01\tBIAYA GAJI KARYAWAN\t452.367.726\t452.367.726\t452.367.726\t452.367.726\t452.367.726\t452.367.726\t452.367.726\t452.367.726\t452.367.726\t452.367.726\t452.367.726\t452.367.726",
  "51.03.02.0000.01\tBIAYA JAMSOSTEK\t23.870.610\t23.870.610\t23.870.610\t23.870.610\t23.870.610\t23.870.610\t23.870.610\t23.870.610\t23.870.610\t23.870.610\t23.870.610\t23.870.610",
].join("\n");

const COMPANY_OPTIONS = [
  "PT Berlian Inti Mekar - Palembang",
  "PT Berlian Inti Mekar - Rengat",
  "PT Berlian Inti Mekar - Siak",
  "PT DUMAI PARICIPTA ABADI",
  "PT INTAN SEJATI ANDALAN",
  "PT INTAN SEJATI ANDALAN - REFINERY",
  "PT Karya Mitra Andalan",
  "PT Karya Pratama NiagaJaya",
  "PT Mutiara Unggul Lestari",
  "PT Mahkota Group, Tbk",
] as const;

const padNumber = (value: number) => String(value).padStart(2, "0");

const getDelimiter = (line: string) => {
  if (line.includes("\t")) {
    return "\t";
  }
  if (line.includes(";")) {
    return ";";
  }
  return ",";
};

const parseAmount = (rawValue: string): number | null => {
  const trimmed = rawValue.trim();
  if (!trimmed || trimmed === "-" || trimmed === "--") {
    return null;
  }

  const sanitized = trimmed.replace(/[^\d,.-]/g, "");
  if (!sanitized || sanitized === "-" || sanitized === "--") {
    return null;
  }

  const hasComma = sanitized.includes(",");
  const hasDot = sanitized.includes(".");
  let normalized = sanitized;

  if (hasComma && hasDot) {
    normalized = sanitized.replace(/\./g, "").replace(",", ".");
  } else if (hasDot && !hasComma) {
    normalized = sanitized.replace(/\./g, "");
  } else if (hasComma && !hasDot) {
    normalized = sanitized.replace(",", ".");
  }

  const parsedValue = Number(normalized);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return parsedValue;
};

const MONTH_ALIASES: string[][] = [
  ["jan"],
  ["feb"],
  ["mrt", "mar"],
  ["apr", "aprl"],
  ["mei", "may"],
  ["jun", "juni"],
  ["jul", "juli"],
  ["agt", "agst", "agu", "aug"],
  ["sep", "sept"],
  ["okt", "oct"],
  ["nov"],
  ["des", "dec"],
];

const normalizeHeaderCell = (value: string) =>
  value.toLowerCase().replace(/[^a-z]/g, "");

const detectMonthColumnIndices = (columns: string[]): number[] | null => {
  const normalizedColumns = columns.map((column) => normalizeHeaderCell(column));

  const detected = MONTH_ALIASES.map((aliases) =>
    normalizedColumns.findIndex((column) =>
      aliases.some((alias) => column.startsWith(alias)),
    ),
  );

  if (detected.every((index) => index >= 0)) {
    return detected;
  }

  return null;
};

const getFallbackMonthColumnIndices = (columnCount: number): number[] => {
  if (columnCount >= MONTH_COUNT + 2) {
    const startIndex = columnCount - MONTH_COUNT;
    return Array.from({ length: MONTH_COUNT }, (_, index) => startIndex + index);
  }

  return Array.from({ length: MONTH_COUNT }, (_, index) => index + 2);
};

const getLastDayOfMonth = (year: number, month: number) =>
  new Date(year, month, 0).getDate();

const formatDate = (year: number, month: number, day: number) =>
  `${year}-${padNumber(month)}-${padNumber(day)}`;

const escapeCsvValue = (value: string | number) => {
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

const rowsToCsv = (rows: OutputRow[], headers: OutputHeader[]) => {
  const csvLines = [headers.join(",")];
  for (const row of rows) {
    const line = headers.map((header) => escapeCsvValue(row[header])).join(
      ",",
    );
    csvLines.push(line);
  }
  return csvLines.join("\n");
};

const escapeHtml = (value: string | number) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const rowsToHtmlTable = (rows: OutputRow[], headers: OutputHeader[]) => {
  const headerHtml = headers.map(
    (header) => `<th>${escapeHtml(header)}</th>`,
  ).join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = headers.map(
        (header) => `<td>${escapeHtml(row[header])}</td>`,
      ).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
};

const escapeXml = (value: string | number) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const encodeUtf8 = (value: string) => new TextEncoder().encode(value);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      if ((crc & 1) !== 0) {
        crc = 0xedb88320 ^ (crc >>> 1);
      } else {
        crc >>>= 1;
      }
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

const crc32 = (value: Uint8Array) => {
  let crc = 0xffffffff;
  for (const currentByte of value) {
    crc = CRC32_TABLE[(crc ^ currentByte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const concatUint8Arrays = (parts: Uint8Array[]) => {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }

  return result;
};

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const createZipArchive = (entries: ZipEntry[]) => {
  const localSections: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let localOffset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const fileNameBytes = encodeUtf8(entry.name);
    const entryCrc32 = crc32(entry.data);

    const localHeader = new Uint8Array(30 + fileNameBytes.length);
    const localHeaderView = new DataView(localHeader.buffer);
    localHeaderView.setUint32(0, 0x04034b50, true);
    localHeaderView.setUint16(4, 20, true);
    localHeaderView.setUint16(6, 0, true);
    localHeaderView.setUint16(8, 0, true);
    localHeaderView.setUint16(10, 0, true);
    localHeaderView.setUint16(12, 0, true);
    localHeaderView.setUint32(14, entryCrc32, true);
    localHeaderView.setUint32(18, entry.data.length, true);
    localHeaderView.setUint32(22, entry.data.length, true);
    localHeaderView.setUint16(26, fileNameBytes.length, true);
    localHeaderView.setUint16(28, 0, true);
    localHeader.set(fileNameBytes, 30);

    localSections.push(localHeader, entry.data);

    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    const centralHeaderView = new DataView(centralHeader.buffer);
    centralHeaderView.setUint32(0, 0x02014b50, true);
    centralHeaderView.setUint16(4, 20, true);
    centralHeaderView.setUint16(6, 20, true);
    centralHeaderView.setUint16(8, 0, true);
    centralHeaderView.setUint16(10, 0, true);
    centralHeaderView.setUint16(12, 0, true);
    centralHeaderView.setUint16(14, 0, true);
    centralHeaderView.setUint32(16, entryCrc32, true);
    centralHeaderView.setUint32(20, entry.data.length, true);
    centralHeaderView.setUint32(24, entry.data.length, true);
    centralHeaderView.setUint16(28, fileNameBytes.length, true);
    centralHeaderView.setUint16(30, 0, true);
    centralHeaderView.setUint16(32, 0, true);
    centralHeaderView.setUint16(34, 0, true);
    centralHeaderView.setUint16(36, 0, true);
    centralHeaderView.setUint32(38, 0, true);
    centralHeaderView.setUint32(42, localOffset, true);
    centralHeader.set(fileNameBytes, 46);
    centralDirectory.push(centralHeader);

    localOffset += localHeader.length + entry.data.length;
    centralSize += centralHeader.length;
  }

  const endOfCentralDirectory = new Uint8Array(22);
  const endOfCentralDirectoryView = new DataView(endOfCentralDirectory.buffer);
  endOfCentralDirectoryView.setUint32(0, 0x06054b50, true);
  endOfCentralDirectoryView.setUint16(4, 0, true);
  endOfCentralDirectoryView.setUint16(6, 0, true);
  endOfCentralDirectoryView.setUint16(8, entries.length, true);
  endOfCentralDirectoryView.setUint16(10, entries.length, true);
  endOfCentralDirectoryView.setUint32(12, centralSize, true);
  endOfCentralDirectoryView.setUint32(16, localOffset, true);
  endOfCentralDirectoryView.setUint16(20, 0, true);

  return concatUint8Arrays([
    ...localSections,
    ...centralDirectory,
    endOfCentralDirectory,
  ]);
};

const toExcelColumnName = (columnIndex: number) => {
  let value = columnIndex + 1;
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
};

const rowsToXlsxBytes = (rows: OutputRow[], headers: OutputHeader[]) => {
  const headerRow = headers.map((header) => String(header));
  const dataRows = rows.map((row) => headers.map((header) => row[header]));
  const sheetRows: Array<Array<string | number>> = [headerRow, ...dataRows];

  const sheetDataXml = sheetRows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cellsXml = row
        .map((cellValue, columnIndex) => {
          const cellReference = `${toExcelColumnName(columnIndex)}${rowNumber}`;
          if (typeof cellValue === "number" && Number.isFinite(cellValue)) {
            return `<c r="${cellReference}"><v>${cellValue}</v></c>`;
          }
          return `<c r="${cellReference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cellValue)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cellsXml}</row>`;
    })
    .join("");

  const worksheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${sheetDataXml}</sheetData>` +
    `</worksheet>`;

  const workbookXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const workbookRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const packageRelsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>` +
    `</Relationships>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;

  const appPropertiesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ` +
    `xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">` +
    `<Application>Budget Generator</Application>` +
    `</Properties>`;

  const nowIsoString = new Date().toISOString();
  const corePropertiesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:dcmitype="http://purl.org/dc/dcmitype/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:creator>Budget Generator</dc:creator>` +
    `<cp:lastModifiedBy>Budget Generator</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${nowIsoString}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${nowIsoString}</dcterms:modified>` +
    `</cp:coreProperties>`;

  const zipEntries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: encodeUtf8(contentTypesXml) },
    { name: "_rels/.rels", data: encodeUtf8(packageRelsXml) },
    { name: "docProps/app.xml", data: encodeUtf8(appPropertiesXml) },
    { name: "docProps/core.xml", data: encodeUtf8(corePropertiesXml) },
    { name: "xl/workbook.xml", data: encodeUtf8(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: encodeUtf8(workbookRelsXml) },
    { name: "xl/styles.xml", data: encodeUtf8(stylesXml) },
    { name: "xl/worksheets/sheet1.xml", data: encodeUtf8(worksheetXml) },
  ];

  return createZipArchive(zipEntries);
};

const toBudgetYear = (startDate: string) => {
  const year = Number(startDate.slice(0, 4));
  if (Number.isInteger(year) && year > 0) {
    return year;
  }
  return new Date().getFullYear();
};

const getDefaultPeriodByCurrentYear = () => {
  const currentYear = new Date().getFullYear();
  return {
    defaultStartDate: `${currentYear}-01-01`,
    defaultEndDate: `${currentYear}-12-31`,
  };
};

const toSafeFileName = (value: string) => {
  const safeValue = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return safeValue || "budget-export";
};

const downloadBlob = (content: BlobPart, mimeType: string, fileName: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const openPdfPrintDialog = (
  rows: OutputRow[],
  title: string,
  headers: OutputHeader[],
) => {
  const popup = window.open("", "_blank");
  if (!popup) {
    return false;
  }

  const tableHtml = rowsToHtmlTable(rows, headers);
  popup.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body>${tableHtml}</body></html>`,
  );
  popup.document.close();
  popup.focus();
  popup.print();
  return true;
};

const transformBudgetData = (
  sourceText: string,
  options: TransformOptions,
): OutputRow[] => {
  const lines = sourceText.split(/\r?\n/);
  const budgetYear = toBudgetYear(options.startDate);
  const transformed: OutputRow[] = [];
  let hasWrittenBudgetMeta = false;
  let monthColumnIndices: number[] | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    const delimiter = getDelimiter(trimmedLine);
    const columns = trimmedLine.split(delimiter).map((column) => column.trim());
    if (columns.length < 3) {
      continue;
    }

    if (!monthColumnIndices) {
      monthColumnIndices = detectMonthColumnIndices(columns);
    }

    const lowerLine = trimmedLine.toLowerCase();
    if (
      lowerLine.includes("nomor akun") ||
      lowerLine.includes("rincian deskripsi") ||
      lowerLine.includes("target")
    ) {
      continue;
    }

    const budgetaryPosition = columns[1];
    if (!budgetaryPosition) {
      continue;
    }

    const resolvedMonthColumnIndices =
      monthColumnIndices ?? getFallbackMonthColumnIndices(columns.length);

    for (let monthIndex = 0; monthIndex < MONTH_COUNT; monthIndex += 1) {
      const amountIndex = resolvedMonthColumnIndices[monthIndex];
      const parsedAmount = parseAmount(columns[amountIndex] ?? "");
      if (parsedAmount === null && !options.fillEmptyNominalWithZero) {
        continue;
      }

      const amount =
        parsedAmount === null && options.fillEmptyNominalWithZero
          ? 0
          : (parsedAmount ?? 0);

      if (amount === 0 && !options.fillEmptyNominalWithZero) {
        continue;
      }

      const month = monthIndex + 1;
      const startDay = formatDate(budgetYear, month, 1);
      const endDay = formatDate(
        budgetYear,
        month,
        getLastDayOfMonth(budgetYear, month),
      );
      const normalizedAmount = Math.abs(amount);
      const plannedAmount = options.forceNegative
        ? -normalizedAmount
        : normalizedAmount;

      transformed.push({
        "Budget Name": hasWrittenBudgetMeta ? "" : options.budgetName,
        "Start Date": hasWrittenBudgetMeta ? "" : options.startDate,
        "End Date": hasWrittenBudgetMeta ? "" : options.endDate,
        "Company": hasWrittenBudgetMeta ? "" : options.company,
        "Budget Lines/Budgetary Position": budgetaryPosition,
        "Budget Lines/Analytic Account": options.useCostCenter
          ? options.costCenter
          : "",
        "Budget Lines/Start Date": startDay,
        "Budget Lines/End Date": endDay,
        "Budget Lines/Planned Amount": plannedAmount,
      });
      hasWrittenBudgetMeta = true;
    }
  }

  return transformed;
};

export default function Home() {
  const { defaultStartDate, defaultEndDate } = getDefaultPeriodByCurrentYear();
  const currentYear = new Date().getFullYear();
  const defaultCompany = "PT Karya Pratama NiagaJaya";
  const [sourceText, setSourceText] = useState("");
  const [company, setCompany] = useState<string>(defaultCompany);
  const autoBudgetName = `Budget ${company} ${currentYear}`;
  const [budgetName, setBudgetName] = useState(
    `Budget ${defaultCompany} ${currentYear}`,
  );
  const [isBudgetNameEdited, setIsBudgetNameEdited] = useState(false);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [forceNegative, setForceNegative] = useState(false);
  const [fillEmptyNominalWithZero, setFillEmptyNominalWithZero] = useState(false);
  const [useCostCenter, setUseCostCenter] = useState(false);
  const [costCenter, setCostCenter] = useState("");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("excel");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isBudgetNameEdited) {
      setBudgetName(autoBudgetName);
    }
  }, [autoBudgetName, isBudgetNameEdited]);

  const outputHeaders = useMemo(
    () => getOutputHeaders(useCostCenter),
    [useCostCenter],
  );

  const transformedRows = useMemo(
    () =>
      transformBudgetData(sourceText, {
        budgetName,
        startDate,
        endDate,
        company,
        forceNegative,
        fillEmptyNominalWithZero,
        useCostCenter,
        costCenter,
      }),
    [
      sourceText,
      budgetName,
      startDate,
      endDate,
      company,
      forceNegative,
      fillEmptyNominalWithZero,
      useCostCenter,
      costCenter,
    ],
  );

  const handleExport = () => {
    if (transformedRows.length === 0) {
      setNotice("Belum ada data yang bisa di-export.");
      return;
    }

    const baseName = toSafeFileName(budgetName);

    if (exportFormat === "csv") {
      const csvContent = rowsToCsv(transformedRows, outputHeaders);
      downloadBlob(
        `\uFEFF${csvContent}`,
        "text/csv;charset=utf-8;",
        `${baseName}.csv`,
      );
      setNotice(`Sukses export CSV (${transformedRows.length} baris).`);
      return;
    }

    if (exportFormat === "excel") {
      const xlsxBytes = rowsToXlsxBytes(transformedRows, outputHeaders);
      downloadBlob(
        xlsxBytes,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        `${baseName}.xlsx`,
      );
      setNotice(`Sukses export Excel (${transformedRows.length} baris).`);
      return;
    }

    const opened = openPdfPrintDialog(transformedRows, budgetName, outputHeaders);
    if (!opened) {
      setNotice("Popup diblokir browser. Izinkan popup lalu coba lagi.");
      return;
    }
    setNotice("Jendela print terbuka. Pilih Save as PDF untuk menyimpan.");
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">
            Budget Generator
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Paste data tabel sumber lalu export ke format yang kamu pilih.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Input Data Sumber</h2>
            <p className="mt-1 text-sm text-slate-600">
              Format kolom: Nomor Akun, Rincian Deskripsi, Jan-Des.
            </p>

            <textarea
              rows={14}
              className="mt-4 min-h-72 w-full rounded-xl border border-slate-300 p-3 text-sm outline-none focus:border-slate-500"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder="Paste data di sini (tab-separated dari Excel)"
            />

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                onClick={() => setSourceText(SAMPLE_INPUT)}
              >
                Gunakan Contoh
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"
                onClick={() => setSourceText("")}
              >
                Kosongkan
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Konfigurasi Output</h2>
            <div className="mt-4 grid gap-3">
              <label className="text-sm font-medium text-slate-700">
                Budget Name
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={budgetName}
                  onChange={(event) => {
                    const nextBudgetName = event.target.value;
                    setBudgetName(nextBudgetName);
                    setIsBudgetNameEdited(nextBudgetName !== autoBudgetName);
                  }}
                />
              </label>

              <label className="text-sm font-medium text-slate-700">
                Company
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                >
                  {COMPANY_OPTIONS.map((companyOption) => (
                    <option key={companyOption} value={companyOption}>
                      {companyOption}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Start Date
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  End Date
                  <input
                    type="date"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </label>
              </div>

              <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={forceNegative}
                  onChange={(event) => setForceNegative(event.target.checked)}
                />
                Nominal Negative
              </label>

              <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={fillEmptyNominalWithZero}
                  onChange={(event) =>
                    setFillEmptyNominalWithZero(event.target.checked)
                  }
                />
                Nominal kosong jadi 0 (kalau off akan di-skip)
              </label>

              <label className="mt-1 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={useCostCenter}
                  onChange={(event) => setUseCostCenter(event.target.checked)}
                />
                Pakai Cost Center
              </label>

              {useCostCenter ? (
                <label className="text-sm font-medium text-slate-700">
                  Cost Center
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={costCenter}
                    onChange={(event) => setCostCenter(event.target.value)}
                    placeholder="Contoh: CC-001"
                  />
                </label>
              ) : null}
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-700">Format Export</h3>
              <div className="mt-2 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="export-format"
                    value="excel"
                    checked={exportFormat === "excel"}
                    onChange={() => setExportFormat("excel")}
                  />
                  Excel
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="export-format"
                    value="csv"
                    checked={exportFormat === "csv"}
                    onChange={() => setExportFormat("csv")}
                  />
                  CSV
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="export-format"
                    value="pdf"
                    checked={exportFormat === "pdf"}
                    onChange={() => setExportFormat("pdf")}
                  />
                  PDF
                </label>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              Total hasil transform:{" "}
              <span className="font-semibold">{transformedRows.length}</span>{" "}
              baris
            </div>

            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
              onClick={handleExport}
              disabled={transformedRows.length === 0}
            >
              Export
            </button>

            {notice ? <p className="mt-3 text-sm text-slate-700">{notice}</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Preview Hasil (20 baris)</h2>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100">
                <tr>
                  {outputHeaders.map((header) => (
                    <th
                      key={header}
                      className="whitespace-nowrap border-b border-slate-200 px-3 py-2 font-semibold"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transformedRows.slice(0, 20).map((row, index) => (
                  <tr
                    key={`${row["Budget Lines/Budgetary Position"]}-${row["Budget Lines/Start Date"]}-${index}`}
                  >
                    {outputHeaders.map((header) => (
                      <td
                        key={header}
                        className="whitespace-nowrap border-b border-slate-100 px-3 py-2"
                      >
                        {row[header]}
                      </td>
                    ))}
                  </tr>
                ))}
                {transformedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={outputHeaders.length}
                      className="px-3 py-6 text-center text-slate-500"
                    >
                      Belum ada data hasil transform.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
