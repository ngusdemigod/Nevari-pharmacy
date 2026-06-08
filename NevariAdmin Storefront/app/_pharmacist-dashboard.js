"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { FRONTENDS } from "./components/frontend-config";
import { setDocumentMetadata } from "./components/page-metadata";
import { hydrateStoredSession, isSessionUsable, money, shortDate, storedStoreCurrency, storedStoreTimeZone, titleCase } from "./components/role-dashboard-utils";
import { clearSessionAuth } from "./components/role-session";
import {
  createManagedProduct,
  approvePharmacistMtmRequest,
  fetchManagedOrders,
  fetchManagedProducts,
  fetchPharmacistMtmRequests,
  updateManagedProduct,
  updatePharmacistMtmRequest,
} from "./lib/nevari-api";

const PHARMACIST_VIEWS = [
  { id: "products", label: "Products" },
  { id: "orders", label: "Orders" },
  { id: "payments", label: "Payments" },
  { id: "mtm", label: "Medical therapy management" },
];

function hasPharmacistRole(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  const directRole = typeof user?.role === "string" ? [user.role] : [];
  return [...roles, ...directRole].map((value) => String(value || "").toLowerCase()).includes("pharmacist");
}

function createProductDraft() {
  return {
    id: null,
    name: "",
    regular_price: "",
    stock_quantity: "",
    status: "draft",
    short_description: "",
  };
}

function createMtmDraft() {
  return {
    scheduleAt: "",
    consultationNotes: "",
    actionPlan: "",
    followUpAt: "",
    followUpPurpose: "",
    followUpNote: "",
    outcome: "",
  };
}

function sanitizeProductDraft(draft) {
  return {
    name: String(draft.name || "").trim(),
    regular_price: String(draft.regular_price || "").trim(),
    stock_quantity: String(draft.stock_quantity || "").trim(),
    status: String(draft.status || "draft").trim(),
    short_description: String(draft.short_description || "").trim(),
  };
}

function feedbackTone(message) {
  return message.toLowerCase().includes("unable") || message.toLowerCase().includes("failed") || message.toLowerCase().includes("required")
    ? "error"
    : "success";
}

