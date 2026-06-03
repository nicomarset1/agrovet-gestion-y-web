import { requireAdmin } from "@/lib/auth";
import { getAdminSnapshot } from "@/lib/db";

function ascii(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function formatCurrency(cents: number) {
  return `$${new Intl.NumberFormat("es-AR").format(Math.round(cents / 100))}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function parsePayment(source: string) {
  const match = /Caja \/ ([^(]+)(?: \((\d+) cuotas\))?/i.exec(source);
  if (match) return match[1].trim().toLowerCase();
  if (source.toLowerCase().includes("mayorista")) return "mayorista";
  return source.toLowerCase().includes("tienda online") ? "web" : "otro";
}

type ReportOrder = Awaited<ReturnType<typeof getAdminSnapshot>>["orders"][number];

function orderHasBranch(order: ReportOrder, branchId: string) {
  return order.items.some((item) => {
    if (item.allocations?.length) return item.allocations.some((allocation) => String(allocation.branchId) === branchId);
    return String(order.branchId) === branchId;
  });
}

function getOrderBranchRevenueCents(order: ReportOrder, branchId: number) {
  const branchTotal = order.items.reduce((sum, item) => {
    const allocatedQuantity = item.allocations?.reduce((quantity, allocation) => {
      return quantity + (allocation.branchId === branchId ? allocation.quantity : 0);
    }, 0) ?? (order.branchId === branchId ? item.quantity : 0);
    return sum + allocatedQuantity * item.unitPriceCents;
  }, 0);
  return branchTotal || (order.branchId === branchId ? order.totalCents : 0);
}

function escapePdf(value: string) {
  return ascii(value).replace(/[()\\]/g, "\\$&");
}

type PdfCommand = string;

function drawText(text: string, x: number, y: number, size = 10, font: "regular" | "bold" = "regular", color = "0.086 0.243 0.204"): PdfCommand {
  return `BT ${color} rg /${font === "bold" ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdf(text)}) Tj ET`;
}

function drawRect(x: number, y: number, width: number, height: number, color: string, stroke?: string): PdfCommand {
  const strokeCommand = stroke ? `${stroke} RG ${color} rg ${x} ${y} ${width} ${height} re B` : `${color} rg ${x} ${y} ${width} ${height} re f`;
  return strokeCommand;
}

function wrapText(value: string, maxChars: number) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function buildPdf(pageCommands: string[][]) {
  const objects: string[] = [];
  const fontRegularId = 3 + pageCommands.length * 2;
  const fontBoldId = fontRegularId + 1;
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(`<< /Type /Pages /Kids [${pageCommands.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pageCommands.length} >>`);

  for (const commands of pageCommands) {
    const content = commands.join("\n");
    const pageObjectIndex = objects.length + 1;
    const contentObjectIndex = pageObjectIndex + 1;
    const pageObject = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${contentObjectIndex} 0 R >>`;
    objects.push(pageObject);
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  let output = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(output, "utf8"));
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(output, "utf8");
}

