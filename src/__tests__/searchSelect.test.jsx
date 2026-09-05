/**
 * SearchSelect — the dropdown that replaced every long native select.
 *
 * Worth testing because the thing it exists to fix is invisible in a snapshot:
 * a native select jumps to the first letter and jumps again on the next
 * keystroke, so "chi" against two hundred materials lands in the H's. What
 * matters here is that typing NARROWS, that it matches anywhere in the label
 * rather than only the start, and that the caret is already in the search box
 * when the menu opens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

import SearchSelect from '../components/SearchSelect';

const MATERIALS = [
  { value: 'a', label: 'Chicken Tikka Semi' },
  { value: 'b', label: 'Chicken Barra Rice' },
  { value: 'c', label: 'Rumali Roti' },
  { value: 'd', label: 'Fry Tikka' },
  { value: 'e', label: 'Korma Gravy' },
  { value: 'f', label: 'Malai Tikka' },
  { value: 'g', label: 'Butter Chicken Gravy' },
  { value: 'h', label: 'Desi Ghee' },
  { value: 'i', label: 'Paneer' },
  { value: 'j', label: 'Onion' },
];

const open = () => fireEvent.click(screen.getByRole('button', { name: /raw material/i }));

const setup = (props = {}) => {
  const onChange = vi.fn();
  render(
    <SearchSelect
      options={MATERIALS}
      value=""
      onChange={onChange}
      placeholder="Select raw material…"
      ariaLabel="Raw material"
      {...props}
    />,
  );
  return { onChange };
};

describe('SearchSelect', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('shows the placeholder until something is chosen', () => {
    setup();
    expect(screen.getByText('Select raw material…')).toBeInTheDocument();
  });

  it('puts the caret in the search box as soon as it opens', async () => {
    setup();
    open();
    // The menu is portalled and only mounts once the trigger has been
    // measured, so the focus lands a tick later than the click.
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByPlaceholderText('Type to search'));
    });
  });

  it('narrows on every character instead of jumping by first letter', async () => {
    setup();
    open();
    const search = await screen.findByPlaceholderText('Type to search');

    fireEvent.change(search, { target: { value: 'chi' } });

    expect(screen.getByText('Chicken Tikka Semi')).toBeInTheDocument();
    expect(screen.getByText('Chicken Barra Rice')).toBeInTheDocument();
    expect(screen.getByText('Butter Chicken Gravy')).toBeInTheDocument();
    expect(screen.queryByText('Rumali Roti')).not.toBeInTheDocument();
  });

  it('matches the middle of a name, not only the start', async () => {
    setup();
    open();
    const search = await screen.findByPlaceholderText('Type to search');

    // The distinguishing word is rarely the first one — this is the whole
    // reason a native select was unusable here.
    fireEvent.change(search, { target: { value: 'tikka' } });

    expect(screen.getByText('Chicken Tikka Semi')).toBeInTheDocument();
    expect(screen.getByText('Fry Tikka')).toBeInTheDocument();
    expect(screen.getByText('Malai Tikka')).toBeInTheDocument();
    expect(screen.queryByText('Onion')).not.toBeInTheDocument();
  });

  it('says so when nothing matches, rather than showing an empty box', async () => {
    setup();
    open();
    const search = await screen.findByPlaceholderText('Type to search');
    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText(/nothing matches/i)).toBeInTheDocument();
  });

  it('picks with the keyboard', async () => {
    const { onChange } = setup();
    open();
    const search = await screen.findByPlaceholderText('Type to search');

    fireEvent.change(search, { target: { value: 'rumali' } });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('picks with the mouse and closes', async () => {
    const { onChange } = setup();
    open();
    fireEvent.click(await screen.findByText('Desi Ghee'));

    expect(onChange).toHaveBeenCalledWith('h');
    expect(screen.queryByPlaceholderText('Type to search')).not.toBeInTheDocument();
  });

  it('closes on Escape without choosing anything', async () => {
    const { onChange } = setup();
    open();
    const search = await screen.findByPlaceholderText('Type to search');

    fireEvent.keyDown(search, { key: 'Escape' });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Type to search')).not.toBeInTheDocument();
  });

  it('hides the search box for a short list, where it would be furniture', async () => {
    setup({ options: MATERIALS.slice(0, 3) });
    open();

    await screen.findByText('Rumali Roti');
    expect(screen.queryByPlaceholderText('Type to search')).not.toBeInTheDocument();
  });

  it('offers a way back to nothing when the field is optional', async () => {
    const { onChange } = setup({ allowEmpty: true, emptyLabel: 'No vendor', value: 'c' });
    open();
    fireEvent.click(await screen.findByText('No vendor'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
