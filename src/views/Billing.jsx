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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content end-shift-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Shift Summary — {new Date().toLocaleDateString('en-IN')}</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>
        {loading ? (
          <div className="modal-loading"><RefreshCw className="spinner" /> Loading...</div>
        ) : data ? (
          <div className="shift-body">
            <div className="shift-stats">
              <div className="shift-stat"><span className="shift-stat-value">{data.count}</span><span>Completed Orders</span></div>
              <div className="shift-stat"><span className="shift-stat-value">{data.totalOrders}</span><span>Total Items</span></div>
              <div className="shift-stat"><span className="shift-stat-value">{FORMAT_CURRENCY.format(data.totalRevenue)}</span><span>Total Revenue</span></div>
            </div>
            <div className="shift-sessions">
              <h4>Completed Sessions Today</h4>
              {data.sessions.length === 0 ? <p className="no-data">No completed sessions yet.</p> : (
                <table className="shift-table">
                  <thead><tr><th>Table</th><th>Customer</th><th>Amount</th><th>Time</th></tr></thead>
                  <tbody>
                    {data.sessions.map((s) => (
                      <tr key={s.id}>
                        <td>{(s.restaurant_tables?.table_number || '—')}</td>
                        <td>{s.customer_name || 'Walk-in'}</td>
                        <td>{FORMAT_CURRENCY.format(s.total_amount || 0)}</td>
                        <td>{s.ended_at ? new Date(s.ended_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : null}
        <style>{`
          .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
          .modal-content { background: white; border-radius: 20px; overflow: hidden; box-shadow: var(--shadow-soft); border: 1px solid var(--color-border); }
          .end-shift-modal { width: 560px; max-height: 80vh; display: flex; flex-direction: column; }
          .modal-header { padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); }
          .modal-header h2 { font-size: 1rem; font-weight: 700; color: var(--color-primary); margin: 0; }
          .close-btn { color: var(--color-text-muted); background: none; border: none; cursor: pointer; }
          .modal-loading { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 3rem; color: var(--color-text-muted); font-weight: 600; }
          .spinner { animation: spin 1s linear infinite; }
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .shift-body { padding: 1.5rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.5rem; }
          .shift-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; }
          .shift-stat { background: var(--color-sidebar); border-radius: 12px; padding: 1rem; text-align: center; }
          .shift-stat-value { display: block; font-size: 1.25rem; font-weight: 800; color: var(--color-primary); }
          .shift-stat span:last-child { font-size: 0.72rem; color: var(--color-text-muted); font-weight: 600; margin-top: 0.15rem; }
          .shift-sessions h4 { font-size: 0.9rem; font-weight: 700; color: var(--color-primary); margin: 0 0 0.75rem; }
          .no-data { text-align: center; padding: 2rem; color: var(--color-text-muted); font-weight: 600; }
          .shift-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
          .shift-table th { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--color-border); font-size: 0.72rem; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; }
          .shift-table td { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--color-border); font-weight: 600; color: var(--color-primary); }
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
      <div className="billing-toolbar">
        <button className="shift-report-btn" onClick={() => setShowShiftModal(true)}>
          End Shift Report
        </button>
      </div>
    <div className="pos-billing-layout">
      <div className="pos-workspace-pane">
        <div className="pos-subtabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`subtab-btn ${state.activeTab === tab.key ? 'active' : ''}`}
              onClick={() => updateTab(tab.key)}
            >
              <tab.icon size={16} />
              {tab.label}
              {tab.key === 'tables' && <span className="tab-badge">{workspaceNonAvailCount}</span>}
              {tab.key === 'online' && <span className="tab-badge">2</span>}
            </button>
          ))}
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
        .billing-toolbar { display: flex; justify-content: flex-end; padding: 0.5rem 1.5rem; background: var(--color-sidebar); border-bottom: 1px solid var(--color-border); gap: 0.5rem; }
        .shift-report-btn { padding: 0.4rem 0.85rem; border-radius: 8px; border: 1px solid var(--color-primary); font-size: 0.75rem; font-weight: 700; color: var(--color-primary); background: white; cursor: pointer; }
        .shift-report-btn:hover { background: var(--color-primary); color: white; }
        .pos-billing-layout { display: flex; height: calc(100vh - 70px); overflow: hidden; background: var(--color-bg); }
        .pos-workspace-pane { flex: 1.4; display: flex; flex-direction: column; border-right: 1px solid var(--color-border); overflow: hidden; }
        .pos-billing-pane { flex: 1; background: white; overflow-y: auto; display: flex; flex-direction: column; }
        .pos-subtabs { display: flex; background: var(--color-sidebar); border-bottom: 1px solid var(--color-border); padding: 0.5rem 1rem 0; gap: 0.5rem; }
        .subtab-btn { padding: 0.75rem 1.25rem; font-weight: 700; font-size: 0.85rem; color: var(--color-text-muted); border-radius: 8px 8px 0 0; border: 1px solid transparent; border-bottom: none; background: transparent; cursor: pointer; display: flex; align-items: center; gap: 0.35rem; transition: var(--transition-smooth); }
        .subtab-btn:hover { color: var(--color-primary); background: rgba(197, 168, 128, 0.05); }
        .subtab-btn.active { color: var(--color-primary); background: var(--color-bg); border-color: var(--color-border); box-shadow: 0 -2px 8px rgba(0,0,0,0.02); }
        .tab-badge { background: var(--color-primary); color: white; font-size: 0.65rem; padding: 0.1rem 0.35rem; border-radius: 6px; font-weight: 800; }

        @media print {
          .pos-workspace-pane { display: none !important; }
          .pos-billing-layout, .pos-billing-pane { display: block !important; margin: 0 !important; padding: 0 !important; width: 100% !important; height: auto !important; background: white !important; }
        }
      `}      </style>
    </div>
    </>
  );

}