export default function PharmacistDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [view, setView] = useState("products");
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [productDraft, setProductDraft] = useState(() => createProductDraft());
  const [mtmDraft, setMtmDraft] = useState(() => createMtmDraft());
  const [feedback, setFeedback] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [busyRequestId, setBusyRequestId] = useState(null);

  useEffect(() => {
    setDocumentMetadata("Nevari Pharmacist", "Pharmacist product management and medical therapy management.");
  }, []);

  useEffect(() => {
    const hydrated = hydrateStoredSession("pharmacist");
    if (!isSessionUsable(hydrated) || !hasPharmacistRole(hydrated.user)) {
      setAuthResolved(true);
      router.replace(FRONTENDS.pharmacist.loginPath);
      return;
    }
    setSession(hydrated);
    setAuthResolved(true);
  }, [router]);

  const productsQuery = useSWR(
    session ? ["pharmacist-products-managed", productSearch] : null,
    () => fetchManagedProducts(session, { search: productSearch.trim(), per_page: 50 }),
    { revalidateOnFocus: false }
  );
  const mtmQuery = useSWR(
    session ? "pharmacist-mtm-requests" : null,
    () => fetchPharmacistMtmRequests(session),
    { refreshInterval: 45_000, revalidateOnFocus: false }
  );
  const ordersQuery = useSWR(
    session && ["orders", "payments"].includes(view) ? ["pharmacist-orders", view] : null,
    () => fetchManagedOrders(session, { per_page: 50, page: 1 }),
    { revalidateOnFocus: false, dedupingInterval: 45_000 }
  );

  const products = productsQuery.data?.items || [];
  const mtmRequests = mtmQuery.data || [];
  const orders = ordersQuery.data?.items || [];
  const storeCurrency = storedStoreCurrency();
  const selectedProduct = useMemo(
    () => products.find((item) => String(item.product_id || item.id) === String(selectedProductId)) || null,
    [products, selectedProductId]
  );
  const selectedOrder = useMemo(
    () => orders.find((item) => String(item.id || item.order_id) === String(selectedOrderId)) || orders[0] || null,
    [orders, selectedOrderId]
  );
  const selectedRequest = useMemo(
    () => mtmRequests.find((item) => String(item.id) === String(selectedRequestId)) || mtmRequests[0] || null,
    [mtmRequests, selectedRequestId]
  );
  const paymentOrders = useMemo(
    () => orders.filter((item) => item?.payment_status || item?.payment_method || item?.total),
    [orders]
  );

  useEffect(() => {
    if (selectedProduct) {
      setProductDraft({
        id: selectedProduct.product_id || selectedProduct.id,
        name: selectedProduct.name || "",
        regular_price: String(selectedProduct.regular_price || selectedProduct.price || ""),
        stock_quantity: String(selectedProduct.stock_quantity ?? ""),
        status: selectedProduct.status || "draft",
        short_description: selectedProduct.short_description || "",
      });
    } else if (!selectedProductId) {
      setProductDraft(createProductDraft());
    }
  }, [selectedProduct, selectedProductId]);

  useEffect(() => {
    if (!selectedRequestId && mtmRequests.length) {
      setSelectedRequestId(mtmRequests[0].id);
    }
  }, [mtmRequests, selectedRequestId]);

  useEffect(() => {
    if (!selectedOrderId && orders.length) {
      setSelectedOrderId(orders[0].id || orders[0].order_id || null);
    }
  }, [orders, selectedOrderId]);

  if (!authResolved) {
    return null;
  }

  function logout() {
    clearSessionAuth(FRONTENDS.pharmacist, session || hydrateStoredSession("pharmacist"));
    router.replace(FRONTENDS.pharmacist.loginPath);
  }

  function resetProductEditor() {
    setSelectedProductId(null);
    setProductDraft(createProductDraft());
  }

  async function saveProduct() {
    const payload = sanitizeProductDraft(productDraft);
    if (!payload.name) {
      setFeedback("Product name is required.");
      return;
    }
    setBusyAction("product");
    setFeedback("");
    try {
      if (productDraft.id) {
        await updateManagedProduct(session, productDraft.id, payload);
        setFeedback("Product updated.");
      } else {
        await createManagedProduct(session, payload);
        setFeedback("Product created.");
      }
      await productsQuery.mutate();
      resetProductEditor();
    } catch (error) {
      setFeedback(error?.message || "Unable to save product.");
    } finally {
      setBusyAction("");
    }
  }

  async function runMtmAction(action, body = {}, successMessage = "MTM request updated.") {
    if (!selectedRequest) {
      return;
    }
    const currentRequestId = String(selectedRequest.id || "");
    setBusyAction(action);
    setBusyRequestId(currentRequestId);
    setFeedback("");
    try {
      const optimisticStatusMap = {
        approve: "approved",
        schedule: "scheduled",
        "consultation-complete": "treatment_completed",
        "follow-up-schedule": "follow_up",
        complete: "completed",
      };
      const optimisticStatus = optimisticStatusMap[action];
      if (optimisticStatus) {
        const optimisticRequest = {
          ...selectedRequest,
          status: optimisticStatus,
          status_label: titleCase(optimisticStatus.replace(/_/g, " ")),
        };
        await mtmQuery.mutate((current) => Array.isArray(current)
          ? current.map((item) => String(item.id) === currentRequestId ? optimisticRequest : item)
          : current, { revalidate: false });
      }
      const next = action === "approve"
        ? await approvePharmacistMtmRequest(session, selectedRequest.id)
        : await updatePharmacistMtmRequest(session, selectedRequest.id, action, body);
      await mtmQuery.mutate((current) => Array.isArray(current)
        ? current.map((item) => String(item.id) === String(next?.id) ? next : item)
        : current, { revalidate: false });
      await mtmQuery.mutate();
      setFeedback(successMessage);
    } catch (error) {
      setFeedback(error?.message || "Unable to update the MTM request.");
    } finally {
      setBusyAction("");
      setBusyRequestId(null);
    }
  }

  const selectedRequestStatus = String(selectedRequest?.status || "").toLowerCase();
  const requestActionLocked = String(busyRequestId || "") === String(selectedRequest?.id || "");
  const ordersTotal = ordersQuery.data?.total || orders.length;
  const paymentsTotal = paymentOrders.length;

  const feedbackClass = feedback ? `pharmacist-dashboard-feedback ${feedbackTone(feedback)}` : "";

  return <main className="pharmacist-dashboard-shell">
    <aside className="pharmacist-dashboard-sidebar">
      <div>
        <div className="pharmacist-dashboard-brand">
          <div className="pharmacist-dashboard-brand-mark">N</div>
          <div>
            <strong>Nevari Pharmacist</strong>
            <span>Operations workspace</span>
          </div>
        </div>
        <div className="pharmacist-dashboard-nav-group">
          {PHARMACIST_VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`pharmacist-dashboard-nav ${view === item.id ? "active" : ""}`}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="pill-button danger pharmacist-dashboard-logout" onClick={logout}>Logout</button>
    </aside>

    <section className="pharmacist-dashboard-main">
      <header className="pharmacist-dashboard-header">
        <div>
          <div className="pharmacist-dashboard-kicker">Pharmacy operations</div>
          <h1>{view === "products" ? "Products" : view === "orders" ? "Orders" : view === "payments" ? "Payments" : "Medical therapy management"}</h1>
          <p>
            {view === "products"
              ? "Create, update, and maintain the core WooCommerce product catalog used by pharmacists."
              : view === "orders"
                ? "Monitor pharmacy orders and review fulfillment-ready customer details."
                : view === "payments"
                  ? "Track order payment status inside the pharmacist workspace."
              : "Review assigned MTM cases, schedule consultations, capture outcomes, and close requests cleanly."}
          </p>
        </div>
        <div className="pharmacist-dashboard-metrics">
          <div className="pharmacist-dashboard-metric">
            <span>Products</span>
            <strong>{productsQuery.data?.total || products.length}</strong>
          </div>
          <div className="pharmacist-dashboard-metric">
            <span>Orders</span>
            <strong>{ordersTotal}</strong>
          </div>
          <div className="pharmacist-dashboard-metric">
            <span>{view === "payments" ? "Payments" : "MTM Requests"}</span>
            <strong>{view === "payments" ? paymentsTotal : mtmRequests.length}</strong>
          </div>
        </div>
      </header>

      {feedback ? <div className={feedbackClass}>{feedback}</div> : null}

      {view === "products" ? <section className="pharmacist-dashboard-grid">
        <article className="pharmacist-dashboard-panel">
          <div className="pharmacist-dashboard-panel-head">
            <div>
              <h2>Catalog</h2>
              <p>Search and open an item for editing.</p>
            </div>
            <button type="button" className="pill-button" onClick={resetProductEditor}>New Product</button>
          </div>
          <label className="customer-mobile-field">
            <span>Search products</span>
            <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search by name or SKU" />
          </label>
          <div className="pharmacist-dashboard-list">
            {productsQuery.isLoading ? <div className="empty-card compact-empty"><div className="card-title">Loading products...</div></div> : null}
            {!productsQuery.isLoading && !products.length ? <div className="empty-card compact-empty"><div className="card-title">No products found.</div></div> : null}
            {products.map((product) => {
              const productId = product.product_id || product.id;
              return <button
                key={productId}
                type="button"
                className={`pharmacist-dashboard-list-item ${String(selectedProductId) === String(productId) ? "active" : ""}`}
                onClick={() => setSelectedProductId(productId)}
              >
                <div>
                  <strong>{product.name || "Unnamed product"}</strong>
                  <span>{product.sku || "No SKU"} · {titleCase(product.status || "draft")}</span>
                </div>
                <b>{product.price_html || product.regular_price || "No price"}</b>
              </button>;
            })}
          </div>
        </article>

        <article className="pharmacist-dashboard-panel">
          <div className="pharmacist-dashboard-panel-head">
            <div>
              <h2>{productDraft.id ? "Edit product" : "Create product"}</h2>
              <p>Focused WooCommerce CRUD for pharmacists.</p>
            </div>
          </div>
          <div className="pharmacist-dashboard-form">
            <label className="customer-mobile-field">
              <span>Product name</span>
              <input value={productDraft.name} onChange={(event) => setProductDraft((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <div className="pharmacist-dashboard-inline-fields">
              <label className="customer-mobile-field">
                <span>Price</span>
                <input value={productDraft.regular_price} onChange={(event) => setProductDraft((current) => ({ ...current, regular_price: event.target.value }))} />
              </label>
              <label className="customer-mobile-field">
                <span>Stock</span>
                <input value={productDraft.stock_quantity} onChange={(event) => setProductDraft((current) => ({ ...current, stock_quantity: event.target.value }))} />
              </label>
            </div>
            <label className="customer-mobile-field">
              <span>Status</span>
              <select value={productDraft.status} onChange={(event) => setProductDraft((current) => ({ ...current, status: event.target.value }))}>
                <option value="draft">Draft</option>
                <option value="publish">Published</option>
                <option value="private">Private</option>
              </select>
            </label>
            <label className="customer-mobile-field">
              <span>Short description</span>
              <textarea rows={5} value={productDraft.short_description} onChange={(event) => setProductDraft((current) => ({ ...current, short_description: event.target.value }))} />
            </label>
          </div>
          <div className="pharmacist-dashboard-actions">
            <button type="button" className="button-primary" disabled={busyAction === "product"} onClick={saveProduct}>
              {busyAction === "product" ? "Saving..." : (productDraft.id ? "Update Product" : "Create Product")}
            </button>
            <button type="button" className="pill-button" onClick={resetProductEditor}>Clear</button>
          </div>
        </article>
      </section> : null}

      {view === "orders" ? <section className="pharmacist-dashboard-grid">
        <article className="pharmacist-dashboard-panel">
          <div className="pharmacist-dashboard-panel-head">
            <div>
              <h2>Order queue</h2>
              <p>Recent pharmacy orders available to this dashboard role.</p>
            </div>
          </div>
          <div className="pharmacist-dashboard-list">
            {ordersQuery.isLoading ? <div className="empty-card compact-empty"><div className="card-title">Loading orders...</div></div> : null}
            {!ordersQuery.isLoading && !orders.length ? <div className="empty-card compact-empty"><div className="card-title">No orders found.</div></div> : null}
            {orders.map((order) => {
              const orderId = order.id || order.order_id;
              return <button
                key={orderId}
                type="button"
                className={`pharmacist-dashboard-list-item ${String(selectedOrder?.id || selectedOrder?.order_id || "") === String(orderId) ? "active" : ""}`}
                onClick={() => setSelectedOrderId(orderId)}
              >
                <div>
                  <strong>{order.number ? `Order #${order.number}` : `Order #${orderId}`}</strong>
                  <span>{titleCase(order.status || "pending")} · {titleCase(order.payment_status || "pending")}</span>
                </div>
                <b>{money(order.total || 0, storeCurrency)}</b>
              </button>;
            })}
          </div>
        </article>

        <article className="pharmacist-dashboard-panel">
          {selectedOrder ? <>
            <div className="pharmacist-dashboard-panel-head">
              <div>
                <h2>{selectedOrder.number ? `Order #${selectedOrder.number}` : `Order #${selectedOrder.id}`}</h2>
                <p>{titleCase(selectedOrder.status || "pending")} · {titleCase(selectedOrder.payment_status || "pending")}</p>
              </div>
            </div>
            <div className="pharmacist-dashboard-summary-grid">
              <div className="detail-card info-list">
                <div className="info-row"><span className="info-label">Customer</span><span className="info-value">{selectedOrder.billing?.first_name ? `${selectedOrder.billing.first_name} ${selectedOrder.billing.last_name || ""}`.trim() : (selectedOrder.customer_name || "Not recorded")}</span></div>
                <div className="info-row"><span className="info-label">Email</span><span className="info-value">{selectedOrder.billing?.email || selectedOrder.customer_email || "Not recorded"}</span></div>
                <div className="info-row"><span className="info-label">Phone</span><span className="info-value">{selectedOrder.billing?.phone || "Not recorded"}</span></div>
                <div className="info-row"><span className="info-label">Created</span><span className="info-value">{shortDate(selectedOrder.created_at)}</span></div>
              </div>
              <div className="detail-card info-list">
                <div className="info-row"><span className="info-label">Total</span><span className="info-value">{money(selectedOrder.total || 0, storeCurrency)}</span></div>
                <div className="info-row"><span className="info-label">Payment</span><span className="info-value">{titleCase(selectedOrder.payment_status || "pending")}</span></div>
                <div className="info-row"><span className="info-label">Method</span><span className="info-value">{selectedOrder.payment_method_title || selectedOrder.payment_method || "Not recorded"}</span></div>
                <div className="info-row"><span className="info-label">Prescription</span><span className="info-value">{selectedOrder.prescription_id || "None"}</span></div>
              </div>
            </div>
          </> : <div className="empty-card compact-empty"><div className="card-title">Select an order.</div></div>}
        </article>
      </section> : null}

      {view === "payments" ? <section className="pharmacist-dashboard-grid">
        <article className="pharmacist-dashboard-panel">
          <div className="pharmacist-dashboard-panel-head">
            <div>
              <h2>Payment records</h2>
              <p>Payment activity derived from pharmacy orders.</p>
            </div>
          </div>
          <div className="pharmacist-dashboard-list">
            {ordersQuery.isLoading ? <div className="empty-card compact-empty"><div className="card-title">Loading payments...</div></div> : null}
            {!ordersQuery.isLoading && !paymentOrders.length ? <div className="empty-card compact-empty"><div className="card-title">No payments found.</div></div> : null}
            {paymentOrders.map((order) => {
              const orderId = order.id || order.order_id;
              return <button
                key={`payment-${orderId}`}
                type="button"
                className={`pharmacist-dashboard-list-item ${String(selectedOrder?.id || selectedOrder?.order_id || "") === String(orderId) ? "active" : ""}`}
                onClick={() => setSelectedOrderId(orderId)}
              >
                <div>
                  <strong>{order.number ? `Payment for Order #${order.number}` : `Payment for Order #${orderId}`}</strong>
                  <span>{titleCase(order.payment_status || "pending")} · {shortDate(order.date_paid || order.created_at)}</span>
                </div>
                <b>{money(order.total || 0, storeCurrency)}</b>
              </button>;
            })}
          </div>
        </article>

        <article className="pharmacist-dashboard-panel">
          {selectedOrder ? <>
            <div className="pharmacist-dashboard-panel-head">
              <div>
                <h2>{selectedOrder.number ? `Payment Summary · Order #${selectedOrder.number}` : `Payment Summary · Order #${selectedOrder.id}`}</h2>
                <p>{titleCase(selectedOrder.payment_status || "pending")}</p>
              </div>
            </div>
            <div className="pharmacist-dashboard-summary-grid">
              <div className="detail-card info-list">
                <div className="info-row"><span className="info-label">Amount</span><span className="info-value">{money(selectedOrder.total || 0, storeCurrency)}</span></div>
                <div className="info-row"><span className="info-label">Paid At</span><span className="info-value">{selectedOrder.date_paid ? shortDate(selectedOrder.date_paid) : "Not paid yet"}</span></div>
                <div className="info-row"><span className="info-label">Method</span><span className="info-value">{selectedOrder.payment_method_title || selectedOrder.payment_method || "Not recorded"}</span></div>
                <div className="info-row"><span className="info-label">Status</span><span className="info-value">{titleCase(selectedOrder.payment_status || "pending")}</span></div>
              </div>
              <div className="detail-card info-list">
                <div className="info-row"><span className="info-label">Customer</span><span className="info-value">{selectedOrder.billing?.first_name ? `${selectedOrder.billing.first_name} ${selectedOrder.billing.last_name || ""}`.trim() : (selectedOrder.customer_name || "Not recorded")}</span></div>
                <div className="info-row"><span className="info-label">Order Status</span><span className="info-value">{titleCase(selectedOrder.status || "pending")}</span></div>
                <div className="info-row"><span className="info-label">Transaction Ref</span><span className="info-value">{selectedOrder.transaction_id || "Not recorded"}</span></div>
                <div className="info-row"><span className="info-label">Created</span><span className="info-value">{shortDate(selectedOrder.created_at)}</span></div>
              </div>
            </div>
          </> : <div className="empty-card compact-empty"><div className="card-title">Select a payment record.</div></div>}
        </article>
      </section> : null}

      {view === "mtm" ? <section className="pharmacist-dashboard-grid">
        <article className="pharmacist-dashboard-panel">
          <div className="pharmacist-dashboard-panel-head">
            <div>
              <h2>Assigned requests</h2>
              <p>All active and historical MTM cases assigned to this pharmacist.</p>
            </div>
          </div>
          <div className="pharmacist-dashboard-list">
            {mtmQuery.isLoading ? <div className="empty-card compact-empty"><div className="card-title">Loading MTM requests...</div></div> : null}
            {!mtmQuery.isLoading && !mtmRequests.length ? <div className="empty-card compact-empty"><div className="card-title">No MTM requests found.</div></div> : null}
            {mtmRequests.map((request) => (
              <button
                key={request.id}
                type="button"
                className={`pharmacist-dashboard-list-item ${String(selectedRequest?.id) === String(request.id) ? "active" : ""}`}
                onClick={() => setSelectedRequestId(request.id)}
              >
                <div>
                  <strong>{request.request_reference || request.patient?.name || `MTM-${String(request.id || "").padStart(6, "0")}`}</strong>
                  <span>{request.status_label || titleCase(request.status || "submitted")}</span>
                </div>
                <b>{shortDate(request.created_at)}</b>
              </button>
            ))}
          </div>
        </article>

        <article className="pharmacist-dashboard-panel">
          {selectedRequest ? <>
            <div className="pharmacist-dashboard-panel-head">
              <div>
                <h2>{selectedRequest.request_reference || selectedRequest.patient?.name || `MTM-${String(selectedRequest.id || "").padStart(6, "0")}`}</h2>
                <p>{selectedRequest.status_label || titleCase(selectedRequest.status || "submitted")}</p>
              </div>
              <div className="pharmacist-dashboard-actions compact">
                {selectedRequestStatus !== "approved" && selectedRequestStatus !== "scheduled" && selectedRequestStatus !== "treatment_completed" && selectedRequestStatus !== "follow_up" && selectedRequestStatus !== "completed" ? <button type="button" className="pill-button" disabled={requestActionLocked && busyAction === "approve"} onClick={() => runMtmAction("approve", {}, "MTM request approved.")}>{requestActionLocked && busyAction === "approve" ? "Approving..." : "Approve"}</button> : null}
                {selectedRequest?.id ? <a
                  className="pill-button"
                  href={`/api/admin/mtm/${selectedRequest.id}/pdf?baseUrl=${encodeURIComponent(session?.baseUrl || "")}&frontendType=${encodeURIComponent(session?.frontendType || "pharmacist_dashboard")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download Request PDF
                </a> : null}
                <button type="button" className="pill-button" disabled={requestActionLocked && busyAction === "complete"} onClick={() => runMtmAction("complete", {}, "MTM case completed.")}>{requestActionLocked && busyAction === "complete" ? "Completing..." : "Complete"}</button>
              </div>
            </div>

            <div className="pharmacist-dashboard-summary-grid">
              <div className="detail-card info-list">
                <div className="info-row"><span className="info-label">Primary diagnosis</span><span className="info-value">{selectedRequest.medical_history?.primaryDiagnosis || "Not set"}</span></div>
                <div className="info-row"><span className="info-label">Medication count</span><span className="info-value">{Array.isArray(selectedRequest.medication_profile?.medications) ? selectedRequest.medication_profile.medications.length : 0}</span></div>
                <div className="info-row"><span className="info-label">Follow-up</span><span className="info-value">{selectedRequest.follow_up_at ? shortDate(selectedRequest.follow_up_at) : "Not scheduled"}</span></div>
              </div>
              <div className="detail-card info-list">
                <div className="info-row"><span className="info-label">Submitted</span><span className="info-value">{shortDate(selectedRequest.created_at)}</span></div>
                <div className="info-row"><span className="info-label">Meeting</span><span className="info-value">{selectedRequest.meeting_state ? titleCase(selectedRequest.meeting_state) : (selectedRequest.google_meet?.meeting_uri ? "Created" : "Pending")}</span></div>
                <div className="info-row"><span className="info-label">Attendance</span><span className="info-value">{selectedRequest.attendance_status ? titleCase(selectedRequest.attendance_status) : "Pending"}</span></div>
                <div className="info-row"><span className="info-label">Order</span><span className="info-value">{selectedRequest.order_id || "None"}</span></div>
              </div>
            </div>

            <div className="pharmacist-dashboard-form">
              <label className="customer-mobile-field">
                <span>Appointment start</span>
                <input type="datetime-local" value={mtmDraft.scheduleAt} onChange={(event) => setMtmDraft((current) => ({ ...current, scheduleAt: event.target.value }))} />
              </label>
              <button
                type="button"
                className="pill-button"
                disabled={requestActionLocked && busyAction === "schedule"}
                onClick={() => runMtmAction("schedule", {
                  appointment_start: mtmDraft.scheduleAt,
                  timezone: storedStoreTimeZone(),
                }, "MTM appointment scheduled for 30 minutes.")}
              >
                {requestActionLocked && busyAction === "schedule" ? "Scheduling..." : "Schedule Google Meet"}
              </button>

              <label className="customer-mobile-field">
                <span>Consultation notes</span>
                <textarea rows={4} value={mtmDraft.consultationNotes} onChange={(event) => setMtmDraft((current) => ({ ...current, consultationNotes: event.target.value }))} />
              </label>
              <button
                type="button"
                className="pill-button"
                disabled={requestActionLocked && busyAction === "consultation-complete"}
                onClick={() => runMtmAction("consultation-complete", {
                  consultation_notes: { notes: mtmDraft.consultationNotes },
                }, "Treatment marked completed.")}
              >
                Mark Treatment Completed
              </button>

              <label className="customer-mobile-field">
                <span>Medication Action Plan</span>
                <textarea rows={5} value={mtmDraft.actionPlan} onChange={(event) => setMtmDraft((current) => ({ ...current, actionPlan: event.target.value }))} />
              </label>
              <button
                type="button"
                className="pill-button"
                disabled={requestActionLocked && busyAction === "action-plan"}
                onClick={() => runMtmAction("action-plan", {
                  action_plan: { summary: mtmDraft.actionPlan },
                }, "Medication Action Plan saved.")}
              >
                Save Action Plan
              </button>

              <div className="pharmacist-dashboard-inline-fields">
                <label className="customer-mobile-field">
                  <span>Follow-up date</span>
                  <input type="datetime-local" value={mtmDraft.followUpAt} onChange={(event) => setMtmDraft((current) => ({ ...current, followUpAt: event.target.value }))} />
                </label>
                <label className="customer-mobile-field">
                  <span>Follow-up purpose</span>
                  <input value={mtmDraft.followUpPurpose} onChange={(event) => setMtmDraft((current) => ({ ...current, followUpPurpose: event.target.value }))} />
                </label>
              </div>
              <label className="customer-mobile-field">
                <span>Follow-up note</span>
                <textarea rows={3} value={mtmDraft.followUpNote} onChange={(event) => setMtmDraft((current) => ({ ...current, followUpNote: event.target.value }))} />
              </label>
              <button
                type="button"
                className="pill-button"
                disabled={requestActionLocked && busyAction === "follow-up-schedule"}
                onClick={() => runMtmAction("follow-up-schedule", {
                  follow_up_at: mtmDraft.followUpAt,
                  purpose: mtmDraft.followUpPurpose,
                  note: mtmDraft.followUpNote,
                }, "Follow-up scheduled.")}
              >
                Schedule Follow-Up
              </button>

              <label className="customer-mobile-field">
                <span>Outcome tracking</span>
                <textarea rows={4} value={mtmDraft.outcome} onChange={(event) => setMtmDraft((current) => ({ ...current, outcome: event.target.value }))} />
              </label>
              <button
                type="button"
                className="pill-button"
                disabled={requestActionLocked && busyAction === "outcome-tracking"}
                onClick={() => runMtmAction("outcome-tracking", {
                  outcome_tracking: { notes: mtmDraft.outcome },
                }, "Outcome tracking saved.")}
              >
                Save Outcome
              </button>
            </div>
          </> : <div className="empty-card compact-empty"><div className="card-title">Select an MTM request.</div></div>}
        </article>
      </section> : null}
    </section>
  </main>;
}

function PharmacistDashboardBootSkeleton() {
  return <main className="pharmacist-dashboard-shell">
    <aside className="pharmacist-dashboard-sidebar">
      <div className="pharmacist-dashboard-brand skeleton-panel">
        <div className="pharmacist-dashboard-brand-mark">N</div>
        <div>
          <strong>Nevari Pharmacist</strong>
          <span>Operations workspace</span>
        </div>
      </div>
    </aside>
    <section className="pharmacist-dashboard-main">
      <header className="pharmacist-dashboard-header skeleton-panel">
        <div>
          <div className="skeleton skeleton-line skeleton-line-xs" />
          <div className="skeleton skeleton-line skeleton-line-lg" />
        </div>
      </header>
      <section className="pharmacist-dashboard-grid">
        {Array.from({ length: 2 }, (_, index) => <article className="pharmacist-dashboard-panel skeleton-panel" key={`pharmacist-auth-skeleton-${index}`}>
          <div className="skeleton skeleton-line skeleton-line-md" />
          <div className="skeleton skeleton-line skeleton-line-sm" />
          <div className="skeleton skeleton-line skeleton-line-sm" />
        </article>)}
      </section>
    </section>
  </main>;
}
