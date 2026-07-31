import React, { useCallback, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Activity, Globe, Sliders, X, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useBillingData } from '../hooks/useBillingData';
import TablesWorkspace from '../components/billing/TablesWorkspace';
import RunningOrdersTab from '../components/billing/RunningOrdersTab';
import OnlineOrdersTab from '../components/billing/OnlineOrdersTab';
import StoreActionsTab from '../components/billing/StoreActionsTab';
import BillingDetails from '../components/billing/BillingDetails';
import ConnectivityBanner from '../components/billing/ConnectivityBanner';
import {
  AssignTableModal,
  MoveTableModal,
  MergeOrderModal,
  SplitBillModal,
  EditItemModal,
  VoidBillModal,
  ReprintBillModal,
} from '../components/billing/Modals';

const FORMAT_CURRENCY = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 2,
});

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function EndShiftModal({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const today = getTodayStr();
        const { data: sessions, error: sesErr } = await supabase
          .from('customer_sessions')
          .select('id, customer_name, guest_count, started_at, ended_at, table_id, restaurant_tables(table_number)')
          .eq('session_status', 'completed')
          .gte('ended_at', today)
          .order('ended_at', { ascending: false });
        if (sesErr) throw sesErr;

        const list = sessions || [];
        let totalOrders = 0;
        let totalRevenue = 0;

        if (list.length > 0) {
          const ids = list.map((s) => s.id);
          const { data: orders } = await supabase
            .from('orders').select('session_id, total').in('session_id', ids);
          const orderMap = {};
          for (const o of orders || []) {
            if (!orderMap[o.session_id]) orderMap[o.session_id] = [];
            orderMap[o.session_id].push(o);
          }
          for (const s of list) {
            const ords = orderMap[s.id] || [];
            s.order_count = ords.length;
            s.total_amount = ords.reduce((sum, o) => sum + Number(o.total || 0), 0);
            totalOrders += s.order_count;
            totalRevenue += s.total_amount;
          }
        }
        setData({ sessions: list, totalOrders, totalRevenue, count: list.length });
      } catch (err) {
        alert('Error loading shift report: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal shift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <div className="modal__title">Shift summary · {new Date().toLocaleDateString('en-IN')}</div>
          <button className="modal__close" onClick={onClose}><X size={17} /></button>
        </div>

        {loading ? (
          <div className="empty-state">
            <RefreshCw size={20} className="spin" />
            <div className="empty-state__sub">Loading shift report…</div>
          </div>
        ) : data ? (
          <div className="modal__body">
            <div className="metric-grid metric-grid--3">
              <div className="metric-card">
                <div className="metric-card__label">Sessions closed</div>
                <div className="metric-card__value">{data.count}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card__label">Orders</div>
                <div className="metric-card__value">{data.totalOrders}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card__label">Revenue</div>
                <div className="metric-card__value">{FORMAT_CURRENCY.format(data.totalRevenue)}</div>
              </div>
            </div>

            <div>
              <div className="drawer__label">Completed sessions today</div>
              {data.sessions.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state__sub">No completed sessions yet.</div>
                </div>
              ) : (
                <div className="shift-list">
                  <div className="table-head">
                    <div style={{ width: 70 }}>Table</div>
                    <div style={{ flex: 1 }}>Customer</div>
                    <div style={{ width: 90, textAlign: 'right' }}>Amount</div>
                    <div style={{ width: 70, textAlign: 'right' }}>Time</div>
                  </div>
                  {data.sessions.map((s) => (
                    <div key={s.id} className="table-row">
                      <div style={{ width: 70 }} className="strong">
                        {s.restaurant_tables?.table_number || '—'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }} className="muted">
                        {s.customer_name || 'Walk-in'}
                      </div>
                      <div style={{ width: 90, textAlign: 'right' }} className="amount">
                        {FORMAT_CURRENCY.format(s.total_amount || 0)}
                      </div>
                      <div style={{ width: 70, textAlign: 'right' }} className="muted tnum">
                        {s.ended_at
                          ? new Date(s.ended_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <style>{`
          .shift-modal { width: 620px; }
          .shift-list .table-row:last-child { border-bottom: none; }
        `}</style>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'tables', label: 'Running Tables', icon: LayoutGrid },
  { key: 'running-orders', label: 'Running Orders', icon: Activity },
  { key: 'online', label: 'Online Orders', icon: Globe },
  { key: 'actions', label: 'Store Actions', icon: Sliders },
];

export default function Billing() {
  const navigate = useNavigate();
  const {
    state,
    sessionState,
    uiState,
    modalState,
    subtotal,
    discountAmount,
    serviceCharge,
    cgst,
    sgst,
    total,
    filteredTables,
    closeModals,
    setPaymentMethod,
    setEditingQuantities,
    setDiscountType,
    setDiscountValue,
    setServiceChargePercent,
    toggleServiceCharge,
    setSplitPayments,
    setAmountPaid,
    setVoidReason,
    updateTab,
    handleStartSession,
    handleMarkAsPaid,
    handleAddManualItem,
    handleUpdateItemQty,
    handleOpenMoveTable,
    handleConfirmMoveTable,
    handleOpenMergeOrder,
    handleConfirmMergeOrder,
    handleHoldBill,
    handleResumeBill,
    handleVoidBill,
    handlePrint,
    handleFreeAllCleaningTables,
    handleFreeTable,
    cleaningCount,
    setModalState,
    isOnline,
    syncing,
    syncProgress,
    lastSyncResult,
    syncNow,
  } = useBillingData();

  const [showVoidModal, setShowVoidModal] = useState(false);
  const [reprintSession, setReprintSession] = useState(null);
  const [showShiftModal, setShowShiftModal] = useState(false);

  const onTableClick = useCallback(
    (table) => {
      if (table.status === 'available') {
        setModalState((prev) => ({
          ...prev,
          selectedTableForNewOrder: table,
          customerData: { name: '', phone: '', guests: table.capacity || 2 },
          showAssignModal: true,
        }));
      } else if (table.active_session) {
        updateTab(state.activeTab);
        window.history.pushState({}, '', `?sessionId=${table.active_session.id}&tab=${state.activeTab}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    },
    [state.activeTab, setModalState, updateTab]
  );

  const onNavigateMenu = useCallback(() => {
    if (!sessionState.session) return;
    navigate(`/menu?sessionId=${sessionState.session.id}&tableId=${sessionState.session.table_id}`);
  }, [sessionState.session, navigate]);

  const onEditItem = useCallback(
    (item) => {
      setModalState((prev) => ({
        ...prev,
        selectedEditItem: item,
        editQty: item.qty,
        showEditItemModal: true,
      }));
    },
    [setModalState]
  );

  const onUpdateQty = useCallback(
    (item, newQty) => {
      handleUpdateItemQty(item.id, item.orderId, newQty);
    },
    [handleUpdateItemQty]
  );

  const onDeleteItem = useCallback(
    (item) => {
      handleUpdateItemQty(item.id, item.orderId, 0);
    },
    [handleUpdateItemQty]
  );

  const onCloseSession = useCallback(() => {
    updateTab(state.activeTab);
  }, [state.activeTab, updateTab]);

  const onSplitBill = useCallback(() => {
    setModalState((prev) => ({
      ...prev,
      showSplitBillModal: true,
      splitTab: 'equal',
    }));
  }, [setModalState]);

  const onOpenVoid = useCallback(() => {
    setShowVoidModal(true);
  }, []);

  const onConfirmVoid = useCallback(() => {
    handleVoidBill();
    setShowVoidModal(false);
  }, [handleVoidBill]);

  const onReprint = useCallback((session) => {
    setReprintSession(session);
  }, []);

  const onUpdateSplitPayment = useCallback((idx, data) => {
    setSplitPayments(uiState.splitPayments.map((sp, i) => (i === idx ? data : sp)));
  }, [uiState.splitPayments, setSplitPayments]);

  const onAddSplitPayment = useCallback(() => {
    setSplitPayments([...uiState.splitPayments, { method: 'cash', amount: 0 }]);
  }, [uiState.splitPayments, setSplitPayments]);

  const onRemoveSplitPayment = useCallback((idx) => {
    setSplitPayments(uiState.splitPayments.filter((_, i) => i !== idx));
  }, [uiState.splitPayments, setSplitPayments]);

  const onSettlePartial = useCallback(() => {
    const partialTotal = uiState.splitPayments.reduce((s, p) => s + (p.amount || 0), 0);
    setAmountPaid(partialTotal);
    handleMarkAsPaid();
  }, [uiState.splitPayments, setAmountPaid, handleMarkAsPaid]);

  const onToggleAggregator = useCallback(
    (key) => {
      setModalState((prev) => ({
        ...prev,
        aggregators: { ...prev.aggregators, [key]: !prev.aggregators[key] },
      }));
    },
    [setModalState]
  );

  const workspaceNonAvailCount = state.tables.filter((t) => t.status !== 'available').length;

  return (
    <>
      <ConnectivityBanner
        isOnline={isOnline}
        syncing={syncing}
        syncProgress={syncProgress}
        lastSyncResult={lastSyncResult}
        syncNow={syncNow}
      />
    <div className="billing">
      <div className="billing__bar">
        <div className="spacer" />
        <button className="btn btn--ghost" onClick={() => setShowShiftModal(true)}>
          End Shift Report
        </button>
      </div>

    <div className="pos-billing-layout">
      <div className="pos-workspace-pane">
        <div className="pos-subtabs">
          {TABS.map((tab) => {
            const active = state.activeTab === tab.key;
            const count = tab.key === 'tables' ? workspaceNonAvailCount : tab.key === 'online' ? 2 : 0;
            return (
              <button
                key={tab.key}
                className={`subtab-btn ${active ? 'active' : ''}`}
                onClick={() => updateTab(tab.key)}
              >
                <tab.icon size={15} />
                {tab.label}
                {count > 0 && <span className="tab-badge">{count}</span>}
              </button>
            );
          })}
        </div>

        {state.activeTab === 'tables' && (
          <TablesWorkspace
            tables={filteredTables}
            sections={state.sections}
            activeArea={state.activeArea}
            loading={state.loadingWorkspace}
            error={state.workspaceError}
            selectedSessionId={sessionState.session?.id}
            sessionTableId={sessionState.session?.table_id}
            onSelectArea={(area) => setModalState((prev) => ({ ...prev, activeArea: area }))}
            onTableClick={onTableClick}
            onFreeTable={handleFreeTable}
          />
        )}
        {state.activeTab === 'running-orders' && (
          <RunningOrdersTab
            tables={state.tables}
            loading={state.loadingWorkspace}
            onResume={handleResumeBill}
            onReprint={onReprint}
          />
        )}
        {state.activeTab === 'online' && <OnlineOrdersTab />}
        {state.activeTab === 'actions' && (
          <StoreActionsTab
            aggregators={modalState.aggregators}
            onToggleAggregator={onToggleAggregator}
            cleaningCount={cleaningCount}
            onFreeAllCleaning={handleFreeAllCleaningTables}
          />
        )}
      </div>

      <div className="pos-billing-pane">
        <BillingDetails
          sessionId={state.loadingWorkspace ? null : sessionState.session?.id}
          session={sessionState.session}
          items={sessionState.items}
          loading={sessionState.loadingSession}
          error={sessionState.sessionError}
          isPaid={sessionState.isPaid}
          subtotal={subtotal}
          discountAmount={discountAmount}
          serviceCharge={serviceCharge}
          cgst={cgst}
          sgst={sgst}
          total={total}
          paymentMethod={uiState.paymentMethod}
          isEditingQuantities={uiState.isEditingQuantities}
          loadingAction={uiState.loadingAction}
          discountType={uiState.discountType}
          discountValue={uiState.discountValue}
          showServiceCharge={uiState.showServiceCharge}
          serviceChargePercent={uiState.serviceChargePercent}
          splitPayments={uiState.splitPayments}
          onCloseSession={onCloseSession}
          onNavigateMenu={onNavigateMenu}
          onEditItem={onEditItem}
          onUpdateQty={onUpdateQty}
          onDeleteItem={onDeleteItem}
          onToggleEdit={() => setEditingQuantities(!uiState.isEditingQuantities)}
          onSelectPayment={setPaymentMethod}
          onSettle={handleMarkAsPaid}
          onPrint={() => handlePrint('bill')}
          onMoveTable={handleOpenMoveTable}
          onMergeBill={handleOpenMergeOrder}
          onSplit={onSplitBill}
          onHold={handleHoldBill}
          onVoid={onOpenVoid}
          isOnline={isOnline}
          onAddManualItem={handleAddManualItem}
          onSetDiscountType={setDiscountType}
          onSetDiscountValue={setDiscountValue}
          onToggleServiceCharge={toggleServiceCharge}
          onSetServiceChargePercent={setServiceChargePercent}
          onUpdateSplitPayment={onUpdateSplitPayment}
          onAddSplitPayment={onAddSplitPayment}
          onRemoveSplitPayment={onRemoveSplitPayment}
          onSettlePartial={onSettlePartial}
        />
      </div>

      {modalState.showAssignModal && modalState.selectedTableForNewOrder && (
        <AssignTableModal
          table={modalState.selectedTableForNewOrder}
          customerData={modalState.customerData}
          loadingAction={uiState.loadingAction}
          onClose={closeModals}
          onUpdateField={(field, value) =>
            setModalState((prev) => ({ ...prev, customerData: { ...prev.customerData, [field]: value } }))
          }
          onUpdateGuests={(guests) =>
            setModalState((prev) => ({ ...prev, customerData: { ...prev.customerData, guests } }))
          }
          onSubmit={handleStartSession}
        />
      )}

      {modalState.showMoveTableModal && (
        <MoveTableModal
          availableTables={modalState.availableTables}
          selectedMoveTableId={modalState.selectedMoveTableId}
          loadingAction={uiState.loadingAction}
          onClose={closeModals}
          onSelectTable={(id) => setModalState((prev) => ({ ...prev, selectedMoveTableId: id }))}
          onConfirm={handleConfirmMoveTable}
        />
      )}

      {modalState.showMergeOrderModal && (
        <MergeOrderModal
          occupiedSessions={modalState.occupiedSessions}
          selectedMergeSessionId={modalState.selectedMergeSessionId}
          loadingAction={uiState.loadingAction}
          onClose={closeModals}
          onSelectSession={(id) => setModalState((prev) => ({ ...prev, selectedMergeSessionId: id }))}
          onConfirm={handleConfirmMergeOrder}
        />
      )}

      {modalState.showSplitBillModal && (
        <SplitBillModal
          splitTab={modalState.splitTab}
          splitWays={modalState.splitWays}
          total={total}
          subtotal={subtotal}
          items={sessionState.items}
          itemAssignments={modalState.itemAssignments}
          onClose={closeModals}
          onSetTab={(tab) => setModalState((prev) => ({ ...prev, splitTab: tab }))}
          onSetWays={(ways) => setModalState((prev) => ({ ...prev, splitWays: ways }))}
          onAssignItem={(id, assign) =>
            setModalState((prev) => ({ ...prev, itemAssignments: { ...prev.itemAssignments, [id]: assign } }))
          }
          onPrintSplit={(share, ways) => handlePrint('split')}
        />
      )}

      {modalState.showEditItemModal && modalState.selectedEditItem && (
        <EditItemModal
          item={modalState.selectedEditItem}
          qty={modalState.editQty}
          loadingAction={uiState.loadingAction}
          onClose={closeModals}
          onSetQty={(qty) => setModalState((prev) => ({ ...prev, editQty: qty }))}
          onDelete={() => {
            handleUpdateItemQty(modalState.selectedEditItem.id, modalState.selectedEditItem.orderId, 0);
            closeModals();
          }}
          onSave={() => {
            handleUpdateItemQty(modalState.selectedEditItem.id, modalState.selectedEditItem.orderId, modalState.editQty);
            closeModals();
          }}
        />
      )}

      {showVoidModal && (
        <VoidBillModal
          voidReason={uiState.voidReason}
          loadingAction={uiState.loadingAction}
          onClose={() => setShowVoidModal(false)}
          onSetReason={setVoidReason}
          onConfirm={onConfirmVoid}
        />
      )}

      {reprintSession && (
        <ReprintBillModal
          session={reprintSession}
          onClose={() => setReprintSession(null)}
        />
      )}

      {showShiftModal && <EndShiftModal onClose={() => setShowShiftModal(false)} />}

      <style>{`
        .billing {
          padding: 24px 32px 40px 32px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-sizing: border-box;
        }

        .billing__bar { display: flex; align-items: center; }

        .pos-billing-layout {
          display: grid;
          grid-template-columns: 55fr 45fr;
          gap: 16px;
          align-items: start;
        }

        .pos-workspace-pane { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

        .pos-billing-pane { position: sticky; top: 16px; min-width: 0; }

        .pos-subtabs {
          display: flex;
          gap: 4px;
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          padding: 4px;
        }

        .subtab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 9px 8px;
          border-radius: 9px;
          border: none;
          background: transparent;
          font-size: 13px;
          font-weight: 600;
          color: var(--color-text-soft);
          white-space: nowrap;
        }

        .subtab-btn:hover { background: var(--color-canvas); }

        .subtab-btn.active { background: var(--color-text); color: #fff; }
        .subtab-btn.active:hover { background: var(--color-text); }

        .tab-badge {
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: var(--radius-pill);
          background: var(--color-well);
          color: var(--color-text-soft);
          font-size: 11px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
        }

        .subtab-btn.active .tab-badge { background: rgba(255, 255, 255, 0.2); color: #fff; }

        @media (max-width: 1180px) {
          .pos-billing-layout { grid-template-columns: 1fr; }
          .pos-billing-pane { position: static; }
        }

        @media print {
          .pos-workspace-pane, .billing__bar { display: none !important; }
          .billing, .pos-billing-layout, .pos-billing-pane {
            display: block !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            background: white !important;
            position: static !important;
          }
        }
      `}      </style>
    </div>
    </div>
    </>
  );

}