function buildSalesReportPdf(input: {
  month: string;
  branchLabel: string;
  channelLabel: string;
  paymentLabel: string;
  orders: ReportOrder[];
  totalCents: number;
  byBranch: Map<string, number>;
  byPayment: Map<string, number>;
  amountForOrder: (order: ReportOrder) => number;
}) {
  const pages: string[][] = [];
  const margin = 38;
  const pageWidth = 595;
  const contentWidth = pageWidth - margin * 2;
  const makeBasePage = (pageNumber: number) => [
    drawRect(0, 0, 595, 842, "0.965 0.976 0.945"),
    drawRect(0, 760, 595, 82, "0.086 0.243 0.204"),
    drawText("AGROVET", margin, 802, 22, "bold", "0.810 0.941 0.310"),
    drawText("Registro profesional de ventas", margin, 780, 13, "regular", "1 1 1"),
    drawText(`Emitido: ${formatDateTime(new Date().toISOString())}`, 400, 806, 9, "regular", "0.862 0.933 0.894"),
    drawText(`Pagina ${pageNumber}`, 505, 28, 9),
  ];
  const addSummaryCard = (commands: string[], x: number, y: number, width: number, title: string, value: string, note: string) => {
    commands.push(drawRect(x, y, width, 82, "1 1 1", "0.830 0.890 0.800"));
    commands.push(drawText(title.toUpperCase(), x + 16, y + 56, 8, "bold"));
    commands.push(drawText(value, x + 16, y + 30, 18, "bold", "0.086 0.243 0.204"));
    commands.push(drawText(note, x + 16, y + 14, 8));
  };

  let commands = makeBasePage(1);
  commands.push(drawText(`Periodo ${input.month}`, margin, 726, 18, "bold"));
  commands.push(drawText(`Sucursal: ${input.branchLabel}`, margin, 706, 10));
  commands.push(drawText(`Canal: ${input.channelLabel}   |   Pago: ${input.paymentLabel}`, margin, 690, 10));
  addSummaryCard(commands, margin, 590, 158, "Total", formatCurrency(input.totalCents), "Facturacion filtrada");
  addSummaryCard(commands, margin + 178, 590, 158, "Ventas", String(input.orders.length), "Operaciones incluidas");
  addSummaryCard(commands, margin + 356, 590, 158, "Promedio", formatCurrency(input.orders.length ? Math.round(input.totalCents / input.orders.length) : 0), "Ticket promedio");

  commands.push(drawText("Resumen por sucursal", margin, 548, 13, "bold"));
  let y = 526;
  const branchEntries = [...input.byBranch.entries()];
  if (!branchEntries.length) commands.push(drawText("Sin movimientos para los filtros seleccionados.", margin, y, 9));
  for (const [name, amount] of branchEntries.slice(0, 6)) {
    commands.push(drawText(name, margin, y, 9));
    commands.push(drawText(formatCurrency(amount), 455, y, 9, "bold"));
    commands.push(drawRect(margin, y - 8, contentWidth, 0.5, "0.830 0.890 0.800"));
    y -= 18;
  }

  commands.push(drawText("Resumen por medio de pago", margin, y - 12, 13, "bold"));
  y -= 34;
  const paymentEntries = [...input.byPayment.entries()];
  if (!paymentEntries.length) commands.push(drawText("Sin movimientos para los filtros seleccionados.", margin, y, 9));
  for (const [name, amount] of paymentEntries.slice(0, 6)) {
    commands.push(drawText(name, margin, y, 9));
    commands.push(drawText(formatCurrency(amount), 455, y, 9, "bold"));
    commands.push(drawRect(margin, y - 8, contentWidth, 0.5, "0.830 0.890 0.800"));
    y -= 18;
  }

  commands.push(drawText("Detalle de facturacion", margin, y - 18, 13, "bold"));
  y -= 44;
  const tableHeader = () => {
    commands.push(drawRect(margin, y - 6, contentWidth, 24, "0.898 0.949 0.875"));
    commands.push(drawText("Fecha", margin + 10, y + 2, 8, "bold"));
    commands.push(drawText("Codigo", margin + 82, y + 2, 8, "bold"));
    commands.push(drawText("Cliente / canal", margin + 154, y + 2, 8, "bold"));
    commands.push(drawText("Estado", margin + 365, y + 2, 8, "bold"));
    commands.push(drawText("Importe", margin + 455, y + 2, 8, "bold"));
    y -= 24;
  };
  tableHeader();

  const sortedOrders = [...input.orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (!sortedOrders.length) {
    commands.push(drawText("No hay ventas para los filtros seleccionados.", margin + 10, y, 10));
  }
  for (const order of sortedOrders) {
    if (y < 70) {
      pages.push(commands);
      commands = makeBasePage(pages.length + 1);
      y = 720;
      tableHeader();
    }
    const customerLines = wrapText(`${order.customerName} - ${order.source}`, 38);
    const statusLines = wrapText(order.status, 18);
    const rowHeight = Math.max(28, 14 + Math.max(customerLines.length, statusLines.length) * 10);
    commands.push(drawRect(margin, y - rowHeight + 8, contentWidth, rowHeight, "1 1 1", "0.895 0.920 0.880"));
    commands.push(drawText(formatDateTime(order.createdAt), margin + 10, y - 6, 8));
    commands.push(drawText(order.code, margin + 82, y - 6, 8, "bold"));
    customerLines.slice(0, 2).forEach((line, index) => commands.push(drawText(line, margin + 154, y - 6 - index * 10, 8)));
    statusLines.slice(0, 2).forEach((line, index) => commands.push(drawText(line, margin + 365, y - 6 - index * 10, 8)));
    commands.push(drawText(formatCurrency(input.amountForOrder(order)), margin + 455, y - 6, 9, "bold", "0.086 0.243 0.204"));
    y -= rowHeight + 4;
  }
  pages.push(commands);
  return buildPdf(pages);
}

export async function GET(request: Request) {
  await requireAdmin();
  const snapshot = await getAdminSnapshot();
  const url = new URL(request.url);
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const branch = url.searchParams.get("branch") || "all";
  const channel = url.searchParams.get("channel") || "all";
  const payment = url.searchParams.get("payment") || "all";
  const orders = snapshot.orders.filter((order) => {
    const orderMonth = order.createdAt.slice(0, 7);
    if (orderMonth !== month) return false;
    if (branch !== "all" && !orderHasBranch(order, branch)) return false;
    if (channel === "web" && !order.source.toLowerCase().includes("tienda online")) return false;
    if (channel === "store" && !order.source.toLowerCase().includes("caja")) return false;
    if (channel === "wholesale" && !order.source.toLowerCase().includes("mayorista")) return false;
    if (payment !== "all" && parsePayment(order.source) !== payment) return false;
    return true;
  });

  const selectedBranchId = branch !== "all" ? Number(branch) : null;
  const amountForOrder = (order: ReportOrder) => selectedBranchId ? getOrderBranchRevenueCents(order, selectedBranchId) : order.totalCents;
  const totalCents = orders.reduce((sum, order) => sum + amountForOrder(order), 0);
  const byBranch = new Map<string, number>();
  const byPayment = new Map<string, number>();
  for (const order of orders) {
    const reportBranches = selectedBranchId ? snapshot.branches.filter((item) => item.id === selectedBranchId) : snapshot.branches;
    for (const reportBranch of reportBranches) {
      const branchTotal = getOrderBranchRevenueCents(order, reportBranch.id);
      if (branchTotal > 0) byBranch.set(reportBranch.name, (byBranch.get(reportBranch.name) ?? 0) + branchTotal);
    }
    const method = parsePayment(order.source);
    byPayment.set(method, (byPayment.get(method) ?? 0) + amountForOrder(order));
  }

  const channelLabel = channel === "all" ? "Todos" : channel === "web" ? "Tienda online" : channel === "store" ? "Caja" : "Mayorista";
  const pdf = buildSalesReportPdf({
    month,
    branchLabel: branch === "all" ? "Todas" : snapshot.branches.find((item) => String(item.id) === branch)?.name ?? branch,
    channelLabel,
    paymentLabel: payment === "all" ? "Todos" : payment,
    orders,
    totalCents,
    byBranch,
    byPayment,
    amountForOrder,
  });
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=registro-${month}.pdf`,
    },
  });
}
