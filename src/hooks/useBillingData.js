import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOfflineSync } from './useOfflineSync';
import * as db from '../lib/db';
import {
  TAX_RATE, CGST_RATE, SGST_RATE, TABLE_CLEANUP_DELAY_MS,
  SESSION_STATUS, TABLE_STATUS, ORDER_STATUS,
  calcSubtotal, calcDiscountAmount, calcServiceCharge,
  calcTax, calcCgst, calcSgst, calcTotal,
  FORMAT_CURRENCY,
} from '../lib/calculations';

function flattenOrderItems(sessionData) {
  if (!sessionData?.orders) return [];
  return sessionData.orders.flatMap((order) =>
    (order.order_items || []).map((item) => ({
      id: item.id,
      orderId: order.id,
      name: item.menu_items?.item_name || 'Unknown Item',
      qty: item.quantity,
      price: item.item_price,
    }))
  );
}

// Freeing a table must also end whatever meal was on it. resolve-table decides
// the diner's mode purely from "does this table have an active session", so a
// session left open outlives the meal and the next QR scan rejoins the previous
// diner's bill. Anything not already settled is closed out here.
const OPEN_SESSION_STATUSES = [
  SESSION_STATUS.active,
  SESSION_STATUS.billing,
  SESSION_STATUS.hold,
];

async function closeSessionsForTables(tableIds, { online }) {
  if (!tableIds || tableIds.length === 0) return;
  const ended_at = new Date().toISOString();

  if (online) {
    const { error } = await supabase
      .from('customer_sessions')
      .update({ session_status: SESSION_STATUS.completed, ended_at })
      .in('table_id', tableIds)
      .in('session_status', OPEN_SESSION_STATUSES);
    if (error) throw error;
    return;
  }

  const sessions = await db.getAll('sessions');
  for (const session of sessions) {
    if (!tableIds.includes(session.table_id)) continue;
    if (!OPEN_SESSION_STATUSES.includes(session.session_status)) continue;
    await db.put('sessions', { ...session, session_status: SESSION_STATUS.completed, ended_at });
    await db.enqueueSync({
      action: 'update',
      table: 'customer_sessions',
      data: { id: session.id, session_status: SESSION_STATUS.completed, ended_at },
    });
  }
}

function buildItemAssignments(items) {
  const assignments = {};
  items.forEach((item) => {
    assignments[item.id] = 'A';
  });
  return assignments;
}

function processTablesWithSessions(tablesData) {
  if (!tablesData) return [];
  return tablesData.map((table) => ({
    ...table,
    active_session: (table.customer_sessions || []).find(
      (s) => s.session_status === SESSION_STATUS.active || s.session_status === SESSION_STATUS.billing
    ),
    held_session: (table.customer_sessions || []).find(
      (s) => s.session_status === SESSION_STATUS.hold
    ),
    completed_session: (table.customer_sessions || []).find(
      (s) => s.session_status === SESSION_STATUS.completed
    ),
  }));
}

async function updateOrderTotalOnline(orderId, items) {
  const orderItems = items.filter((i) => i.orderId === orderId);
  if (orderItems.length === 0) {
    return supabase.from('orders').delete().eq('id', orderId);
  }
  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;
  return supabase.from('orders').update({ subtotal, tax, total }).eq('id', orderId);
}

