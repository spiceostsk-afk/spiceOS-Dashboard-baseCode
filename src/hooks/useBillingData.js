import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useOfflineSync } from './useOfflineSync';
import * as db from '../lib/db';
import {
  TABLE_CLEANUP_DELAY_MS,
  SESSION_STATUS, TABLE_STATUS, ORDER_STATUS,
  calcSubtotal, calcDiscountAmount, calcServiceCharge,
  calcTax, calcCgst, calcSgst, calcTotal,
  FORMAT_CURRENCY, formatRatePct,
} from '../lib/calculations';
import { useTaxRate } from './useTaxRate';
import { fmtDateTime } from '../lib/dates';
import { readKotSent, writeKotSent, kotTicketHtml, printTicket } from '../lib/kot';
import { TICKET_CSS, esc, printHtml, loadReceiptProfile } from '../lib/print';
import {
  nextTakeawayToken, pickTakeawayCounter, expandTakeawayRows, isPackingCounter, tokenOf,
} from '../lib/takeaway';
import { resolveId, newUuid, hasPendingSync } from '../lib/sync';
import { groupBillLines, planLineQtyChange } from '../lib/billLines';
import { isNetworkError, reportNetworkFailure } from '../lib/connectivity';

function flattenLines(sessionData) {
  if (!sessionData?.orders) return [];
  return sessionData.orders.flatMap((order) =>
    (order.order_items || []).map((item) => ({
      id: item.id,
      orderId: order.id,
      menuItemId: item.menu_item_id || null,
      // A manual line has no dish; its name is kept in notes.
      name: item.menu_items?.item_name || (!item.menu_item_id && item.notes) || 'Unknown Item',
      qty: item.quantity,
      price: item.item_price,
      cancelled: Boolean(item.is_cancelled),
      cancelReason: item.cancel_reason || null,
    }))
  );
}

/** What the guest pays for. A Void KOT line was cooked but is never billed. */
function flattenOrderItems(sessionData) {
  return flattenLines(sessionData).filter((i) => !i.cancelled);
}

/** Void KOT lines: shown on the bill for the record, never charged. */
function flattenVoidItems(sessionData) {
  return flattenLines(sessionData).filter((i) => i.cancelled);
}

// Which lines have already gone to the kitchen lives in lib/kot.js, shared
// with the order screen that prints the first round.

// Freeing a table must also end whatever meal was on it. resolve-table decides
// the diner's mode purely from "does this table have an active session", so a
// session left open outlives the meal and the next QR scan rejoins the previous
// diner's bill. Anything not already settled is closed out here.
const OPEN_SESSION_STATUSES = [
  SESSION_STATUS.active,
  SESSION_STATUS.billing,
  SESSION_STATUS.hold,
];

/**
 * Packing counters among these ids. Many takeaways share one counter, so
 * "close everything on this table" would close other customers' orders.
 */
async function packingCounterIds(tableIds, { online }) {
  if (online) {
    const { data, error } = await supabase
      .from('restaurant_tables').select('id').in('id', tableIds).eq('kind', 'packing');
    if (error) throw error;
    return new Set((data || []).map((t) => t.id));
  }
  const tables = (await db.getAll('tables')) || [];
  return new Set(tables.filter((t) => tableIds.includes(t.id) && isPackingCounter(t)).map((t) => t.id));
}

