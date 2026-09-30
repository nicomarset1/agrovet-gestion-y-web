"use client";

// Panel de gestión: sección Clientes (mayoristas y pedidos por mayor).

import { ChevronRight, PackagePlus, Pencil, Search, Trash2, Users } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { Branch, OrderRecord, Product, WholesaleClient } from "@/lib/types";
import { createWholesaleClientAction, createWholesaleOrderAction, deleteWholesaleClientAction, updateOrderPaymentAction, updateWholesaleClientAction } from "@/app/gestion-agrovet/actions";
import { AdminModal, SectionHeader, buildAdminHref, formatAdminDateTime } from "@/components/admin/shared";
import { NumberInput } from "@/components/ui/form-controls";
import { Select } from "@/components/ui/select";

type WholesaleLine = {
  key: string;
  variantId: number;
  productName: string;
  brand: string;
  label: string;
  sku: string;
  barcode: string;
  priceCents: number;
  quantity: number;
  allocations: { branchId: number; quantity: number }[];
  stocks: Product["variants"][number]["stocks"];
};

function distributeWholesaleQuantity(quantity: number, stocks: WholesaleLine["stocks"], preferredBranchId: number) {
  const totalStock = stocks.reduce((sum, stock) => sum + stock.quantity, 0);
  const targetQuantity = Math.min(Math.max(1, quantity), Math.max(1, totalStock));
  const orderedStocks = [
    ...stocks.filter((stock) => stock.branchId === preferredBranchId),
    ...stocks.filter((stock) => stock.branchId !== preferredBranchId).sort((a, b) => b.quantity - a.quantity),
  ];
  let remaining = targetQuantity;
  const allocations: { branchId: number; quantity: number }[] = [];
  for (const stock of orderedStocks) {
    if (remaining <= 0) break;
    if (stock.quantity <= 0) continue;
    const allocated = Math.min(remaining, stock.quantity);
    allocations.push({ branchId: stock.branchId, quantity: allocated });
    remaining -= allocated;
  }
  return allocations;
}

function rebalanceWholesaleAllocation(line: WholesaleLine, branchId: number, requestedQuantity: number, branches: Branch[]) {
  const totalStock = line.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
  const totalQuantity = Math.min(line.quantity, totalStock);
  const branchStock = line.stocks.find((stock) => stock.branchId === branchId)?.quantity ?? 0;
  const selectedQuantity = Math.min(Math.max(0, requestedQuantity), Math.min(branchStock, totalQuantity));
  let remaining = totalQuantity - selectedQuantity;
  const nextAllocations = [{ branchId, quantity: selectedQuantity }];
  const otherBranches = branches
    .filter((branch) => branch.id !== branchId)
    .map((branch) => ({
      branchId: branch.id,
      current: line.allocations.find((allocation) => allocation.branchId === branch.id)?.quantity ?? 0,
      stock: line.stocks.find((stock) => stock.branchId === branch.id)?.quantity ?? 0,
    }))
    .sort((a, b) => b.current - a.current || b.stock - a.stock);
  for (const branch of otherBranches) {
    if (remaining <= 0) break;
    const quantity = Math.min(branch.stock, remaining);
    nextAllocations.push({ branchId: branch.branchId, quantity });
    remaining -= quantity;
  }
  return nextAllocations.filter((allocation) => allocation.quantity > 0).sort((a, b) => a.branchId - b.branchId);
}

const paymentMethodOptions = ["Cuenta corriente", "Efectivo", "Transferencia", "Tarjeta"].map((method) => ({ value: method, label: method }));
const installmentOptions = ["1", "2", "3", "6", "12"].map((count) => ({ value: count, label: count === "1" ? "1 cuota" : `${count} cuotas` }));

function formatWholesaleClientMeta(client: WholesaleClient) {
  return [client.contactName, client.phone, client.email, client.address, client.taxId].filter(Boolean).join(" | ") || "Sin datos adicionales";
}