export function useBillingData() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isOnline, syncing, syncProgress, lastSyncResult, syncNow, cacheFromSupabase } = useOfflineSync();

  const sessionId = searchParams.get('sessionId');
  const queryTab = searchParams.get('tab') || 'tables';

  const [state, setState] = useState({
    activeTab: queryTab,
    activeArea: 'all',
    tables: [],
    sections: [],
    loadingWorkspace: true,
    workspaceError: null,
  });

  const [sessionState, setSessionState] = useState({
    session: null,
    items: [],
    isPaid: false,
    loadingSession: false,
    sessionError: null,
  });

  const [uiState, setUiState] = useState({
    paymentMethod: 'card',
    isEditingQuantities: false,
    loadingAction: false,
    discountType: 'none',
    discountValue: 0,
    serviceChargePercent: 0,
    showServiceCharge: false,
    splitPayments: [],
    amountPaid: 0,
    voidReason: '',
    holdNote: '',
  });

  const cleanupTimerRef = useRef(null);

  const [modalState, setModalState] = useState({
    showAssignModal: false,
    showMoveTableModal: false,
    showMergeOrderModal: false,
    showSplitBillModal: false,
    showEditItemModal: false,
    selectedTableForNewOrder: null,
    availableTables: [],
    occupiedSessions: [],
    selectedMoveTableId: '',
    selectedMergeSessionId: '',
    customerData: { name: '', phone: '', guests: 2 },
    selectedEditItem: null,
    editQty: 1,
    splitTab: 'equal',
    splitWays: 2,
    itemAssignments: {},
    aggregators: { swiggy: true, zomato: true, direct: true },
  });

  const closeModals = useCallback(() => {
    setModalState((prev) => ({
      ...prev,
      showAssignModal: false,
      showMoveTableModal: false,
      showMergeOrderModal: false,
      showSplitBillModal: false,
      showEditItemModal: false,
    }));
  }, []);

  const setPaymentMethod = useCallback((method) => {
    setUiState((prev) => ({ ...prev, paymentMethod: method }));
  }, []);

  const setEditingQuantities = useCallback((editing) => {
    setUiState((prev) => ({ ...prev, isEditingQuantities: editing }));
  }, []);

  const setLoadingAction = useCallback((loading) => {
    setUiState((prev) => ({ ...prev, loadingAction: loading }));
  }, []);

  const setDiscountType = useCallback((discountType) => {
    setUiState((prev) => ({ ...prev, discountType }));
  }, []);

  const setDiscountValue = useCallback((discountValue) => {
    setUiState((prev) => ({ ...prev, discountValue: Math.max(0, discountValue) }));
  }, []);

  const setServiceChargePercent = useCallback((value) => {
    setUiState((prev) => ({ ...prev, serviceChargePercent: value, showServiceCharge: value > 0 }));
  }, []);

  const toggleServiceCharge = useCallback(() => {
    setUiState((prev) => ({
      ...prev,
      showServiceCharge: !prev.showServiceCharge,
      serviceChargePercent: !prev.showServiceCharge ? prev.serviceChargePercent || 10 : 0,
    }));
  }, []);

  const setSplitPayments = useCallback((splitPayments) => {
    setUiState((prev) => ({ ...prev, splitPayments }));
  }, []);

  const setAmountPaid = useCallback((amountPaid) => {
    setUiState((prev) => ({ ...prev, amountPaid: Math.max(0, amountPaid) }));
  }, []);

  const setVoidReason = useCallback((voidReason) => {
    setUiState((prev) => ({ ...prev, voidReason }));
  }, []);

  const setHoldNote = useCallback((holdNote) => {
    setUiState((prev) => ({ ...prev, holdNote }));
  }, []);

  const updateTab = useCallback(
    (tab) => {
      setSearchParams({ tab });
    },
    [setSearchParams]
  );

  const fetchWorkspaceData = useCallback(async () => {
    setState((prev) => ({ ...prev, loadingWorkspace: true, workspaceError: null }));
    try {
      if (isOnline) {
        const sectionsPromise = supabase.from('restaurant_sections').select('*').order('section_name');
        const tablesPromise = supabase
          .from('restaurant_tables')
          .select('*, customer_sessions(id, customer_name, guest_count, started_at, session_status, ended_at)')
          .order('table_number');

        const sectionsData = await cacheFromSupabase('sections', sectionsPromise);
        const tablesResult = await cacheFromSupabase('tables', tablesPromise);

        const menuCategoriesPromise = supabase.from('menu_categories').select('*').order('category_name');
        const menuItemsPromise = supabase.from('menu_items').select('*').eq('is_available', true);
        await Promise.all([
          cacheFromSupabase('menu_categories', menuCategoriesPromise),
          cacheFromSupabase('menu_items', menuItemsPromise),
        ]);

        const tablesData = tablesResult || [];
        const finalSections = sectionsData || [];

        setState((prev) => ({
          ...prev,
          sections: finalSections,
          tables: processTablesWithSessions(tablesData),
          loadingWorkspace: false,
        }));
      } else {
        const cachedTables = (await db.getAll('tables')) || [];
        const cachedSections = (await db.getAll('sections')) || [];
        setState((prev) => ({
          ...prev,
          sections: cachedSections,
          tables: processTablesWithSessions(cachedTables),
          loadingWorkspace: false,
        }));
      }
    } catch (err) {
      const cachedTables = (await db.getAll('tables')) || [];
      const cachedSections = (await db.getAll('sections')) || [];
      if (cachedTables.length > 0) {
        setState((prev) => ({
          ...prev,
          sections: cachedSections,
          tables: processTablesWithSessions(cachedTables),
          loadingWorkspace: false,
        }));
      } else {
        setState((prev) => ({
          ...prev,
          loadingWorkspace: false,
          workspaceError: err.message || 'Failed to load workspace data',
        }));
      }
    }
  }, [isOnline, cacheFromSupabase]);

  const fetchSessionData = useCallback(async () => {
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
      setSessionState({ session: null, items: [], isPaid: false, loadingSession: false, sessionError: null });
      return;
    }

    setSessionState((prev) => ({ ...prev, loadingSession: true, sessionError: null }));
    try {
      let sessionData;

      if (isOnline) {
        const { data, error } = await supabase
          .from('customer_sessions')
          .select(
            `*, restaurant_tables(table_number), orders(id, total, subtotal, tax, order_items(id, menu_item_id, quantity, item_price, menu_items(item_name)))`
          )
          .eq('id', sessionId)
          .single();

        if (error) throw error;
        sessionData = data;

        if (sessionData) {
          await db.put('sessions', sessionData);
          await db.putMany('orders', sessionData.orders || []);
          const orderItems = (sessionData.orders || []).flatMap((o) =>
            (o.order_items || []).map((oi) => ({ ...oi, orderId: o.id }))
          );
          if (orderItems.length > 0) {
            await db.putMany('order_items', orderItems);
          }
        }
      } else {
        sessionData = await db.getById('sessions', sessionId);
        if (sessionData) {
          const orders = await db.getAll('orders');
          const relatedOrders = orders.filter((o) => o.session_id === sessionId);
          sessionData.orders = relatedOrders.map((o) => ({
            ...o,
            order_items: [],
          }));
          const orderItems = await db.getAll('order_items');
          sessionData.orders = sessionData.orders.map((o) => ({
            ...o,
            order_items: orderItems.filter((oi) => oi.order_id === o.id || oi.orderId === o.id),
          }));
        }
      }

      const items = flattenOrderItems(sessionData);
      const assignments = buildItemAssignments(items);

      setSessionState({
        session: sessionData,
        items,
        isPaid: sessionData?.session_status === SESSION_STATUS.completed,
        loadingSession: false,
        sessionError: null,
      });

      setModalState((prev) => ({ ...prev, itemAssignments: assignments }));
    } catch (err) {
      setSessionState((prev) => ({
        ...prev,
        loadingSession: false,
        sessionError: err.message || 'Failed to load session',
      }));
    }
  }, [sessionId, isOnline]);

  const handleStartSession = useCallback(
    async (e) => {
      e.preventDefault();
      const table = modalState.selectedTableForNewOrder;
      if (!table) return;

      setLoadingAction(true);
      try {
        if (isOnline) {
          const { data: newSession, error: sessionError } = await supabase
            .from('customer_sessions')
            .insert([
              {
                table_id: table.id,
                customer_name: modalState.customerData.name || 'Walk-in Guest',
                phone_number: modalState.customerData.phone,
                guest_count: modalState.customerData.guests,
                session_status: SESSION_STATUS.active,
              },
            ])
            .select()
            .single();

          if (sessionError) throw sessionError;

          await supabase
            .from('restaurant_tables')
            .update({ status: TABLE_STATUS.occupied })
            .eq('id', table.id);

          closeModals();
          await fetchWorkspaceData();
          navigate(`/menu?sessionId=${newSession.id}&tableId=${table.id}`);
        } else {
          const tempId = db.generateTempId();
          const sessionData = {
            id: tempId,
            table_id: table.id,
            customer_name: modalState.customerData.name || 'Walk-in Guest',
            phone_number: modalState.customerData.phone,
            guest_count: modalState.customerData.guests,
            session_status: SESSION_STATUS.active,
            started_at: new Date().toISOString(),
          };

          await db.put('sessions', sessionData);

          const updatedTable = { ...table, status: TABLE_STATUS.occupied };
          await db.put('tables', updatedTable);

          await db.enqueueSync({
            action: 'insert',
            table: 'customer_sessions',
            tempId,
            data: {
              table_id: table.id,
              customer_name: sessionData.customer_name,
              phone_number: sessionData.phone_number,
              guest_count: sessionData.guest_count,
              session_status: SESSION_STATUS.active,
            },
          });

          await db.enqueueSync({
            action: 'update',
            table: 'restaurant_tables',
            data: { id: table.id, status: TABLE_STATUS.occupied },
          });

          closeModals();
          await fetchWorkspaceData();
          setSearchParams({ tab: 'tables', sessionId: tempId });
        }
      } catch (err) {
        alert('Error starting session: ' + err.message);
      } finally {
        setLoadingAction(false);
      }
    },
    [modalState.selectedTableForNewOrder, modalState.customerData, closeModals, fetchWorkspaceData, navigate, isOnline, setSearchParams, setLoadingAction]
  );

  const scheduleTableCleanup = useCallback(
    (tableId, delayMs) => {
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = setTimeout(async () => {
        try {
          const online = navigator.onLine;
          if (online) {
            await supabase.from('restaurant_tables').update({ status: TABLE_STATUS.available }).eq('id', tableId);
          } else {
            const tables = await db.getAll('tables');
            const target = tables.find((t) => t.id === tableId);
            if (target) {
              await db.put('tables', { ...target, status: TABLE_STATUS.available });
              await db.enqueueSync({
                action: 'update', table: 'restaurant_tables',
                data: { id: tableId, status: TABLE_STATUS.available },
              });
            }
          }
          // Belt-and-braces: the settle path already completed the session, but
          // the table must never go available with a live session behind it.
          await closeSessionsForTables([tableId], { online });
          await fetchWorkspaceData();
        } catch (err) {
          // auto-cleanup failed silently; Free All button handles leftovers
        }
      }, delayMs);
    },
    [fetchWorkspaceData]
  );

  useEffect(() => {
    return () => {
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    };
  }, []);

  const handleMarkAsPaid = useCallback(async () => {
    setLoadingAction(true);
    try {
      const curTotal = calcTotal(
        calcSubtotal(sessionState.items) - calcDiscountAmount(calcSubtotal(sessionState.items), uiState.discountType, uiState.discountValue),
        0,
        calcServiceCharge(calcSubtotal(sessionState.items) - calcDiscountAmount(calcSubtotal(sessionState.items), uiState.discountType, uiState.discountValue), uiState.showServiceCharge ? uiState.serviceChargePercent : 0)
      );
      const isPartial = uiState.splitPayments.length > 0
        ? uiState.splitPayments.reduce((s, p) => s + p.amount, 0) < curTotal
        : uiState.amountPaid > 0 && uiState.amountPaid < curTotal;
      const isFullyPaid = !isPartial;

      // The figures the till worked out and put on the customer's bill. They
      // are recorded as they stand rather than recomputed anywhere else: two
      // implementations of the same arithmetic eventually disagree, and the
      // one the customer was handed is the one that has to be on record.
      const billSubtotal = calcSubtotal(sessionState.items);
      const billDiscount = calcDiscountAmount(
        billSubtotal, uiState.discountType, uiState.discountValue,
      );
      const billService = calcServiceCharge(
        billSubtotal - billDiscount,
        uiState.showServiceCharge ? uiState.serviceChargePercent : 0,
      );

      /**
       * Settling has always closed the session and never written a bill, so
       * every table settled at the till was invisible to the payment-mode
       * report and its discount lived only in session metadata. record_bill is
       * idempotent on the session, so a partial payment followed by the rest
       * updates one row rather than making two.
       */
      const writeBill = async (paid) => {
        const { error: billError } = await supabase.rpc('record_bill', {
          p_session_id: sessionId,
          p_payment_method: uiState.paymentMethod || 'cash',
          p_subtotal: billSubtotal,
          p_discount_type: uiState.discountType === 'none' ? null : uiState.discountType,
          p_discount_amount: billDiscount,
          p_service_charge: billService,
          p_tax: 0,
          p_total: curTotal,
          p_paid: paid,
        });
        // A bill that fails to save must not strand a paid table on the floor;
        // the settle itself is what the staff are waiting on.
        if (billError) console.error('Could not record the bill:', billError);
      };

      if (isOnline) {
        if (isFullyPaid) {
          await writeBill(true);
          await supabase
            .from('customer_sessions')
            .update({ session_status: SESSION_STATUS.completed, ended_at: new Date().toISOString() })
            .eq('id', sessionId);
          // Close the orders as well. Settling used to end the session and
          // leave its orders at 'preparing' for ever, so the dashboard went on
          // counting them as live and reported the table as open and unbilled
          // long after it had been paid and cleared.
          await supabase
            .from('orders')
            .update({ order_status: ORDER_STATUS.completed })
            .eq('session_id', sessionId)
            .neq('order_status', ORDER_STATUS.cancelled);
          await supabase
            .from('restaurant_tables')
            .update({ status: TABLE_STATUS.cleaning })
            .eq('id', sessionState.session?.table_id);
          scheduleTableCleanup(sessionState.session?.table_id, TABLE_CLEANUP_DELAY_MS);
        } else {
          await writeBill(false);
          const { error: partialError } = await supabase
            .from('customer_sessions')
            .update({ session_status: SESSION_STATUS.billing })
            .eq('id', sessionId);
          if (partialError) throw partialError;
        }
        setSessionState((prev) => ({ ...prev, isPaid: isFullyPaid }));
        alert(isFullyPaid ? 'Payment marked as successful!' : `Partial payment of ${FORMAT_CURRENCY.format(uiState.amountPaid || curTotal)} recorded.`);
        setSearchParams({ tab: state.activeTab });
        await fetchWorkspaceData();
      } else {
          if (sessionState.session) {
            const metadata = {
              discountType: uiState.discountType,
              discountValue: uiState.discountValue,
              showServiceCharge: uiState.showServiceCharge,
              serviceChargePercent: uiState.serviceChargePercent,
              amountPaid: uiState.amountPaid,
              splitPayments: uiState.splitPayments,
              subtotal: subtotal,
              discountAmount: discountAmount,
              serviceCharge: serviceCharge,
              tax: tax,
              total: total,
            };
            const updatedSession = {
              ...sessionState.session,
              session_status: isFullyPaid ? SESSION_STATUS.completed : SESSION_STATUS.billing,
              ended_at: isFullyPaid ? new Date().toISOString() : sessionState.session.ended_at,
              metadata,
            };
            await db.put('sessions', updatedSession);
          await db.enqueueSync({
            action: 'update',
            table: 'customer_sessions',
            data: {
              id: sessionId,
              session_status: isFullyPaid ? SESSION_STATUS.completed : SESSION_STATUS.billing,
              ended_at: isFullyPaid ? new Date().toISOString() : undefined,
            },
          });
          if (isFullyPaid) {
            // The same closing of the orders as the online path, queued to sync.
            const cachedOrders = (await db.getAll('orders')) || [];
            for (const o of cachedOrders.filter(
              (x) => x.session_id === sessionId && x.order_status !== ORDER_STATUS.cancelled,
            )) {
              await db.put('orders', { ...o, order_status: ORDER_STATUS.completed });
              await db.enqueueSync({
                action: 'update', table: 'orders',
                data: { id: o.id, order_status: ORDER_STATUS.completed },
              });
            }
            const tables = await db.getAll('tables');
            const targetTable = tables.find((t) => t.id === sessionState.session.table_id);
            if (targetTable) {
              await db.put('tables', { ...targetTable, status: TABLE_STATUS.cleaning });
              await db.enqueueSync({
                action: 'update', table: 'restaurant_tables',
                data: { id: targetTable.id, status: TABLE_STATUS.cleaning },
              });
              scheduleTableCleanup(targetTable.id, TABLE_CLEANUP_DELAY_MS);
            }
          }
          setSessionState((prev) => ({ ...prev, isPaid: isFullyPaid }));
          alert(isFullyPaid
            ? 'Payment recorded offline. Will sync when connected.'
            : 'Partial payment recorded offline.');
          setUiState((prev) => ({ ...prev, splitPayments: [], amountPaid: 0 }));
        }
      }
    } catch (err) {
      alert('Payment processing error: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  }, [sessionId, sessionState.session, state.activeTab, isOnline, uiState.splitPayments, uiState.amountPaid, uiState.discountType, uiState.discountValue, uiState.showServiceCharge, uiState.serviceChargePercent, sessionState.items, setSearchParams, fetchWorkspaceData, setLoadingAction]);

  const handleAddManualItem = useCallback(
    async (name, qty, unitPrice) => {
      if (!sessionId || !name || qty < 1 || unitPrice < 0) return;
      setLoadingAction(true);
      try {
        if (isOnline) {
          const subtotal = unitPrice * qty;
          const tax = subtotal * TAX_RATE;
          const total = subtotal + tax;
          const { data: order, error: orderError } = await supabase
            .from('orders').insert([{ session_id: sessionId, order_status: 'preparing', subtotal, tax, total }]).select().single();
          if (orderError) throw orderError;
          const { error: itemError } = await supabase
            .from('order_items').insert([{ order_id: order.id, menu_item_id: null, quantity: qty, item_price: unitPrice, total_price: unitPrice * qty }]);
          if (itemError) throw itemError;
        } else {
          const orderTempId = db.generateTempId();
          const subtotal = unitPrice * qty;
          const tax = subtotal * TAX_RATE;
          const total = subtotal + tax;
          await db.put('orders', {
            id: orderTempId, session_id: sessionId, order_status: 'preparing',
            subtotal, tax, total, created_at: new Date().toISOString(),
          });
          await db.enqueueSync({
            action: 'insert', table: 'orders', tempId: orderTempId,
            data: { session_id: sessionId, order_status: 'preparing', subtotal, tax, total },
          });
          const itemTempId = db.generateTempId();
          await db.put('order_items', {
            id: itemTempId, order_id: orderTempId, menu_item_id: null,
            quantity: qty, item_price: unitPrice, total_price: unitPrice * qty,
          });
          await db.enqueueSync({
            action: 'insert', table: 'order_items', tempId: itemTempId,
            data: { order_id: orderTempId, menu_item_id: null, quantity: qty, item_price: unitPrice, total_price: unitPrice * qty },
          });
        }
        await fetchSessionData();
      } catch (err) {
        alert('Error adding item: ' + err.message);
      } finally {
        setLoadingAction(false);
      }
    },
    [sessionId, isOnline, fetchSessionData, setLoadingAction]
  );

  const handleUpdateItemQty = useCallback(
    async (itemId, orderId, newQty) => {
      setLoadingAction(true);
      try {
        if (isOnline) {
          if (newQty <= 0) {
            await supabase.from('order_items').delete().eq('id', itemId);
          } else {
            const item = sessionState.items.find((i) => i.id === itemId);
            if (!item) throw new Error('Item not found');
            const totalPrice = item.price * newQty;
            await supabase.from('order_items').update({ quantity: newQty, total_price: totalPrice }).eq('id', itemId);
          }
          await updateOrderTotalOnline(orderId, sessionState.items.filter((i) => i.orderId === orderId));
          await fetchSessionData();
        } else {
          if (newQty <= 0) {
            await db.remove('order_items', itemId);
            await db.enqueueSync({ action: 'delete', table: 'order_items', data: { id: itemId } });
          } else {
            const item = sessionState.items.find((i) => i.id === itemId);
            if (!item) throw new Error('Item not found');
            const totalPrice = item.price * newQty;
            await db.put('order_items', { id: itemId, quantity: newQty, total_price: totalPrice });
            await db.enqueueSync({
              action: 'update',
              table: 'order_items',
              data: { id: itemId, quantity: newQty, total_price: totalPrice },
            });
          }
          await fetchSessionData();
        }
      } catch (err) {
        alert('Error updating quantity: ' + err.message);
      } finally {
        setLoadingAction(false);
      }
    },
    [sessionState.items, fetchSessionData, isOnline, setLoadingAction]
  );

  const handleOpenMoveTable = useCallback(async () => {
    setModalState((prev) => ({ ...prev, showMoveTableModal: true }));
    setLoadingAction(true);
    try {
      let availableData;
      if (isOnline) {
        const { data, error } = await supabase
          .from('restaurant_tables')
          .select('*')
          .eq('status', TABLE_STATUS.available)
          .order('table_number');
        if (!error) availableData = data;
      } else {
        const allTables = await db.getAll('tables');
        availableData = allTables.filter((t) => t.status === TABLE_STATUS.available);
      }

      if (availableData) {
        setModalState((prev) => ({
          ...prev,
          availableTables: availableData,
          selectedMoveTableId: availableData.length > 0 ? availableData[0].id : '',
        }));
      }
    } catch (err) {
      alert('Error loading available tables: ' + (err.message || err));
    } finally {
      setLoadingAction(false);
    }
  }, [isOnline, setLoadingAction]);

  const handleConfirmMoveTable = useCallback(async () => {
    if (!modalState.selectedMoveTableId) return;
    setLoadingAction(true);
    try {
      const oldTableId = sessionState.session?.table_id;
      const newTableId = modalState.selectedMoveTableId;

      if (isOnline) {
        await supabase.from('customer_sessions').update({ table_id: newTableId }).eq('id', sessionId);
        await supabase.from('restaurant_tables').update({ status: TABLE_STATUS.occupied }).eq('id', newTableId);
        await supabase.from('restaurant_tables').update({ status: TABLE_STATUS.available }).eq('id', oldTableId);
        await supabase.from('orders').update({ table_id: newTableId }).eq('session_id', sessionId);
      } else {
        if (sessionState.session) {
          const updatedSession = { ...sessionState.session, table_id: newTableId };
          await db.put('sessions', updatedSession);
          await db.enqueueSync({ action: 'update', table: 'customer_sessions', data: { id: sessionId, table_id: newTableId } });

          const tables = await db.getAll('tables');
          const oldTable = tables.find((t) => t.id === oldTableId);
          const newTable = tables.find((t) => t.id === newTableId);
          if (oldTable) {
            await db.put('tables', { ...oldTable, status: TABLE_STATUS.available });
            await db.enqueueSync({ action: 'update', table: 'restaurant_tables', data: { id: oldTableId, status: TABLE_STATUS.available } });
          }
          if (newTable) {
            await db.put('tables', { ...newTable, status: TABLE_STATUS.occupied });
            await db.enqueueSync({ action: 'update', table: 'restaurant_tables', data: { id: newTableId, status: TABLE_STATUS.occupied } });
          }

          const orders = await db.getAll('orders');
          const sessionOrders = orders.filter((o) => o.session_id === sessionId);
          for (const order of sessionOrders) {
            await db.put('orders', { ...order, table_id: newTableId });
            await db.enqueueSync({ action: 'update', table: 'orders', data: { id: order.id, table_id: newTableId } });
          }
        }
      }

      closeModals();
      await fetchSessionData();
      await fetchWorkspaceData();
      alert('Table moved successfully!');
    } catch (err) {
      alert('Error moving table: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  }, [
    modalState.selectedMoveTableId,
    sessionState.session,
    sessionId,
    isOnline,
    closeModals,
    fetchSessionData,
    fetchWorkspaceData,
    setLoadingAction,
  ]);

  const handleOpenMergeOrder = useCallback(async () => {
    setModalState((prev) => ({ ...prev, showMergeOrderModal: true }));
    setLoadingAction(true);
    try {
      let otherSessions;
      if (isOnline) {
        const { data, error } = await supabase
          .from('customer_sessions')
          .select('id, customer_name, restaurant_tables(table_number)')
          .eq('session_status', SESSION_STATUS.active)
          .neq('id', sessionId);

        if (!error) otherSessions = data;
      } else {
        const allSessions = await db.getAll('sessions');
        otherSessions = allSessions.filter((s) => s.session_status === SESSION_STATUS.active && s.id !== sessionId);
      }

      if (otherSessions) {
        setModalState((prev) => ({
          ...prev,
          occupiedSessions: otherSessions,
          selectedMergeSessionId: otherSessions.length > 0 ? otherSessions[0].id : '',
        }));
      }
    } catch (err) {
      alert('Error loading sessions: ' + (err.message || err));
    } finally {
      setLoadingAction(false);
    }
  }, [sessionId, isOnline, setLoadingAction]);

  const handleConfirmMergeOrder = useCallback(async () => {
    if (!modalState.selectedMergeSessionId) return;
    setLoadingAction(true);
    try {
      if (isOnline) {
        const { data: targetSession } = await supabase
          .from('customer_sessions')
          .select('table_id')
          .eq('id', modalState.selectedMergeSessionId)
          .single();

        await supabase.from('orders').update({ session_id: sessionId }).eq('session_id', modalState.selectedMergeSessionId);
        await supabase
          .from('customer_sessions')
          .update({ session_status: SESSION_STATUS.completed, ended_at: new Date().toISOString() })
          .eq('id', modalState.selectedMergeSessionId);
        await supabase
          .from('restaurant_tables')
          .update({ status: TABLE_STATUS.available })
          .eq('id', targetSession?.table_id);
      } else {
        const orders = await db.getAll('orders');
        const mergingOrders = orders.filter((o) => o.session_id === modalState.selectedMergeSessionId);
        for (const order of mergingOrders) {
          await db.put('orders', { ...order, session_id: sessionId });
          await db.enqueueSync({
            action: 'update',
            table: 'orders',
            data: { id: order.id, session_id: sessionId },
          });
        }

        const targetSession = (await db.getAll('sessions')).find((s) => s.id === modalState.selectedMergeSessionId);
        if (targetSession) {
          await db.put('sessions', {
            ...targetSession,
            session_status: SESSION_STATUS.completed,
            ended_at: new Date().toISOString(),
          });
          await db.enqueueSync({
            action: 'update',
            table: 'customer_sessions',
            data: { id: targetSession.id, session_status: SESSION_STATUS.completed, ended_at: new Date().toISOString() },
          });

          const tables = await db.getAll('tables');
          const mergedTable = tables.find((t) => t.id === targetSession.table_id);
          if (mergedTable) {
            await db.put('tables', { ...mergedTable, status: TABLE_STATUS.available });
            await db.enqueueSync({
              action: 'update',
              table: 'restaurant_tables',
              data: { id: mergedTable.id, status: TABLE_STATUS.available },
            });
          }
        }
      }

      closeModals();
      await fetchSessionData();
      await fetchWorkspaceData();
      alert('Orders merged successfully!');
    } catch (err) {
      alert('Error merging: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  }, [
    modalState.selectedMergeSessionId,
    sessionId,
    isOnline,
    closeModals,
    fetchSessionData,
    fetchWorkspaceData,
    setLoadingAction,
  ]);

  const handlePrint = useCallback((type) => {
    const sess = sessionState.session;
    const items = sessionState.items;
    if (!sess) return;
    const tableNumber = sess.restaurant_tables?.table_number || '—';
    const billId = (sess.id || '').slice(0, 4).toUpperCase();
    const subtotal = calcSubtotal(items);
    const discountAmount = calcDiscountAmount(subtotal, uiState.discountType, uiState.discountValue);
    const afterDiscount = subtotal - discountAmount;
    const serviceCharge = calcServiceCharge(afterDiscount, uiState.showServiceCharge ? uiState.serviceChargePercent : 0);
    const taxableAmount = afterDiscount + serviceCharge;
    const cgst = taxableAmount * (TAX_RATE / 2);
    const sgst = taxableAmount * (TAX_RATE / 2);
    const total = taxableAmount + cgst + sgst;

    const formatCurrency = (v) => FORMAT_CURRENCY ? FORMAT_CURRENCY.format(v || 0) : '₹' + (v || 0).toFixed(2);

    setTimeout(() => {
      const win = window.open('', '_blank');
      if (!win) { window.print(); return; }

      // A kitchen ticket carries what to cook, never money.
      if (type === 'kot') {
        let kotRows = '';
        for (const item of items) {
          kotRows += `<tr><td class="qty">${item.qty}</td><td>${item.name}</td></tr>`;
        }
        win.document.write(`<!DOCTYPE html><html><head><title>KOT - ${billId}</title>
        <style>
          body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; padding: 0.75rem; font-size: 13px; }
          h2 { text-align: center; font-size: 18px; margin: 0 0 2px 0; letter-spacing: 2px; }
          .sub { text-align: center; font-size: 11px; color: #555; margin: 0 0 8px 0; }
          hr { border: none; border-top: 1px dashed #333; margin: 6px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 14px; }
          td { padding: 5px 0; vertical-align: top; }
          .qty { width: 34px; font-weight: bold; font-size: 16px; }
          .meta { font-size: 12px; }
          @media print { body { margin: 0; padding: 0.5rem; } @page { margin: 0; } }
        </style></head><body>
        <h2>KOT</h2>
        <div class="sub">Kitchen Order Ticket</div>
        <hr/>
        <div class="meta"><strong>Table:</strong> T-${tableNumber} &nbsp; <strong>Bill #:</strong> ${billId}</div>
        <div class="meta"><strong>Guests:</strong> ${sess.guest_count || '—'}</div>
        <div class="meta"><strong>Time:</strong> ${new Date().toLocaleString('en-IN')}</div>
        <hr/>
        <table>${kotRows}</table>
        <hr/>
        <div class="sub">${items.length} line${items.length === 1 ? '' : 's'}</div>
        <script>window.print();window.close();</script>
        </body></html>`);
        win.document.close();
        return;
      }

      let itemRows = '';
      for (const item of items) {
        itemRows += `<tr><td>${item.name}</td><td class="center">${item.qty}</td><td class="right">${formatCurrency(item.price)}</td><td class="right">${formatCurrency(item.price * item.qty)}</td></tr>`;
      }

      win.document.write(`<!DOCTYPE html><html><head><title>Invoice - ${billId}</title>
      <style>
        body { font-family: 'Courier New', monospace; width: 280px; margin: 0 auto; padding: 0.75rem; font-size: 12px; }
        h2 { text-align: center; font-size: 16px; margin: 0 0 2px 0; }
        .sub { text-align: center; font-size: 10px; color: #555; margin: 0 0 8px 0; }
        hr { border: none; border-top: 1px dashed #333; margin: 6px 0; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { text-align: left; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #333; padding: 3px 0; }
        td { padding: 2px 0; }
        .right { text-align: right; }
        .center { text-align: center; }
        .total-row td { font-weight: bold; padding-top: 4px; border-top: 1px dashed #333; }
        .grand-total td { font-size: 14px; font-weight: bold; border-top: 2px solid #333; padding-top: 4px; }
        .footer { text-align: center; font-size: 10px; color: #555; margin-top: 12px; }
        .gst-row td { font-size: 10px; color: #555; }
        @media print { body { margin: 0; padding: 0.5rem; } @page { margin: 0; } }
      </style></head><body>
      <h2>SPICE OS</h2>
      <div class="sub">123 Downtown St, Metro | Tel: +91 90812 01234</div>
      <hr/>
      <div><strong>Bill #:</strong> ${billId} &nbsp; <strong>Table:</strong> T-${tableNumber}</div>
      <div><strong>Customer:</strong> ${sess.customer_name || 'Walk-in'} &nbsp; <strong>Guests:</strong> ${sess.guest_count || '—'}</div>
      <div><strong>Date:</strong> ${new Date().toLocaleString('en-IN')}</div>
      <hr/>
      <table>
        <tr><th>Item</th><th class="center">Qty</th><th class="right">Rate</th><th class="right">Total</th></tr>
        ${itemRows}
      </table>
      <hr/>
      <table>
        <tr><td>Subtotal</td><td class="right">${formatCurrency(subtotal)}</td></tr>
        ${discountAmount > 0 ? `<tr><td>Discount${uiState.discountType === 'percentage' ? ` (${uiState.discountValue}%)` : ''}</td><td class="right">-${formatCurrency(discountAmount)}</td></tr>` : ''}
        ${uiState.showServiceCharge && serviceCharge > 0 ? `<tr><td>Service Charge (${uiState.serviceChargePercent}%)</td><td class="right">${formatCurrency(serviceCharge)}</td></tr>` : ''}
        <tr class="gst-row"><td>CGST (5%)</td><td class="right">${formatCurrency(cgst)}</td></tr>
        <tr class="gst-row"><td>SGST (5%)</td><td class="right">${formatCurrency(sgst)}</td></tr>
        <tr class="grand-total"><td>Grand Total</td><td class="right">${formatCurrency(total)}</td></tr>
      </table>
      <hr/>
      <div class="footer">Thank You! Visit Again</div>
      <script>window.print();window.close();</script>
      </body></html>`);
      win.document.close();
    }, 100);
  }, [sessionState.session, sessionState.items, uiState.discountType, uiState.discountValue, uiState.showServiceCharge, uiState.serviceChargePercent]);

  const handleHoldBill = useCallback(async () => {
    setLoadingAction(true);
    try {
      if (isOnline) {
        const { error: holdError } = await supabase
          .from('customer_sessions')
          .update({ session_status: SESSION_STATUS.hold })
          .eq('id', sessionId);
        if (holdError) throw holdError;
        await supabase.from('restaurant_tables').update({ status: TABLE_STATUS.available }).eq('id', sessionState.session?.table_id);
      } else {
        if (sessionState.session) {
          const updatedSession = {
            ...sessionState.session,
            session_status: SESSION_STATUS.hold,
            metadata: { ...sessionState.session.metadata, holdNote: uiState.holdNote },
          };
          await db.put('sessions', updatedSession);
          await db.enqueueSync({
            action: 'update', table: 'customer_sessions',
            data: { id: sessionId, session_status: SESSION_STATUS.hold },
          });
          const tables = await db.getAll('tables');
          const targetTable = tables.find((t) => t.id === sessionState.session.table_id);
          if (targetTable) {
            await db.put('tables', { ...targetTable, status: TABLE_STATUS.available });
            await db.enqueueSync({
              action: 'update', table: 'restaurant_tables',
              data: { id: targetTable.id, status: TABLE_STATUS.available },
            });
          }
        }
      }
      setSearchParams({ tab: state.activeTab });
      await fetchWorkspaceData();
    } catch (err) {
      alert('Error holding bill: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  }, [sessionId, sessionState.session, state.activeTab, isOnline, setSearchParams, fetchWorkspaceData, setLoadingAction]);

  const handleResumeBill = useCallback(async (targetSessionId) => {
    setLoadingAction(true);
    try {
      const sid = targetSessionId || sessionId;
      if (isOnline) {
        const { data: sessionData } = await supabase
          .from('customer_sessions').select('*').eq('id', sid).single();
        if (sessionData) {
          await supabase.from('customer_sessions').update({ session_status: SESSION_STATUS.active }).eq('id', sid);
          await supabase.from('restaurant_tables').update({ status: TABLE_STATUS.occupied }).eq('id', sessionData.table_id);
        }
      } else {
        const allSessions = await db.getAll('sessions');
        const heldSession = allSessions.find((s) => s.id === sid);
        if (heldSession) {
          await db.put('sessions', { ...heldSession, session_status: SESSION_STATUS.active });
          await db.enqueueSync({
            action: 'update', table: 'customer_sessions',
            data: { id: sid, session_status: SESSION_STATUS.active },
          });
          const tables = await db.getAll('tables');
          const targetTable = tables.find((t) => t.id === heldSession.table_id);
          if (targetTable) {
            await db.put('tables', { ...targetTable, status: TABLE_STATUS.occupied });
            await db.enqueueSync({
              action: 'update', table: 'restaurant_tables',
              data: { id: targetTable.id, status: TABLE_STATUS.occupied },
            });
          }
        }
      }
      setSearchParams({ tab: 'tables', sessionId: sid });
      await fetchWorkspaceData();
    } catch (err) {
      alert('Error resuming bill: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  }, [sessionId, isOnline, setSearchParams, fetchWorkspaceData, setLoadingAction]);

  const handleVoidBill = useCallback(async () => {
    if (!uiState.voidReason.trim()) {
      alert('Please enter a reason for voiding this bill.');
      return;
    }
    setLoadingAction(true);
    try {
      if (isOnline) {
        const { error: voidError } = await supabase.from('customer_sessions').update({
          session_status: SESSION_STATUS.void,
          ended_at: new Date().toISOString(),
          metadata: { ...(sessionState.session?.metadata || {}), voidReason: uiState.voidReason },
        }).eq('id', sessionId);
        // Surface a refused write instead of carrying on as if it worked. The
        // status used to be rejected by a check constraint, so voiding did
        // nothing at all and the bill stayed on the floor.
        if (voidError) throw voidError;

        // Cancel the orders too, or they stay open and the dashboard keeps
        // reporting the table as unbilled — the same way settling used to.
        await supabase
          .from('orders')
          .update({ order_status: ORDER_STATUS.cancelled })
          .eq('session_id', sessionId)
          .neq('order_status', ORDER_STATUS.cancelled);

        await supabase.from('restaurant_tables').update({ status: TABLE_STATUS.available }).eq('id', sessionState.session?.table_id);
      } else {
        if (sessionState.session) {
          const updatedSession = {
            ...sessionState.session,
            session_status: SESSION_STATUS.void,
            ended_at: new Date().toISOString(),
            metadata: { ...sessionState.session.metadata, voidReason: uiState.voidReason },
          };
          await db.put('sessions', updatedSession);
          await db.enqueueSync({
            action: 'update', table: 'customer_sessions',
            data: { id: sessionId, session_status: SESSION_STATUS.void, ended_at: new Date().toISOString() },
          });
          const voidedOrders = (await db.getAll('orders')) || [];
          for (const o of voidedOrders.filter(
            (x) => x.session_id === sessionId && x.order_status !== ORDER_STATUS.cancelled,
          )) {
            await db.put('orders', { ...o, order_status: ORDER_STATUS.cancelled });
            await db.enqueueSync({
              action: 'update', table: 'orders',
              data: { id: o.id, order_status: ORDER_STATUS.cancelled },
            });
          }
          const tables = await db.getAll('tables');
          const targetTable = tables.find((t) => t.id === sessionState.session.table_id);
          if (targetTable) {
            await db.put('tables', { ...targetTable, status: TABLE_STATUS.available });
            await db.enqueueSync({
              action: 'update', table: 'restaurant_tables',
              data: { id: targetTable.id, status: TABLE_STATUS.available },
            });
          }
        }
      }
      setUiState((prev) => ({ ...prev, voidReason: '' }));
      setSearchParams({ tab: state.activeTab });
      await fetchWorkspaceData();
    } catch (err) {
      alert('Error voiding bill: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  }, [sessionId, uiState.voidReason, sessionState.session, state.activeTab, isOnline, setSearchParams, fetchWorkspaceData, setLoadingAction]);

  const handleFreeAllCleaningTables = useCallback(async () => {
    const cleaningTables = state.tables.filter((t) => t.status === TABLE_STATUS.cleaning);
    if (cleaningTables.length === 0) {
      alert('No tables currently in cleaning status.');
      return;
    }

    setLoadingAction(true);
    try {
      const online = navigator.onLine;
      const ids = cleaningTables.map((t) => t.id);
      if (online) {
        await supabase.from('restaurant_tables').update({ status: TABLE_STATUS.available }).in('id', ids);
      } else {
        const tables = await db.getAll('tables');
        for (const table of cleaningTables) {
          const localTable = tables.find((t) => t.id === table.id);
          if (localTable) {
            await db.put('tables', { ...localTable, status: TABLE_STATUS.available });
            await db.enqueueSync({
              action: 'update', table: 'restaurant_tables',
              data: { id: table.id, status: TABLE_STATUS.available },
            });
          }
        }
      }
      await closeSessionsForTables(ids, { online });
      await fetchWorkspaceData();
      alert(`${cleaningTables.length} table${cleaningTables.length > 1 ? 's' : ''} freed successfully.`);
    } catch (err) {
      alert('Error freeing tables: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  }, [state.tables, fetchWorkspaceData, setLoadingAction]);

  const handleFreeTable = useCallback(async (tableId) => {
    setLoadingAction(true);
    try {
      const online = navigator.onLine;
      if (online) {
        await supabase.from('restaurant_tables').update({ status: TABLE_STATUS.available }).eq('id', tableId);
      } else {
        const tables = await db.getAll('tables');
        const target = tables.find((t) => t.id === tableId);
        if (target) {
          await db.put('tables', { ...target, status: TABLE_STATUS.available });
          await db.enqueueSync({
            action: 'update', table: 'restaurant_tables',
            data: { id: tableId, status: TABLE_STATUS.available },
          });
        }
      }
      await closeSessionsForTables([tableId], { online });
      await fetchWorkspaceData();
    } catch (err) {
      alert('Error freeing table: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  }, [fetchWorkspaceData, setLoadingAction]);

  useEffect(() => {
    setState((prev) => ({ ...prev, activeTab: queryTab }));
  }, [queryTab]);

  useEffect(() => {
    fetchWorkspaceData();
    if (!isOnline) return;

    const tableSubscription = supabase
      .channel('tables-realtime-billing')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => {
        fetchWorkspaceData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tableSubscription);
    };
  }, [fetchWorkspaceData, isOnline]);

  useEffect(() => {
    fetchSessionData();
  }, [sessionId, fetchSessionData]);

  useEffect(() => {
    if (!isOnline) return;
    fetchWorkspaceData();
    if (!sessionId || !sessionId.startsWith('temp_')) return;
    const resolveTempId = async () => {
      const localSession = await db.getById('sessions', sessionId);
      if (localSession && localSession.id !== sessionId) {
        setSearchParams({ tab: state.activeTab, sessionId: localSession.id });
      }
    };
    resolveTempId();
  }, [isOnline, lastSyncResult]);

  const subtotal = calcSubtotal(sessionState.items);
  const discountAmount = calcDiscountAmount(subtotal, uiState.discountType, uiState.discountValue);
  const taxableAmount = subtotal - discountAmount;
  const serviceCharge = calcServiceCharge(taxableAmount, uiState.showServiceCharge ? uiState.serviceChargePercent : 0);
  const tax = calcTax(taxableAmount);
  const cgst = calcCgst(taxableAmount);
  const sgst = calcSgst(taxableAmount);
  const total = calcTotal(taxableAmount, 0, serviceCharge);
  const remainingBalance = Math.max(0, total - uiState.amountPaid);

  const occupiedCount = state.tables.filter((t) => t.status === TABLE_STATUS.occupied).length;
  const billingCount = state.tables.filter((t) => t.status === TABLE_STATUS.billing).length;
  const cleaningCount = state.tables.filter((t) => t.status === TABLE_STATUS.cleaning).length;

  const filteredTables =
    state.activeArea === 'all'
      ? state.tables
      : state.tables.filter((t) => t.section_id === state.activeArea);

  return {
    state,
    sessionState,
    uiState,
    modalState,
    subtotal,
    taxableAmount,
    discountAmount,
    serviceCharge,
    tax,
    cgst,
    sgst,
    total,
    remainingBalance,
    occupiedCount,
    billingCount,
    cleaningCount,
    filteredTables,
    isOnline,
    syncing,
    syncProgress,
    lastSyncResult,
    syncNow,
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
    setHoldNote,
    updateTab,
    fetchWorkspaceData,
    fetchSessionData,
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
    setModalState,
  };
}
