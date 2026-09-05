import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

/**
 * A select you can type into.
 *
 * A native <select> only jumps to the first letter, and the next keystroke
 * jumps again rather than narrowing. With two hundred raw materials that is
 * unusable: typing "chi" for Chicken Tikka lands on C, then H, then I, and the
 * operator ends up somewhere in the H's wondering what happened.
 *
 * This filters on every character, anywhere in the label — "tikka" finds
 * "Chicken Tikka Semi" — and keeps the keyboard behaviour people expect from a
 * select: arrows move, Enter picks, Escape closes, and typing into a closed
 * control opens it and starts filtering.
 *
 * The menu is rendered through a portal onto the body rather than inside the
 * control. Every modal in this app is `overflow-y: auto` and table rows are a
 * fixed 48px, so a menu positioned inside its own parent gets clipped exactly
 * where it is most needed. Fixed coordinates off the trigger's own rect avoid
 * that everywhere at once.
 *
 * Below `searchAfter` options the search box is hidden, because a search box
 * over four choices is furniture. Nothing else changes, so a list that grows
 * past the threshold simply gains one.
 *
 * Styling lives in styles/components.css alongside .modal and .table-row.
 */

export default function SearchSelect({
  options = [],            // [{ value, label, sub? }] — or plain strings
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  ariaLabel,
  searchAfter = 8,
  allowEmpty = false,      // offer a row that clears the value
  emptyLabel = 'None',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [box, setBox] = useState(null);   // { left, width, top | bottom }

  const rootRef = useRef(null);
  const menuRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const items = useMemo(() => options.map((o) => (
    typeof o === 'string' ? { value: o, label: o } : o
  )), [options]);

  const withSearch = items.length >= searchAfter;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    // Substring, not prefix: people search by the distinguishing word, which
    // is rarely the first one — "roti" for "Rumali Roti".
    return items.filter((o) => `${o.label} ${o.sub || ''}`.toLowerCase().includes(q));
  }, [items, query]);

  const selected = items.find((o) => String(o.value) === String(value));

  /** Pin the menu to the trigger, opening upwards when the room is above. */
  const place = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const width = Math.max(r.width, 220);
    setBox(below < 260 && r.top > below
      ? { left: r.left, width, bottom: window.innerHeight - r.top + 4 }
      : { left: r.left, width, top: r.bottom + 4 });
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    place();
    // Follow the trigger if anything under it scrolls — capture catches
    // scrolling on the modal body, not just the window.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  /**
   * Focus the search box the moment the menu exists.
   *
   * `box` is the reason this waits. The menu only renders once place() has
   * measured the trigger, which happens in a layout effect AFTER the first
   * render with open=true — so on that first pass inputRef is still null and
   * focusing does nothing. Keying on `box` runs it again once the menu is
   * actually mounted, which is the difference between the caret landing in the
   * search box and the operator having to click it.
   */
  useEffect(() => {
    if (open && box && withSearch) inputRef.current?.focus();
  }, [open, box, withSearch]);

  /* Close on an outside click — the menu is not a DOM child, so it needs its
     own check as well as the control's. */
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  /* Keep the highlighted row in view while arrowing through a long list. */
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector('[data-active="true"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const openWith = (initial = '') => {
    setQuery(initial);
    setActive(0);
    setOpen(true);
  };

  const pick = (option) => {
    onChange(option ? option.value : '');
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (disabled) return;

    if (!open) {
      // Typing into a closed control opens it and starts filtering, the way a
      // native select starts jumping.
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openWith('');
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        openWith(e.key);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => Math.min(i + 1, shown.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(shown.length - 1); break;
      case 'Enter':
        e.preventDefault();
        if (shown[active]) pick(shown[active]);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setQuery('');
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        break;
    }
  };

  const menu = open && box ? createPortal(
    <div
      ref={menuRef}
      className="ss-menu"
      role="listbox"
      style={{
        left: box.left,
        width: box.width,
        ...(box.top !== undefined ? { top: box.top } : { bottom: box.bottom }),
      }}
    >
      {withSearch && (
        <div className="ss-search">
          <Search size={13} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onKeyDown}
            placeholder="Type to search"
          />
        </div>
      )}

      <div className="ss-list" ref={listRef}>
        {allowEmpty && !query.trim() && (
          <button type="button" className="ss-opt ss-opt--empty" onClick={() => pick(null)}>
            {emptyLabel}
          </button>
        )}

        {shown.length === 0 && (
          <div className="ss-none">Nothing matches “{query}”</div>
        )}

        {shown.map((o, i) => {
          const isSel = String(o.value) === String(value);
          return (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={isSel}
              data-active={i === active}
              className={`ss-opt ${i === active ? 'active' : ''} ${isSel ? 'sel' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
            >
              <span className="ss-opt__text">
                <span className="ss-opt__label">{o.label}</span>
                {o.sub && <span className="ss-opt__sub">{o.sub}</span>}
              </span>
              {isSel && <Check size={13} />}
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <div className={`ss-root ${className}`} ref={rootRef}>
      <button
        type="button"
        className={`ss-control ${open ? 'on' : ''}`}
        onClick={() => (open ? setOpen(false) : openWith(''))}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`ss-value ${selected ? '' : 'ss-value--empty'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={14} className="ss-caret" />
      </button>
      {menu}
    </div>
  );
}