export function WholesaleClientModal({ client, onClose, returnTo }: { client?: WholesaleClient; onClose: () => void; returnTo: string }) {
  return (
    <AdminModal onClose={onClose} subtitle="Datos comerciales para pedidos por mayor" title={client ? "Editar cliente" : "Nuevo cliente"}>
      <form action={client ? updateWholesaleClientAction : createWholesaleClientAction} className="admin-modal-form">
        {client ? <input name="id" type="hidden" value={client.id} /> : null}
        <input name="returnTo" type="hidden" value={returnTo} />
        <label className="admin-field">
          <span>Pet shop / Razón social</span>
          <input autoFocus className="field" defaultValue={client?.businessName ?? ""} name="businessName" required />
        </label>
        <label className="admin-field">
          <span>Contacto</span>
          <input className="field" defaultValue={client?.contactName ?? ""} name="contactName" />
        </label>
        <label className="admin-field">
          <span>Teléfono</span>
          <input className="field" defaultValue={client?.phone ?? ""} name="phone" />
        </label>
        <label className="admin-field">
          <span>Email</span>
          <input className="field" defaultValue={client?.email ?? ""} name="email" type="email" />
        </label>
        <label className="admin-field">
          <span>Dirección</span>
          <input className="field" defaultValue={client?.address ?? ""} name="address" />
        </label>
        <label className="admin-field">
          <span>CUIT / DNI</span>
          <input className="field" defaultValue={client?.taxId ?? ""} name="taxId" />
        </label>
        <label className="admin-field admin-span-2">
          <span>Notas</span>
          <textarea className="field" defaultValue={client?.notes ?? ""} name="notes" rows={3} />
        </label>
        <div className="admin-modal-actions admin-span-2">
          <button className="button button-light" onClick={onClose} type="button">Cancelar</button>
          <button className="button button-primary" type="submit">{client ? "Guardar cliente" : "Crear cliente"}</button>
        </div>
      </form>
    </AdminModal>
  );
}

