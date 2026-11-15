// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {dockSpaceHolders, reserveDockSpace, STUDIO_CONTAINER_ID} from '../../../src/studio/dock-space';

afterEach(() => {
  document.body.innerHTML = '';
});

const studioRoot = () => {
  const root = document.createElement('div');
  root.id = STUDIO_CONTAINER_ID;
  root.style.top = '3px';
  document.body.appendChild(root);
  return root;
};

describe('reserveDockSpace', () => {
  it('narrows the Studio by the open dock on its side and restores it', () => {
    const root = studioRoot();
    const restore = reserveDockSpace(false, 'right');
    expect(root.style.position).toBe('fixed');
    expect(root.style.right).toBe('380px');
    expect(root.style.left).toBe('0px');
    restore();
    expect(root.style.position).toBe('');
    expect(root.style.right).toBe('');
    expect(root.style.top).toBe('3px');
  });

  it('leaves only the strip when collapsed, on the left', () => {
    const root = studioRoot();
    const restore = reserveDockSpace(true, 'left');
    expect(root.style.left).toBe('28px');
    expect(root.style.right).toBe('0px');
    restore();
    expect(root.style.left).toBe('');
    expect(root.style.top).toBe('3px');
  });

  it('does nothing without the Studio root', () => {
    expect(() => reserveDockSpace(false, 'right')()).not.toThrow();
  });

  it('counts the reservations: the root is restored once, when the last one goes, in any order', () => {
    const root = studioRoot();
    const first = reserveDockSpace(false, 'right');
    const second = reserveDockSpace(true, 'right');
    expect(dockSpaceHolders()).toBe(2);
    // The newest lays the root out; the first going leaves it so.
    expect(root.style.right).toBe('28px');
    first();
    expect(root.style.position).toBe('fixed');
    expect(root.style.right).toBe('28px');
    // Released twice: counted once.
    first();
    expect(dockSpaceHolders()).toBe(1);
    second();
    expect(dockSpaceHolders()).toBe(0);
    expect(root.style.position).toBe('');
    expect(root.style.right).toBe('');
    expect(root.style.top).toBe('3px');
  });

  it("keeps the root's own styles from before the first reservation, not the dock's", () => {
    const root = studioRoot();
    const first = reserveDockSpace(false, 'left');
    const second = reserveDockSpace(false, 'right');
    second();
    first();
    expect(root.style.left).toBe('');
    expect(root.style.top).toBe('3px');
  });
});