async function closeSessionsForTables(allTableIds, { online }) {
  if (!allTableIds || allTableIds.length === 0) return;
  const skip = await packingCounterIds(allTableIds, { online });
  const tableIds = allTableIds.filter((id) => !skip.has(id));
  if (tableIds.length === 0) return;
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

/**
 * The tables as this device knows them offline. The cached tables carry the
 * sessions they had at the last fetch; anything opened, settled or moved here
 * since lives in the local sessions store, so that wins.
 */
async function loadLocalTables() {
  const [tables, sessions] = await Promise.all([db.getAll('tables'), db.getAll('sessions')]);
  return (tables || []).map((table) => {
    const byId = new Map((table.customer_sessions || []).map((s) => [s.id, s]));
    (sessions || [])
      .filter((s) => s.table_id === table.id)
      .forEach((s) => byId.set(s.id, { ...byId.get(s.id), ...s }));
    return { ...table, customer_sessions: [...byId.values()] };
  });
}

/** One session with its orders and lines, from the local stores. */
async function loadLocalSession(sessionId) {
  const session = await db.getById('sessions', sessionId);
  if (!session) return null;
  const [orders, orderItems, menuItems, tables] = await Promise.all([
    db.getAll('orders'), db.getAll('order_items'), db.getAll('menu_items'), db.getAll('tables'),
  ]);
  // Lines saved offline hold only a menu_item_id; the name comes from the
  // cached menu, or the bill reads "Unknown Item" for every dish.
  const nameOf = new Map((menuItems || []).map((m) => [m.id, m.item_name]));
  const table = (tables || []).find((t) => t.id === session.table_id);
  return {
    ...session,
    restaurant_tables: session.restaurant_tables || (table ? { table_number: table.table_number, kind: table.kind } : null),
    orders: (orders || [])
      .filter((o) => o.session_id === sessionId)
      .map((o) => ({
        ...o,
        order_items: (orderItems || [])
          .filter((oi) => oi.order_id === o.id || oi.orderId === o.id)
          .map((oi) => (oi.menu_items?.item_name || !oi.menu_item_id
            ? oi
            : { ...oi, menu_items: { item_name: nameOf.get(oi.menu_item_id) || oi.item_name || 'Unknown Item' } })),
      })),
  };
}

const isOpenSession = (s) =>
  s.session_status === SESSION_STATUS.active || s.session_status === SESSION_STATUS.billing;
const isHeldSession = (s) => s.session_status === SESSION_STATUS.hold;

/**
 * A till can be locked to one floor. Each floor runs its own copy of the
 * POS, and the Basement till should open on the Basement every time — after
 * a refresh, a crash or a logout — without staff picking it again. It is a
 * property of this machine, so it lives in localStorage, per restaurant.
 */
const areaLockKey = () => `spiceos.billing.areaLock.${db.getDbTenant()}`;

function readAreaLock() {
  try {
    return window.localStorage.getItem(areaLockKey()) || null;
  } catch {
    return null; // storage off: the till simply isn't locked
  }
}

function writeAreaLock(areaId) {
  try {
    if (areaId) window.localStorage.setItem(areaLockKey(), areaId);
    else window.localStorage.removeItem(areaLockKey());
  } catch {
    /* the lock holds for this visit only */
  }
}

/** The sessions the floor shows: open, waiting on payment, and held. */
const FLOOR_SESSION_STATUSES = [SESSION_STATUS.active, SESSION_STATUS.billing, SESSION_STATUS.hold];

/** How far back Running Orders lists settled bills for reprinting. */
const RECENT_COMPLETED_MS = 24 * 60 * 60 * 1000;

/**
 * The menu is re-saved for offline use at most this often. Module-level so
 * leaving Billing for the menu and coming back does not fetch it again.
 */
const MENU_CACHE_EVERY_MS = 5 * 60 * 1000;
let lastMenuCacheAt = 0;

/** The most recently settled of a table's sessions, for reprinting. */
function latestCompleted(sessions) {
  let latest = null;
  for (const s of sessions || []) {
    if (s.session_status !== SESSION_STATUS.completed) continue;
    if (!latest || String(s.ended_at || '') > String(latest.ended_at || '')) latest = s;
  }
  return latest || undefined;
}

function processTablesWithSessions(tablesData) {
  if (!tablesData) return [];
  return expandTakeawayRows(tablesData.map((table) => ({
    ...table,
    active_session: (table.customer_sessions || []).find(
      (s) => s.session_status === SESSION_STATUS.active || s.session_status === SESSION_STATUS.billing
    ),
    held_session: (table.customer_sessions || []).find(
      (s) => s.session_status === SESSION_STATUS.hold
    ),
    completed_session: latestCompleted(table.customer_sessions),
  })), { isOpen: isOpenSession, isHeld: isHeldSession });
}

async function updateOrderTotalOnline(orderId, items, taxRate, { hasVoidLines = false } = {}) {
  const orderItems = items.filter((i) => i.orderId === orderId);
  if (orderItems.length === 0) {
    // An order whose remaining lines are all Void KOT stays, at zero, as the
    // record of what the kitchen cooked. Only a truly empty order goes.
    if (hasVoidLines) {
      return supabase.from('orders').update({ subtotal: 0, tax: 0, total: 0 }).eq('id', orderId);
    }
    return supabase.from('orders').delete().eq('id', orderId);
  }
  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = calcTax(subtotal, taxRate);
  const total = subtotal + tax;
  return supabase.from('orders').update({ subtotal, tax, total }).eq('id', orderId);
}

export function useBillingData() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    isOnline, syncing, syncProgress, lastSyncResult, syncNow, cacheFromSupabase,
    pendingCount, failedCount, retryFailed,
  } = useOfflineSync();
  const taxRate = useTaxRate();

  const sessionId = searchParams.get('sessionId');
  const queryTab = searchParams.get('tab') || 'tables';

  const [lockedArea, setLockedArea] = useState(readAreaLock);

  const [state, setState] = useState(() => ({
    activeTab: queryTab,
    activeArea: readAreaLock() || 'all',
    tables: [],
    sections: [],
    loadingWorkspace: true,
    workspaceError: null,
  }));

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
    showTakeawayModal: false,
    selectedTableForNewOrder: null,
    // Set only when the session being opened is a takeaway: { order_type, token }.
    newSessionMetadata: null,
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
      showTakeawayModal: false,
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

  const setActiveArea = useCallback((area) => {
    // A locked till stays on its floor.
    if (lockedArea) return;
    setState((prev) => ({ ...prev, activeArea: area }));
  }, [lockedArea]);

  const lockArea = useCallback((areaId) => {
    if (!areaId || areaId === 'all') return;
    writeAreaLock(areaId);
    setLockedArea(areaId);
    setState((prev) => ({ ...prev, activeArea: areaId }));
  }, []);

  const unlockArea = useCallback(() => {
    writeAreaLock(null);
    setLockedArea(null);
  }, []);

  // A refresh after the first load never puts the floor back into its
  // loading state: the grid and the open bill stay on screen and are swapped
  // for the new data when it lands. Blanking them on every realtime event and
  // every action is what made the till flicker and feel slow in a rush.
  const fetchWorkspaceData = useCallback(async () => {
    setState((prev) => (prev.tables.length > 0 || prev.loadingWorkspace
      ? { ...prev, workspaceError: null }
      : { ...prev, loadingWorkspace: true, workspaceError: null }));
    try {
      if (isOnline) {
        const sectionsPromise = supabase.from('restaurant_sections').select('*').order('section_name');
        // Only the sessions the floor can show: open and held ones, and bills
        // settled in the last day for Running Orders' reprint list. Without
        // the filter every table carried its whole history, and the list grew
        // with every meal ever served.
        const recentCutoff = new Date(Date.now() - RECENT_COMPLETED_MS).toISOString();
        const tablesPromise = supabase
          .from('restaurant_tables')
          .select('*, customer_sessions(id, customer_name, guest_count, started_at, session_status, ended_at, metadata)')
          .or(
            `session_status.in.(${FLOOR_SESSION_STATUSES.join(',')}),ended_at.gte."${recentCutoff}"`,
            { referencedTable: 'customer_sessions' },
          )
          .order('table_number');

        const [sectionsData, tablesResult] = await Promise.all([
          cacheFromSupabase('sections', sectionsPromise),
          cacheFromSupabase('tables', tablesPromise),
        ]);

        const tablesData = tablesResult || [];
        const finalSections = sectionsData || [];

        setState((prev) => ({
          ...prev,
          sections: finalSections,
          tables: processTablesWithSessions(tablesData),
          loadingWorkspace: false,
        }));

        // The menu is saved here for offline ordering, not shown here, so the
        // floor does not wait for it — and a realtime refresh, which only
        // means a table or an order changed, does not download it again.
        if (Date.now() - lastMenuCacheAt > MENU_CACHE_EVERY_MS) {
          lastMenuCacheAt = Date.now();
          Promise.all([
            cacheFromSupabase('menu_categories', supabase.from('menu_categories').select('*').order('category_name')),
            cacheFromSupabase('menu_items', supabase.from('menu_items').select('*').eq('is_available', true)),
          ]).catch(() => { lastMenuCacheAt = 0; });
        }
      } else {
        const cachedTables = await loadLocalTables();
        const cachedSections = (await db.getAll('sections')) || [];
        setState((prev) => ({
          ...prev,
          sections: cachedSections,
          tables: processTablesWithSessions(cachedTables),
          loadingWorkspace: false,
        }));
      }
    } catch (err) {
      if (isNetworkError(err)) reportNetworkFailure();
      const cachedTables = await loadLocalTables();
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

  const fetchSessionData = useCallback(async ({ silent = false } = {}) => {
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
      setSessionState({ session: null, items: [], isPaid: false, loadingSession: false, sessionError: null });
      return;
    }

    if (!silent) setSessionState((prev) => ({ ...prev, loadingSession: true, sessionError: null }));
    try {
      let sessionData;

      // A temp id that has synced since the URL was set: use the real one.
      const liveId = await resolveId(sessionId);
      let fetchedOnline = false;

      if (isOnline && !liveId.startsWith('temp_')) {
        const { data, error } = await supabase
          .from('customer_sessions')
          .select(
            `*, restaurant_tables(table_number, kind), orders(id, total, subtotal, tax, order_items(id, menu_item_id, quantity, item_price, notes, is_cancelled, cancel_reason, menu_items(item_name)))`
          )
          .eq('id', liveId)
          .single();

        if (error && !isNetworkError(error)) throw error;
        if (error) reportNetworkFailure();
        sessionData = error ? null : data;
        fetchedOnline = !error;

        if (sessionData) {
          // The offline copy is written alongside, not before, the bill
          // appearing — the cashier should not wait on the device's disk.
          const orderItems = (sessionData.orders || []).flatMap((o) =>
            (o.order_items || []).map((oi) => ({ ...oi, orderId: o.id }))
          );
          Promise.all([
            db.put('sessions', sessionData),
            db.putMany('orders', sessionData.orders || []),
            orderItems.length > 0 ? db.putMany('order_items', orderItems) : null,
          ]).catch(() => { /* the bill is on screen; the offline copy is best effort */ });
        }
      }
      if (!fetchedOnline) {
        sessionData = await loadLocalSession(liveId);
      }

      const items = flattenOrderItems(sessionData);
      const assignments = buildItemAssignments(items);

      setSessionState({
        session: sessionData,
        items,
        voidItems: flattenVoidItems(sessionData),
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
        // The id is made here so a retry after a lost reply is recognised,
        // not written as a second session on the same table.
        const newSessionId = newUuid();
        const meta = modalState.newSessionMetadata;
        const sessionData = {
          table_id: table.id,
          customer_name: modalState.customerData.name || 'Walk-in Guest',
          phone_number: modalState.customerData.phone,
          guest_count: modalState.customerData.guests,
          session_status: SESSION_STATUS.active,
          started_at: new Date().toISOString(),
          ...(meta ? { metadata: meta } : {}),
        };

        // A takeaway files under a packing counter without taking it.
        const occupies = !isPackingCounter(table);

        const openLocally = async () => {
          await db.put('sessions', { id: newSessionId, ...sessionData });
          await db.enqueueSync({
            action: 'insert', table: 'customer_sessions', clientId: newSessionId, data: sessionData,
          });
          if (occupies) {
            await db.put('tables', { ...table, status: TABLE_STATUS.occupied });
            await db.enqueueSync({
              action: 'update', table: 'restaurant_tables',
              data: { id: table.id, status: TABLE_STATUS.occupied },
            });
          }
        };

        let openedOnline = false;
        if (isOnline && !(await hasPendingSync())) {
          try {
            const { error: sessionError } = await supabase
              .from('customer_sessions')
              .insert([{ id: newSessionId, ...sessionData }]);
            if (sessionError) throw sessionError;

            if (occupies) {
              const { error: tableError } = await supabase
                .from('restaurant_tables')
                .update({ status: TABLE_STATUS.occupied })
                .eq('id', table.id);
              if (tableError) throw tableError;
            }
            openedOnline = true;
          } catch (err) {
            if (!isNetworkError(err)) throw err;
            reportNetworkFailure();
          }
        }
        if (!openedOnline) await openLocally();

        closeModals();
        await fetchWorkspaceData();
        // Straight to the menu either way: it works offline from the saved menu.
        navigate(`/menu?sessionId=${newSessionId}&tableId=${table.id}`);
      } catch (err) {
        alert('Error starting session: ' + err.message);
      } finally {
        setLoadingAction(false);
      }
    },
    [modalState.selectedTableForNewOrder, modalState.customerData, modalState.newSessionMetadata, closeModals, fetchWorkspaceData, navigate, isOnline, setLoadingAction]
  );

  /**
   * A takeaway: no table to choose. It is filed under a packing counter,
   * which stays free for the next one, and gets today's next token number,
   * which is what the customer is called by.
   */
  const handleOpenTakeaway = useCallback(async (counter = null) => {
    const target = counter || pickTakeawayCounter(state.tables);
    if (!target) {
      alert('Takeaway needs a packing counter. Add a Packing area with a counter in QR Codes first.');
      return;
    }
    setLoadingAction(true);
    try {
      const token = await nextTakeawayToken({ online: isOnline });
      setModalState((prev) => ({
        ...prev,
        selectedTableForNewOrder: target,
        customerData: { name: '', phone: '', guests: 1 },
        newSessionMetadata: { order_type: 'takeaway', token },
        showTakeawayModal: true,
      }));
    } catch (err) {
      alert('Could not start a takeaway: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  }, [state.tables, isOnline, setLoadingAction]);

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

  /**
   * Settling has to print the bill, and printing is defined below this. Held
   * in a ref rather than reordered: the print builder reads the same session
   * state the settle just used, and moving it above would only trade this
   * indirection for a longer one.
   */
  const printRef = useRef(null);

  const handleMarkAsPaid = useCallback(async () => {
    setLoadingAction(true);
    try {
      const curTotal = calcTotal(
        calcSubtotal(sessionState.items) - calcDiscountAmount(calcSubtotal(sessionState.items), uiState.discountType, uiState.discountValue),
        0,
        calcServiceCharge(calcSubtotal(sessionState.items) - calcDiscountAmount(calcSubtotal(sessionState.items), uiState.discountType, uiState.discountValue), uiState.showServiceCharge ? uiState.serviceChargePercent : 0),
        taxRate,
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
      // Was sent as 0 while the total still included tax, so every bill's
      // gst_amount read zero in the reports.
      const billTax = calcTax(billSubtotal - billDiscount, taxRate);

      /**
       * Settling has always closed the session and never written a bill, so
       * every table settled at the till was invisible to the payment-mode
       * report and its discount lived only in session metadata. record_bill is
       * idempotent on the session, so a partial payment followed by the rest
       * updates one row rather than making two.
       */
      const billParams = (paid) => ({
        p_session_id: sessionId,
        p_payment_method: uiState.paymentMethod || 'cash',
        p_subtotal: billSubtotal,
        p_discount_type: uiState.discountType === 'none' ? null : uiState.discountType,
        p_discount_amount: billDiscount,
        p_service_charge: billService,
        p_tax: billTax,
        p_total: curTotal,
        p_paid: paid,
      });

      // Why the server refused the bill, when it did — said out loud below.
      let billProblem = null;

      const writeBill = async (paid) => {
        const { error: billError } = await supabase.rpc('record_bill', billParams(paid));
        // Lost connection: let the caller save the whole settle locally.
        if (billError && isNetworkError(billError)) throw billError;
        // A bill the server rejects must not strand a paid table on the floor;
        // the settle itself is what the staff are waiting on. But it is never
        // silent: a console-only error once lost every bill's payment mode
        // for days before anyone noticed.
        if (billError) {
          console.error('Could not record the bill:', billError);
          billProblem = billError.message || 'unknown error';
        }
      };

      // Supabase reports failures in the result rather than throwing; without
      // this a dropped connection mid-settle looked like a clean settle.
      const must = async (query) => {
        const { error } = await query;
        if (error) throw error;
      };

      /**
       * The same settle, saved on this device and queued for the server,
       * bill included. It used to queue only "session completed", so every
       * table settled offline was missing from sales, payment-mode and GST
       * reports for good.
       */
      const settleLocally = async () => {
        const session = sessionState.session || (await db.getById('sessions', sessionId));
        if (!session) throw new Error('This table is not saved on this device, so it cannot be settled offline.');
        const settledAt = new Date().toISOString();
        const status = isFullyPaid ? SESSION_STATUS.completed : SESSION_STATUS.billing;

        await db.put('sessions', {
          ...session,
          session_status: status,
          ended_at: isFullyPaid ? settledAt : session.ended_at,
          metadata: {
            ...(session.metadata || {}),
            discountType: uiState.discountType,
            discountValue: uiState.discountValue,
            showServiceCharge: uiState.showServiceCharge,
            serviceChargePercent: uiState.serviceChargePercent,
            amountPaid: uiState.amountPaid,
            splitPayments: uiState.splitPayments,
            paymentMethod: uiState.paymentMethod,
            subtotal: billSubtotal,
            discountAmount: billDiscount,
            serviceCharge: billService,
            tax: billTax,
            total: curTotal,
            settledOffline: true,
          },
        });

        // The bill first, as online. p_paid_at keeps it on the day it was
        // paid, not the day the line came back.
        await db.enqueueSync({
          action: 'rpc', fn: 'record_bill',
          params: { ...billParams(isFullyPaid), ...(isFullyPaid ? { p_paid_at: settledAt } : {}) },
        });
        await db.enqueueSync({
          action: 'update', table: 'customer_sessions',
          data: {
            id: sessionId,
            session_status: status,
            ...(isFullyPaid ? { ended_at: settledAt } : {}),
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
          const targetTable = tables.find((t) => t.id === session.table_id);
          if (targetTable && !isPackingCounter(targetTable)) {
            await db.put('tables', { ...targetTable, status: TABLE_STATUS.cleaning });
            await db.enqueueSync({
              action: 'update', table: 'restaurant_tables',
              data: { id: targetTable.id, status: TABLE_STATUS.cleaning },
            });
            scheduleTableCleanup(targetTable.id, TABLE_CLEANUP_DELAY_MS);
          }
        }

        setSessionState((prev) => ({ ...prev, isPaid: isFullyPaid }));
        if (isFullyPaid) printRef.current?.('bill');
        const when = isOnline ? 'in a moment' : 'when the connection is back';
        alert(isFullyPaid
          ? `Payment saved on this device. It will be sent to the server automatically ${when}.`
          : `Partial payment saved on this device. It will be sent to the server automatically ${when}.`);
        setUiState((prev) => ({ ...prev, splitPayments: [], amountPaid: 0 }));
        setSearchParams({ tab: state.activeTab });
        await fetchWorkspaceData();
      };

      if (!isOnline || String(sessionId).startsWith('temp_') || (await hasPendingSync())) {
        // Offline, a table opened offline that hasn't reached the server yet,
        // or older changes still queued: the queue keeps them in order.
        await settleLocally();
        return;
      }

      try {
        if (isFullyPaid) {
          await writeBill(true);
          await must(supabase
            .from('customer_sessions')
            .update({ session_status: SESSION_STATUS.completed, ended_at: new Date().toISOString() })
            .eq('id', sessionId));
          // Close the orders as well. Settling used to end the session and
          // leave its orders at 'preparing' for ever, so the dashboard went on
          // counting them as live and reported the table as open and unbilled
          // long after it had been paid and cleared.
          //
          // The orders and the table do not depend on each other, so they go
          // together — one wait at the till instead of two.
          const clearsTable = !isPackingCounter(sessionState.session?.restaurant_tables);
          await Promise.all([
            must(supabase
              .from('orders')
              .update({ order_status: ORDER_STATUS.completed })
              .eq('session_id', sessionId)
              .neq('order_status', ORDER_STATUS.cancelled)),
            // A packing counter has nothing to clear: other takeaways are open on it.
            clearsTable && must(supabase
              .from('restaurant_tables')
              .update({ status: TABLE_STATUS.cleaning })
              .eq('id', sessionState.session?.table_id)),
          ]);
          if (clearsTable) {
            scheduleTableCleanup(sessionState.session?.table_id, TABLE_CLEANUP_DELAY_MS);
          }
        } else {
          await writeBill(false);
          await must(supabase
            .from('customer_sessions')
            .update({ session_status: SESSION_STATUS.billing })
            .eq('id', sessionId));
        }
      } catch (err) {
        // The line dropped part-way. Every step is safe to repeat (record_bill
        // is idempotent on the session, the rest are plain status writes), so
        // replaying the whole settle from the queue is correct.
        if (!isNetworkError(err)) throw err;
        reportNetworkFailure();
        await settleLocally();
        return;
      }

      setSessionState((prev) => ({ ...prev, isPaid: isFullyPaid }));
      // The customer's copy, printed off the same figures that were just
      // recorded. A part payment prints nothing: the bill is not final yet.
      if (isFullyPaid) printRef.current?.('bill');
      alert((isFullyPaid ? 'Payment marked as successful!' : `Partial payment of ${FORMAT_CURRENCY.format(uiState.amountPaid || curTotal)} recorded.`)
        + (billProblem
          ? `\n\nWarning: the table is settled, but its payment record was not saved (${billProblem}). `
            + 'Set the payment mode for this bill from Orders, and tell support.'
          : ''));
      setSearchParams({ tab: state.activeTab });
      await fetchWorkspaceData();
    } catch (err) {
      alert('Payment processing error: ' + err.message);
    } finally {
      setLoadingAction(false);
    }
  }, [sessionId, sessionState.session, state.activeTab, isOnline, uiState.splitPayments, uiState.amountPaid, uiState.discountType, uiState.discountValue, uiState.showServiceCharge, uiState.serviceChargePercent, uiState.paymentMethod, sessionState.items, setSearchParams, fetchWorkspaceData, setLoadingAction, taxRate, scheduleTableCleanup]);

  const handleAddManualItem = useCallback(
    async (name, qty, unitPrice) => {
      if (!sessionId || !name || qty < 1 || unitPrice < 0) return;
      setLoadingAction(true);
      try {
        const subtotal = unitPrice * qty;
        const tax = calcTax(subtotal, taxRate);
        const total = subtotal + tax;
        const orderId = newUuid();
        const lineId = newUuid();
        const orderData = {
          session_id: sessionId, order_status: 'preparing', subtotal, tax, total,
          created_at: new Date().toISOString(),
        };
        // No dish behind a manual line, so its name goes in notes; it used to
        // be dropped and the bill read "Unknown Item".
        const lineData = {
          order_id: orderId, menu_item_id: null, quantity: qty,
          item_price: unitPrice, total_price: unitPrice * qty, notes: name,
        };

        const addLocally = async () => {
          await db.put('orders', { id: orderId, ...orderData });
          await db.enqueueSync({ action: 'insert', table: 'orders', clientId: orderId, data: orderData });
          await db.put('order_items', { id: lineId, ...lineData });
          await db.enqueueSync({ action: 'insert', table: 'order_items', clientId: lineId, data: lineData });
        };

        let addedOnline = false;
        if (isOnline && !String(sessionId).startsWith('temp_') && !(await hasPendingSync())) {
          try {
            const { error: orderError } = await supabase.from('orders').insert([{ id: orderId, ...orderData }]);
            if (orderError) throw orderError;
            const { error: itemError } = await supabase.from('order_items').insert([{ id: lineId, ...lineData }]);
            if (itemError) throw itemError;
            addedOnline = true;
          } catch (err) {
            if (!isNetworkError(err)) throw err;
            reportNetworkFailure();
          }
        }
        if (!addedOnline) await addLocally();
        await fetchSessionData();
      } catch (err) {
        alert('Error adding item: ' + err.message);
      } finally {
        setLoadingAction(false);
      }
    },
    [sessionId, isOnline, fetchSessionData, setLoadingAction, taxRate]
  );

  const handleUpdateItemQty = useCallback(
    async (itemId, orderId, newQty, opts = {}) => {
      const items = opts.items || sessionState.items;
      setLoadingAction(true);
      try {
        if (isOnline) {
          // A line the kitchen has already had a KOT for was cooked. Removing
          // it voids it instead of deleting it: stock stays used, nothing is
          // billed, and it shows as Void KOT. A line never sent is simply a
          // mistake and is deleted, which returns its stock.
          const sentToKitchen = newQty <= 0 && readKotSent(sessionId).has(String(itemId));
          if (sentToKitchen) {
            const reason = opts.voidReason ?? window.prompt('This item has gone to the kitchen. Reason for Void KOT:');
            if (reason === null) return;           // backed out — change nothing
            if (!reason.trim()) throw new Error('A reason is needed to void a KOT item.');
            const { error } = await supabase
              .from('order_items')
              .update({ is_cancelled: true, cancel_reason: reason.trim(), cancelled_at: new Date().toISOString() })
              .eq('id', itemId);
            if (error) throw error;
          } else if (newQty <= 0) {
            const { error } = await supabase.from('order_items').delete().eq('id', itemId);
            if (error) throw error;
          } else {
            const item = items.find((i) => i.id === itemId);
            if (!item) throw new Error('Item not found');
            const totalPrice = item.price * newQty;
            const { error } = await supabase.from('order_items').update({ quantity: newQty, total_price: totalPrice }).eq('id', itemId);
            if (error) throw error;
          }
          // The order's lines as they are AFTER this change. Passing the list
          // from before it meant deleting an order's last line left the order
          // behind with no items and its old total: the table could not be
          // settled, and the dashboard counted the stale total as a sale.
          const remaining = items
            .filter((i) => i.orderId === orderId && !(newQty <= 0 && i.id === itemId))
            .map((i) => (i.id === itemId ? { ...i, qty: newQty } : i));
          const hasVoidLines = sentToKitchen
            || (sessionState.voidItems || []).some((i) => i.orderId === orderId);
          const { error: totalError } = await updateOrderTotalOnline(orderId, remaining, taxRate, { hasVoidLines });
          if (totalError) throw totalError;
          await fetchSessionData();
        } else {
          if (newQty <= 0) {
            await db.remove('order_items', itemId);
            await db.enqueueSync({ action: 'delete', table: 'order_items', data: { id: itemId } });
          } else {
            const item = items.find((i) => i.id === itemId);
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
    [sessionId, sessionState.items, sessionState.voidItems, fetchSessionData, isOnline, setLoadingAction, taxRate]
  );

  /**
   * A quantity change on a merged bill line (the same dish ordered in more
   * than one round). Applied to the real rows newest-first; a Void KOT reason
   * is asked once for the whole line rather than once per round.
   */
  const handleUpdateLineQty = useCallback(async (line, newQty) => {
    const changes = planLineQtyChange(line, newQty);
    if (changes.length === 0) return;

    const sent = readKotSent(sessionId);
    let voidReason;
    if (isOnline && changes.some((c) => c.qty <= 0 && sent.has(String(c.id)))) {
      voidReason = window.prompt('This item has gone to the kitchen. Reason for Void KOT:');
      if (voidReason === null) return;
      if (!voidReason.trim()) {
        alert('A reason is needed to void a KOT item.');
        return;
      }
      voidReason = voidReason.trim();
    }

    let working = sessionState.items;
    for (const c of changes) {
      await handleUpdateItemQty(c.id, c.orderId, c.qty, { items: working, voidReason });
      working = c.qty <= 0
        ? working.filter((i) => i.id !== c.id)
        : working.map((i) => (i.id === c.id ? { ...i, qty: c.qty } : i));
    }
  }, [sessionId, isOnline, sessionState.items, handleUpdateItemQty]);

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
          .neq('kind', 'packing')
          .order('table_number');
        if (!error) availableData = data;
      } else {
        const allTables = await db.getAll('tables');
        availableData = allTables.filter((t) => t.status === TABLE_STATUS.available && !isPackingCounter(t));
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

  /**
   * Print a ticket.
   *
   * 'kot'      — the new round only, and marks those lines as sent.
   * 'kot-all'  — the whole table again, changing nothing (a lost docket).
   * anything else — the customer's bill.
   */
  const handlePrint = useCallback((type) => {
    const sess = sessionState.session;
    const allItems = sessionState.items;
    if (!sess) return;

    const isKot = type === 'kot' || type === 'kot-all';
    const sent = readKotSent(sess.id);
    const isNewRound = type === 'kot';

    const items = isNewRound
      ? allItems.filter((i) => !sent.has(String(i.id)))
      : allItems;

    if (isKot && items.length === 0) {
      alert(isNewRound
        ? 'Nothing new to send — every item on this table has already gone to the kitchen.'
        : 'There is nothing on this table to print.');
      return;
    }

    if (isNewRound) {
      allItems.forEach((i) => sent.add(String(i.id)));
      writeKotSent(sess.id, sent);
    }

    const roundNo = isNewRound
      ? new Set(allItems.filter((i) => sent.has(String(i.id))).map((i) => i.orderId)).size
      : null;

    const tableNumber = sess.restaurant_tables?.table_number || '—';
    const token = tokenOf(sess);
    const billId = (sess.id || '').slice(0, 4).toUpperCase();
    const subtotal = calcSubtotal(items);
    const discountAmount = calcDiscountAmount(subtotal, uiState.discountType, uiState.discountValue);
    const afterDiscount = subtotal - discountAmount;
    const serviceCharge = calcServiceCharge(afterDiscount, uiState.showServiceCharge ? uiState.serviceChargePercent : 0);
    // The same arithmetic as the screen and the recorded bill: GST on the
    // discounted subtotal, service charge on top untaxed. The print used to
    // tax the service charge too, so the paper total disagreed with both.
    const cgst = calcCgst(afterDiscount, taxRate);
    const sgst = calcSgst(afterDiscount, taxRate);
    const halfPct = formatRatePct(taxRate / 2);
    const total = calcTotal(afterDiscount, 0, serviceCharge, taxRate);

    const formatCurrency = (v) => FORMAT_CURRENCY ? FORMAT_CURRENCY.format(v || 0) : '₹' + (v || 0).toFixed(2);

    // A kitchen ticket carries what to cook, never money.
    if (isKot) {
      printTicket(kotTicketHtml({
        tableNumber,
        token,
        billId,
        guests: sess.guest_count,
        items,
        subtitle: isNewRound ? `Kitchen Order Ticket · Round ${roundNo}` : 'REPRINT — full table',
      }));
      return;
    }

    (async () => {
      const shop = await loadReceiptProfile();

      const itemRows = groupBillLines(items).map((item) => `<tr>
          <td class="item">${esc(item.name)}</td>
          <td class="qty">${esc(item.qty)}</td>
          <td class="amt">${formatCurrency(item.price)}</td>
          <td class="amt">${formatCurrency(item.price * item.qty)}</td>
        </tr>`).join('');

      const headerLines = [
        shop.address && `<div class="sub">${esc(shop.address).replace(/\n/g, '<br/>')}</div>`,
        shop.phone && `<div class="sub">Ph: ${esc(shop.phone)}</div>`,
        shop.gstin && `<div class="sub">GSTIN: ${esc(shop.gstin)}</div>`,
      ].filter(Boolean).join('');

      const taxRows = shop.showGst
        ? `<tr><td>CGST (${halfPct}%)</td><td class="amt">${formatCurrency(cgst)}</td></tr>
          <tr><td>SGST (${halfPct}%)</td><td class="amt">${formatCurrency(sgst)}</td></tr>`
        : `<tr><td>GST (${formatRatePct(taxRate)}%)</td><td class="amt">${formatCurrency(cgst + sgst)}</td></tr>`;

      printHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Bill ${esc(billId)}</title>
      <style>
        ${TICKET_CSS}
        h1 { text-align: center; font-size: 17px; margin: 0 0 2px 0; text-transform: uppercase; }
        .sub { text-align: center; font-size: 11px; }
        .title { text-align: center; font-weight: bold; font-size: 13px; margin: 4px 0; }
        .meta { font-size: 11.5px; }
        .meta b { font-weight: bold; }
        .items th { font-size: 10.5px; text-transform: uppercase; border-bottom: 1px solid #000; padding: 2px 0; text-align: right; }
        .items th:first-child { text-align: left; }
        .items td { padding: 2px 0; font-size: 11.5px; }
        .item { word-break: break-word; padding-right: 2px; }
        .qty { text-align: center; width: 8mm; }
        .amt { text-align: right; white-space: nowrap; }
        .sums td { padding: 1px 0; font-size: 12px; }
        .grand td { font-size: 15px; font-weight: bold; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; }
        .token { text-align: center; font-size: 15px; font-weight: bold; border: 1px solid #000; padding: 3px 0; margin-bottom: 5px; }
        .footer { text-align: center; font-size: 11.5px; margin-top: 8px; }
      </style></head><body>
      ${shop.name ? `<h1>${esc(shop.name)}</h1>` : ''}
      ${headerLines}
      <hr/>
      <div class="title">${shop.gstin ? 'TAX INVOICE' : 'BILL'}</div>
      ${token != null
        ? `<div class="token">TAKEAWAY · TOKEN ${esc(token)}</div>
      <div class="meta"><b>Bill #:</b> ${esc(billId)} &nbsp; <b>Counter:</b> ${esc(tableNumber)}</div>
      <div class="meta"><b>Customer:</b> ${esc(sess.customer_name || 'Walk-in')}${sess.phone_number ? ` &nbsp; <b>Ph:</b> ${esc(sess.phone_number)}` : ''}</div>`
        : `<div class="meta"><b>Bill #:</b> ${esc(billId)} &nbsp; <b>Table:</b> T-${esc(tableNumber)}</div>
      <div class="meta"><b>Customer:</b> ${esc(sess.customer_name || 'Walk-in')} &nbsp; <b>Guests:</b> ${esc(sess.guest_count || '—')}</div>`}
      <div class="meta"><b>Date:</b> ${fmtDateTime(new Date())}</div>
      <hr/>
      <table class="items">
        <tr><th>Item</th><th class="qty">Qty</th><th>Rate</th><th>Amount</th></tr>
        ${itemRows}
      </table>
      <hr/>
      <table class="sums">
        <tr><td>Subtotal</td><td class="amt">${formatCurrency(subtotal)}</td></tr>
        ${discountAmount > 0 ? `<tr><td>Discount${uiState.discountType === 'percentage' ? ` (${esc(uiState.discountValue)}%)` : ''}</td><td class="amt">-${formatCurrency(discountAmount)}</td></tr>` : ''}
        ${uiState.showServiceCharge && serviceCharge > 0 ? `<tr><td>Service charge (${esc(uiState.serviceChargePercent)}%)</td><td class="amt">${formatCurrency(serviceCharge)}</td></tr>` : ''}
        ${taxRows}
        <tr class="grand"><td>GRAND TOTAL</td><td class="amt">${formatCurrency(total)}</td></tr>
      </table>
      <div class="footer">${esc(shop.footer)}</div>
      </body></html>`);
    })();
  }, [sessionState.session, sessionState.items, uiState.discountType, uiState.discountValue, uiState.showServiceCharge, uiState.serviceChargePercent, taxRate]);

  printRef.current = handlePrint;

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
    if (!lockedArea || state.loadingWorkspace || state.sections.length === 0) return;
    if (!state.sections.some((sec) => sec.id === lockedArea)) {
      writeAreaLock(null);
      setLockedArea(null);
      setState((prev) => ({ ...prev, activeArea: 'all' }));
    }
  }, [lockedArea, state.sections, state.loadingWorkspace]);

  useEffect(() => {
    fetchWorkspaceData();
  }, [fetchWorkspaceData]);

  /**
   * Orders placed from the diner's phone (QR menu) land on the session like
   * any other order, but nothing told this screen. A new session, order or
   * line now refreshes the floor and the open bill, so the cashier sees the
   * diner's items arrive and only has to print and settle.
   *
   * RLS scopes what realtime delivers to this restaurant. One settle writes
   * the session, its orders, the bill and the table within a moment of each
   * other, so a burst is folded into a single refresh; a table changing on its
   * own (freed, cleaned) touches only the floor, not the open bill.
   */
  const refreshRef = useRef({ fetchWorkspaceData, fetchSessionData });
  refreshRef.current = { fetchWorkspaceData, fetchSessionData };

  useEffect(() => {
    if (!isOnline) return undefined;
    let timer = null;
    let withSession = false;
    const schedule = (sessionToo) => {
      withSession = withSession || sessionToo;
      clearTimeout(timer);
      timer = setTimeout(() => {
        refreshRef.current.fetchWorkspaceData();
        if (withSession) refreshRef.current.fetchSessionData({ silent: true });
        withSession = false;
      }, 300);
    };
    const onFloor = () => schedule(false);
    const onOrder = () => schedule(true);
    const channel = supabase
      .channel('billing-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, onFloor)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_sessions' }, onOrder)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onOrder)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, onOrder)
      .subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [isOnline]);

  useEffect(() => {
    fetchSessionData();
  }, [sessionId, fetchSessionData]);

  // The restaurant's name and address for the bill, read before anyone
  // presses Print so the first bill of the shift does not wait for it.
  useEffect(() => {
    loadReceiptProfile();
  }, []);

  // After queued offline changes reach the server. Not on mount — the effect
  // above has already loaded the floor, and loading it twice doubled the wait.
  useEffect(() => {
    if (isOnline && lastSyncResult) fetchWorkspaceData();
  }, [lastSyncResult]);

  useEffect(() => {
    if (!isOnline) return;
    if (!sessionId || !sessionId.startsWith('temp_')) return;
    // The local record is renamed once synced, so looking it up by the temp
    // id found nothing; the id map knows where it went.
    const resolveTempId = async () => {
      const realId = await resolveId(sessionId);
      if (realId !== sessionId) {
        setSearchParams({ tab: state.activeTab, sessionId: realId });
      }
    };
    resolveTempId();
  }, [isOnline, lastSyncResult]);

  const subtotal = calcSubtotal(sessionState.items);
  const discountAmount = calcDiscountAmount(subtotal, uiState.discountType, uiState.discountValue);
  const taxableAmount = subtotal - discountAmount;
  const serviceCharge = calcServiceCharge(taxableAmount, uiState.showServiceCharge ? uiState.serviceChargePercent : 0);
  const tax = calcTax(taxableAmount, taxRate);
  const cgst = calcCgst(taxableAmount, taxRate);
  const sgst = calcSgst(taxableAmount, taxRate);
  const total = calcTotal(taxableAmount, 0, serviceCharge, taxRate);
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
    taxRate,
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
    pendingCount,
    failedCount,
    retryFailed,
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
    setActiveArea,
    lockedArea,
    lockArea,
    unlockArea,
    fetchWorkspaceData,
    fetchSessionData,
    handleStartSession,
    handleOpenTakeaway,
    handleMarkAsPaid,
    handleAddManualItem,
    handleUpdateItemQty,
    handleUpdateLineQty,
    billLines: groupBillLines(sessionState.items),
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