export function WholesaleClientsPanel({
  basePath,
  branches,
  clients,
  onCreateClient,
  onDeleteOrder,
  onEditClient,
  orders,
  products,
  selectedBranch,
}: {
  basePath: string;
  branches: Branch[];
  clients: WholesaleClient[];
  onCreateClient: () => void;
  onDeleteOrder: (order: OrderRecord) => void;
  onEditClient: (client: WholesaleClient) => void;
  orders: OrderRecord[];
  products: Product[];
  selectedBranch: Branch;
}) {
  const [clientId, setClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<WholesaleLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("Cuenta corriente");
  const [installments, setInstallments] = useState("1");
  const [paidAmount, setPaidAmount] = useState("");
  const [view, setView] = useState<"order" | "clients">("order");
  const fieldId = useId();
  const variants = useMemo(() => products.flatMap((product) => product.variants.map((variant) => ({
    variant,
    product,
    search: `${product.brand} ${product.name} ${variant.label} ${variant.sku} ${variant.barcode}`.toLowerCase(),
  }))), [products]);
  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return variants.filter((entry) => entry.search.includes(value)).slice(0, 10);
  }, [query, variants]);
  const selectedClient = clients.find((client) => String(client.id) === clientId);
  const filteredClients = useMemo(() => {
    const value = clientQuery.trim().toLowerCase();
    if (!value) return clients;
    return clients.filter((client) => `${client.businessName} ${client.contactName} ${client.phone} ${client.email} ${client.address} ${client.taxId} ${client.notes}`.toLowerCase().includes(value));
  }, [clientQuery, clients]);
  const wholesaleOrders = orders.filter((order) => /^Mayorista\b/i.test(order.source));
  const pendingAccountOrders = wholesaleOrders.filter((order) => order.paymentMethod === "Cuenta corriente" && order.paidCents < order.totalCents);
  const paymentMethodValue = paymentMethod === "Tarjeta" ? `Tarjeta (${installments} cuotas)` : paymentMethod;
  const parsedPaidAmount = Math.max(0, Number(paidAmount) || 0);
  const addVariant = (entry: (typeof variants)[number]) => {
    setLines((current) => {
      const existing = current.find((line) => line.variantId === entry.variant.id);
      const totalStock = entry.variant.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
      if (totalStock <= 0) return current;
      if (existing) {
        const existingTotalStock = existing.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
        const quantity = Math.min(existing.quantity + 1, existingTotalStock);
        return current.map((line) => line.key === existing.key ? { ...line, quantity, allocations: distributeWholesaleQuantity(quantity, line.stocks, selectedBranch.id) } : line);
      }
      return [...current, {
        key: `${entry.variant.id}-${Date.now()}`,
        variantId: entry.variant.id,
        productName: entry.product.name,
        brand: entry.product.brand,
        label: entry.variant.label,
        sku: entry.variant.sku,
        barcode: entry.variant.barcode,
        priceCents: entry.variant.priceCents,
        quantity: 1,
        allocations: distributeWholesaleQuantity(1, entry.variant.stocks, selectedBranch.id),
        stocks: entry.variant.stocks,
      }];
    });
    setQuery("");
  };
  const submitSearch = () => {
    const value = query.trim().toLowerCase();
    if (!value) return;
    const exact = variants.find((entry) => entry.variant.barcode.toLowerCase() === value || entry.variant.sku.toLowerCase() === value);
    if (exact) addVariant(exact);
  };
  const totalCents = lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
  if (view === "clients") {
    return (
      <div className="admin-detail-stack">
        <SectionHeader
          action={(
            <div className="admin-row-actions">
              <button className="button button-light" onClick={() => setView("order")} type="button">Volver a pedidos</button>
              <button className="button button-primary" onClick={onCreateClient} type="button"><PackagePlus size={18} /> Nuevo cliente</button>
            </div>
          )}
          subtitle="Alta, edición y baja de clientes mayoristas"
          title="Clientes guardados"
        />
        <section className="card admin-panel">
          <div className="admin-product-list">
            {clients.length ? clients.map((client) => (
              <div className={`admin-table-row compact ${String(client.id) === clientId ? "active" : ""}`} key={client.id}>
                <button className="admin-title-button" onClick={() => { setClientId(String(client.id)); setClientQuery(""); setView("order"); }} type="button">
                  <div>
                    <strong>{client.businessName}</strong>
                    <small>{formatWholesaleClientMeta(client)}</small>
                  </div>
                </button>
                <div className="admin-row-actions">
                  <button className="icon-button" onClick={() => onEditClient(client)} type="button" aria-label="Editar cliente"><Pencil size={16} /></button>
                  <form action={deleteWholesaleClientAction}>
                    <input name="id" type="hidden" value={client.id} />
                    <input name="returnTo" type="hidden" value={buildAdminHref(basePath, { section: "clientes", branch: String(selectedBranch.id), detail: null, order: null })} />
                    <button className="icon-button danger" type="submit" aria-label="Eliminar cliente"><Trash2 size={16} /></button>
                  </form>
                </div>
              </div>
            )) : <p className="description">Todavía no hay clientes mayoristas cargados.</p>}
          </div>
        </section>
      </div>
    );
  }
  const unitCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const incompleteLines = lines.filter((line) => line.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0) !== line.quantity);
  const missingSteps = [
    clientId ? "" : "elegí un cliente",
    lines.length ? "" : "agregá al menos un producto",
    incompleteLines.length ? "completá la distribución por sucursal" : "",
  ].filter(Boolean);
  const clientesHref = buildAdminHref(basePath, { section: "clientes", branch: String(selectedBranch.id), detail: null, order: null });
  return (
    <div className="admin-detail-stack">
      <SectionHeader
        action={(
          <div className="admin-row-actions">
            <button className="button button-light" onClick={() => setView("clients")} type="button"><Users size={18} /> Clientes guardados</button>
            <button className="button button-primary" onClick={onCreateClient} type="button"><PackagePlus size={18} /> Nuevo cliente</button>
          </div>
        )}
        subtitle="Clientes mayoristas, pedidos grandes y descuento de stock por sucursal"
        title="Clientes"
      />
      <div className="admin-wholesale-layout">
        <section className="card admin-panel admin-wholesale-form" aria-labelledby="admin-wholesale-title">
          <h2 id="admin-wholesale-title">Crear pedido mayorista</h2>
          <form action={createWholesaleOrderAction} className="admin-wholesale-steps">
            <input name="returnTo" type="hidden" value={clientesHref} />
            <input name="clientId" type="hidden" value={clientId} />
            <input name="branchId" type="hidden" value={selectedBranch.id} />
            <div className="admin-wholesale-step">
              <label className="admin-wholesale-label" htmlFor={`${fieldId}-client`}><span className="admin-wholesale-number">1</span> Cliente</label>
              {selectedClient ? (
                <div className="admin-wholesale-client">
                  <div>
                    <strong>{selectedClient.businessName}</strong>
                    <small>{formatWholesaleClientMeta(selectedClient)}</small>
                  </div>
                  <button className="button button-light" onClick={() => setClientId("")} type="button">Cambiar</button>
                </div>
              ) : (
                <>
                  <div className="admin-scan-row">
                    <input
                      className="field"
                      id={`${fieldId}-client`}
                      onChange={(event) => setClientQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.preventDefault();
                      }}
                      placeholder="Nombre, teléfono, mail o CUIT..."
                      value={clientQuery}
                    />
                    <button aria-label="Ver clientes guardados" className="button button-light" onClick={() => setView("clients")} type="button"><Users size={18} /><span className="admin-wholesale-list-text">Ver lista</span></button>
                  </div>
                  {clientQuery.trim() ? (
                    <div className="admin-product-list admin-wholesale-results">
                      {filteredClients.length ? filteredClients.slice(0, 6).map((client) => (
                        <button
                          className="admin-table-row compact"
                          key={client.id}
                          onClick={() => {
                            setClientId(String(client.id));
                            setClientQuery("");
                          }}
                          type="button"
                        >
                          <div>
                            <strong>{client.businessName}</strong>
                            <small>{formatWholesaleClientMeta(client)}</small>
                          </div>
                          <ChevronRight size={16} />
                        </button>
                      )) : <p className="description">No hay clientes con esos datos.</p>}
                    </div>
                  ) : null}
                </>
              )}
            </div>
            <div className="admin-wholesale-step">
              <label className="admin-wholesale-label" htmlFor={`${fieldId}-product`}><span className="admin-wholesale-number">2</span> Productos</label>
              <div className="admin-scan-row">
                <input
                  className="field"
                  id={`${fieldId}-product`}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitSearch();
                    }
                  }}
                  placeholder="Producto, SKU o código de barras..."
                  value={query}
                />
                <button aria-label="Buscar producto" className="button button-primary" onClick={submitSearch} type="button"><Search size={18} /></button>
              </div>
              {results.length ? (
                <div className="admin-product-list admin-wholesale-results">
                  {results.map((entry) => (
                    <button className="admin-table-row compact" key={entry.variant.id} onClick={() => addVariant(entry)} type="button">
                      <div>
                        <strong>{entry.product.brand} {entry.product.name}</strong>
                        <small>{entry.variant.label} | SKU {entry.variant.sku} | Código {entry.variant.barcode}</small>
                      </div>
                      <span className="admin-stock-pill">{formatPrice(entry.variant.priceCents)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="admin-wholesale-lines">
                {lines.length ? lines.map((line) => {
                  const allocatedTotal = line.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
                  const totalStock = line.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
                  const lineName = `${line.brand} ${line.productName}`;
                  return (
                    <div className="admin-wholesale-line" key={line.key}>
                      <div className="admin-wholesale-line-head">
                        <div>
                          <strong>{lineName}</strong>
                          <small>{line.label} | SKU {line.sku} | stock total {totalStock}</small>
                        </div>
                        <strong className="admin-wholesale-line-total">{formatPrice(line.priceCents * line.quantity)}</strong>
                        <button className="icon-button danger" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} type="button" aria-label={`Quitar ${lineName}`}><Trash2 size={16} /></button>
                      </div>
                      <div className="admin-wholesale-line-controls">
                        <div className="admin-wholesale-qty">
                          <span>Cantidad</span>
                          <NumberInput
                            ariaLabel={`Cantidad de ${lineName}`}
                            max={totalStock}
                            min={1}
                            onChange={(next) => {
                              const quantity = Math.min(totalStock, Math.max(1, Number(next) || 1));
                              setLines((current) => current.map((item) => item.key === line.key ? {
                                ...item,
                                quantity,
                                allocations: distributeWholesaleQuantity(quantity, item.stocks, selectedBranch.id),
                              } : item));
                            }}
                            value={line.quantity}
                          />
                        </div>
                        {branches.map((branch) => {
                          const stock = line.stocks.find((entry) => entry.branchId === branch.id)?.quantity ?? 0;
                          const quantity = line.allocations.find((entry) => entry.branchId === branch.id)?.quantity ?? 0;
                          return (
                            <div className="admin-wholesale-qty" key={branch.id}>
                              <span>{branch.name} <small>stock {stock}</small></span>
                              <NumberInput
                                ariaLabel={`Unidades de ${lineName} desde ${branch.name}`}
                                disabled={stock <= 0}
                                max={stock}
                                min={0}
                                onChange={(next) => {
                                  const nextQuantity = Math.max(0, Number(next) || 0);
                                  setLines((current) => current.map((item) => {
                                    if (item.key !== line.key) return item;
                                    return { ...item, allocations: rebalanceWholesaleAllocation(item, branch.id, nextQuantity, branches) };
                                  }));
                                }}
                                value={quantity}
                              />
                            </div>
                          );
                        })}
                      </div>
                      {allocatedTotal !== line.quantity ? (
                        <small className="notice error">Distribución incompleta: {allocatedTotal} de {line.quantity} unidades asignadas.</small>
                      ) : null}
                      {line.allocations.map((allocation) => (
                        <div hidden key={`${line.key}-${allocation.branchId}`}>
                          <input name="itemVariantId" type="hidden" value={line.variantId} />
                          <input name="itemQuantity" type="hidden" value={allocation.quantity} />
                          <input name="itemBranchId" type="hidden" value={allocation.branchId} />
                        </div>
                      ))}
                    </div>
                  );
                }) : <p className="description">Agregá productos con el buscador o escaneando códigos de barras.</p>}
              </div>
            </div>
            <div className="admin-wholesale-step">
              <span className="admin-wholesale-label" id={`${fieldId}-payment`}><span className="admin-wholesale-number">3</span> Pago</span>
              <input name="paymentMethod" type="hidden" value={paymentMethodValue} />
              <div className="admin-wholesale-pay">
                <Select
                  ariaLabelledBy={`${fieldId}-payment`}
                  onChange={(next) => {
                    setPaymentMethod(next);
                    if (next !== "Cuenta corriente") setPaidAmount("");
                  }}
                  options={paymentMethodOptions}
                  value={paymentMethod}
                />
                {paymentMethod === "Tarjeta" ? (
                  <Select ariaLabel="Cuotas" onChange={setInstallments} options={installmentOptions} value={installments} />
                ) : null}
                {paymentMethod === "Cuenta corriente" ? (
                  <input
                    aria-label="Entrega inicial (opcional)"
                    className="field"
                    inputMode="decimal"
                    max={Math.round(totalCents / 100)}
                    min="0"
                    name="paidAmount"
                    onChange={(event) => setPaidAmount(event.target.value)}
                    placeholder="Entrega inicial (opcional)"
                    step="0.01"
                    type="number"
                    value={paidAmount}
                  />
                ) : (
                  <input name="paidAmount" type="hidden" value={Math.round(totalCents / 100)} />
                )}
              </div>
              <input aria-label="Notas del pedido" className="field" name="notes" placeholder="Notas: remito, entrega, observaciones..." />
            </div>
            <div className="admin-wholesale-footer">
              <div className="admin-wholesale-total">
                <span>Total</span>
                <strong>{formatPrice(totalCents)}</strong>
                <small>
                  {unitCount} {unitCount === 1 ? "unidad" : "unidades"} | {paymentMethodValue}
                  {paymentMethod === "Cuenta corriente" ? ` | queda debiendo ${formatPrice(Math.max(0, totalCents - Math.round(parsedPaidAmount * 100)))}` : ""}
                </small>
              </div>
              <div className="admin-wholesale-submit">
                <button className="button button-primary" disabled={missingSteps.length > 0} type="submit">Crear pedido y descontar stock</button>
                {missingSteps.length ? <small>Para crearlo: {missingSteps.join(", ")}.</small> : null}
              </div>
            </div>
          </form>
        </section>
        <div className="admin-wholesale-side">
          <section className="card admin-panel" aria-labelledby="admin-wholesale-due-title">
            <div className="admin-wholesale-side-head">
              <h2 id="admin-wholesale-due-title">Cuentas corrientes pendientes</h2>
              {pendingAccountOrders.length ? <span className="admin-stock-pill">{pendingAccountOrders.length}</span> : null}
            </div>
            <div className="admin-product-list">
              {pendingAccountOrders.length ? pendingAccountOrders.map((order) => {
                const dueCents = Math.max(0, order.totalCents - order.paidCents);
                return (
                  <form action={updateOrderPaymentAction} className="admin-wholesale-due" key={order.id}>
                    <input name="id" type="hidden" value={order.id} />
                    <input name="returnTo" type="hidden" value={clientesHref} />
                    <input name="paymentMethod" type="hidden" value="Cuenta corriente" />
                    <div>
                      <strong>{order.customerName}</strong>
                      <small>{order.code} | pagó {formatPrice(order.paidCents)} de {formatPrice(order.totalCents)}</small>
                      <span className="admin-wholesale-due-amount">Debe {formatPrice(dueCents)}</span>
                    </div>
                    <div className="admin-wholesale-due-pay">
                      <input
                        aria-label={`Total pagado por ${order.customerName}`}
                        className="field"
                        defaultValue={Math.round(order.totalCents / 100)}
                        inputMode="decimal"
                        min="0"
                        name="paidAmount"
                        step="0.01"
                        title="Total pagado hasta hoy (no solo esta entrega)"
                        type="number"
                      />
                      <button className="button button-primary" type="submit">Guardar pago</button>
                    </div>
                  </form>
                );
              }) : <p className="description">No hay clientes con deuda de cuenta corriente.</p>}
            </div>
            {pendingAccountOrders.length ? <small className="description">Anotá el total pagado hasta hoy. Con el total del pedido queda saldado.</small> : null}
          </section>
          <section className="card admin-panel" aria-labelledby="admin-wholesale-last-title">
            <h2 id="admin-wholesale-last-title">Últimos pedidos mayoristas</h2>
            <div className="admin-product-list admin-scroll-list">
              {wholesaleOrders.length ? wholesaleOrders.map((order) => (
                <div className="admin-table-row compact" key={order.id}>
                  <div>
                    <strong>{order.customerName}</strong>
                    <small>{order.code} | {order.itemCount} unidades | {formatAdminDateTime(order.createdAt, { dateStyle: "short", timeStyle: "short" })}</small>
                  </div>
                  <div className="admin-row-actions">
                    <span className="admin-stock-pill">{formatPrice(order.totalCents)}</span>
                    <button className="icon-button danger" onClick={() => onDeleteOrder(order)} type="button" aria-label={`Eliminar pedido ${order.code}`}><Trash2 size={16} /></button>
                  </div>
                </div>
              )) : <p className="description">Todavía no hay pedidos mayoristas.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
