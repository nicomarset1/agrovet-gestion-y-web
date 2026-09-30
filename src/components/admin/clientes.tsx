"use client";

// Panel de gestión: sección Clientes (mayoristas y pedidos por mayor).

import { ChevronRight, PackagePlus, Pencil, Search, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { Branch, OrderRecord, Product, WholesaleClient } from "@/lib/types";
import { createWholesaleClientAction, createWholesaleOrderAction, deleteWholesaleClientAction, updateOrderPaymentAction, updateWholesaleClientAction } from "@/app/gestion-agrovet/actions";
import { AdminModal, SectionHeader, buildAdminHref, formatAdminDateTime } from "@/components/admin/shared";

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
      <div className="admin-two-columns">
        <section className="card admin-panel">
          <h2>Crear pedido mayorista</h2>
          <form action={createWholesaleOrderAction} className="admin-detail-stack">
            <input name="returnTo" type="hidden" value={buildAdminHref(basePath, { section: "clientes", branch: String(selectedBranch.id), detail: null, order: null })} />
            <input name="clientId" type="hidden" value={clientId} />
            <div className="admin-point-field">
              <label>Cliente</label>
              <div className="admin-scan-row">
                <input
                  className="field"
                  onChange={(event) => setClientQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
                  placeholder="Buscar por nombre, teléfono, mail, dirección o CUIT..."
                  value={clientQuery}
                />
                <button aria-label="Ver clientes guardados" className="button button-light" onClick={() => setView("clients")} type="button">
                  <Users size={18} />
                </button>
              </div>
              {clientQuery.trim() ? (
                <div className="admin-product-list">
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
              {selectedClient ? (
                <div className="admin-detail-summary compact">
                  <strong>{selectedClient.businessName}</strong>
                  <span>{formatWholesaleClientMeta(selectedClient)}</span>
                  <button className="button button-light" onClick={() => setClientId("")} type="button">Quitar cliente</button>
                </div>
              ) : null}
            </div>
            <input name="branchId" type="hidden" value={selectedBranch.id} />
            <div className="admin-point-field">
              <label>Buscar por producto, SKU o código de barras</label>
              <div className="admin-scan-row">
                <input
                  className="field"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      submitSearch();
                    }
                  }}
                  placeholder="Escaneá o escribí para buscar..."
                  value={query}
                />
                <button aria-label="Buscar producto" className="button button-primary" onClick={submitSearch} type="button"><Search size={18} /></button>
              </div>
              {results.length ? (
                <div className="admin-product-list">
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
            </div>
            <div className="admin-product-list">
              {lines.length ? lines.map((line) => {
                const allocatedTotal = line.allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
                const totalStock = line.stocks.reduce((sum, stock) => sum + stock.quantity, 0);
                return (
                  <div className="admin-table-row compact" key={line.key}>
                    <div>
                      <strong>{line.brand} {line.productName}</strong>
                      <small>{line.label} | {line.sku} | {line.barcode} | stock total {totalStock}</small>
                    </div>
                    <label className="admin-point-field">
                      <span>Cant.</span>
                      <input
                        className="field"
                        max={totalStock}
                        min="1"
                        onChange={(event) => {
                          const quantity = Math.min(totalStock, Math.max(1, Number(event.target.value) || 1));
                          setLines((current) => current.map((item) => item.key === line.key ? {
                            ...item,
                            quantity,
                            allocations: distributeWholesaleQuantity(quantity, item.stocks, selectedBranch.id),
                          } : item));
                        }}
                        type="number"
                        value={line.quantity}
                      />
                    </label>
                    <div className="admin-detail-stack">
                      {branches.map((branch) => {
                        const stock = line.stocks.find((entry) => entry.branchId === branch.id)?.quantity ?? 0;
                        const allocation = line.allocations.find((entry) => entry.branchId === branch.id);
                        const quantity = allocation?.quantity ?? 0;
                        return (
                          <label className="admin-point-field" key={branch.id}>
                            <span>{branch.name} ({stock})</span>
                            <input
                              className="field"
                              max={stock}
                              min="0"
                              onChange={(event) => {
                                const nextQuantity = Math.max(0, Number(event.target.value) || 0);
                                setLines((current) => current.map((item) => {
                                  if (item.key !== line.key) return item;
                                  return { ...item, allocations: rebalanceWholesaleAllocation(item, branch.id, nextQuantity, branches) };
                                }));
                              }}
                              type="number"
                              value={quantity}
                            />
                          </label>
                        );
                      })}
                      <small className={allocatedTotal === line.quantity ? "description" : "notice error"}>
                        {allocatedTotal === line.quantity ? "Distribución lista" : `Distribución incompleta: ${allocatedTotal}/${line.quantity}`}
                      </small>
                    </div>
                    <button className="icon-button danger" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} type="button" aria-label="Quitar producto"><Trash2 size={16} /></button>
                    {line.allocations.map((allocation) => (
                      <div key={`${line.key}-${allocation.branchId}`}>
                        <input name="itemVariantId" type="hidden" value={line.variantId} />
                        <input name="itemQuantity" type="hidden" value={allocation.quantity} />
                        <input name="itemBranchId" type="hidden" value={allocation.branchId} />
                      </div>
                    ))}
                  </div>
                );
              }) : <p className="description">Agregá productos con el buscador o escaneando códigos de barras.</p>}
            </div>
            <label className="admin-point-field">
              <span>Medio de pago</span>
              <input name="paymentMethod" type="hidden" value={paymentMethodValue} />
              <select
                className="field"
                onChange={(event) => {
                  setPaymentMethod(event.target.value);
                  if (event.target.value !== "Cuenta corriente") setPaidAmount("");
                }}
                value={paymentMethod}
              >
                <option>Cuenta corriente</option>
                <option>Efectivo</option>
                <option>Transferencia</option>
                <option>Tarjeta</option>
              </select>
            </label>
            {paymentMethod === "Tarjeta" ? (
              <label className="admin-point-field">
                <span>Cuotas</span>
                <select className="field" onChange={(event) => setInstallments(event.target.value)} value={installments}>
                  <option value="1">1 cuota</option>
                  <option value="2">2 cuotas</option>
                  <option value="3">3 cuotas</option>
                  <option value="6">6 cuotas</option>
                  <option value="12">12 cuotas</option>
                </select>
              </label>
            ) : null}
            {paymentMethod === "Cuenta corriente" ? (
              <label className="admin-point-field">
                <span>Entrega inicial opcional</span>
                <input
                  className="field"
                  max={Math.round(totalCents / 100)}
                  min="0"
                  name="paidAmount"
                  onChange={(event) => setPaidAmount(event.target.value)}
                  placeholder="0"
                  step="0.01"
                  type="number"
                  value={paidAmount}
                />
              </label>
            ) : (
              <input name="paidAmount" type="hidden" value={Math.round(totalCents / 100)} />
            )}
            <label className="admin-point-field">
              <span>Notas del pedido</span>
              <input className="field" name="notes" placeholder="Remito, entrega, observaciones..." />
            </label>
            <div className="admin-detail-summary compact">
              <strong>{formatPrice(totalCents)}</strong>
              <span>
                {lines.reduce((sum, line) => sum + line.quantity, 0)} unidades | {selectedClient?.businessName ?? "Sin cliente seleccionado"} | {paymentMethodValue}
                {paymentMethod === "Cuenta corriente" ? ` | queda ${formatPrice(Math.max(0, totalCents - Math.round(parsedPaidAmount * 100)))}` : ""}
              </span>
            </div>
            <button className="button button-primary" disabled={!clientId || !lines.length} type="submit">Crear pedido y descontar stock</button>
          </form>
        </section>
        <section className="card admin-panel">
          <h2>Cuentas corrientes pendientes</h2>
          <div className="admin-product-list">
            {pendingAccountOrders.length ? pendingAccountOrders.map((order) => {
              const dueCents = Math.max(0, order.totalCents - order.paidCents);
              return (
                <form action={updateOrderPaymentAction} className="admin-table-row compact" key={order.id}>
                  <input name="id" type="hidden" value={order.id} />
                  <input name="returnTo" type="hidden" value={buildAdminHref(basePath, { section: "clientes", branch: String(selectedBranch.id), detail: null, order: null })} />
                  <input name="paymentMethod" type="hidden" value="Cuenta corriente" />
                  <div>
                    <strong>{order.customerName}</strong>
                    <small>{order.code} | pagado {formatPrice(order.paidCents)} | debe {formatPrice(dueCents)}</small>
                  </div>
                  <label className="admin-point-field">
                    <span>Pago</span>
                    <input className="field" defaultValue={Math.round(order.totalCents / 100)} min="0" name="paidAmount" step="0.01" type="number" />
                  </label>
                  <button className="button button-primary" type="submit">Cerrar pago</button>
                </form>
              );
            }) : <p className="description">No hay clientes con deuda de cuenta corriente.</p>}
          </div>
          <h2>Últimos pedidos mayoristas</h2>
          <div className="admin-product-list admin-scroll-list">
            {wholesaleOrders.length ? wholesaleOrders.map((order) => (
              <div className="admin-table-row compact" key={order.id}>
                <div>
                  <strong>{order.customerName}</strong>
                  <small>{order.code} | {order.itemCount} unidades | {formatAdminDateTime(order.createdAt, { dateStyle: "short", timeStyle: "short" })}</small>
                </div>
                <div className="admin-row-actions">
                  <span className="admin-stock-pill">{formatPrice(order.totalCents)}</span>
                  <button className="icon-button danger" onClick={() => onDeleteOrder(order)} type="button" aria-label="Eliminar pedido mayorista"><Trash2 size={16} /></button>
                </div>
              </div>
            )) : <p className="description">Todavía no hay pedidos mayoristas.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
