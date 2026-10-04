// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {reserveDockSpace, STUDIO_CONTAINER_ID} from '../../../src/studio/dock-space';

afterEach(() => {
  document.body.innerHTML = '';
});

const studioRoot = () => {
  const root = document.createElement('div');
  root.id = STUDIO_CONTAINER_ID;
  root.style.marginLeft = '3px';
  document.body.appendChild(root);
  return root;
};

describe('reserveDockSpace', () => {
  it('narrows the Studio by the open dock on its side and restores it', () => {
    const root = studioRoot();
    const restore = reserveDockSpace(false, 'right');
    expect(root.style.width).toBe('calc(100% - 380px)');
    expect(root.style.marginRight).toBe('380px');
    restore();
    expect(root.style.width).toBe('');
    expect(root.style.marginRight).toBe('');
    expect(root.style.marginLeft).toBe('3px');
  });

  it('leaves only the strip when collapsed, on the left', () => {
    const root = studioRoot();
    const restore = reserveDockSpace(true, 'left');
    expect(root.style.width).toBe('calc(100% - 28px)');
    expect(root.style.marginLeft).toBe('28px');
    restore();
    expect(root.style.marginLeft).toBe('3px');
  });

  it('does nothing without the Studio root', () => {
    expect(() => reserveDockSpace(false, 'right')()).not.toThrow();
  });
});
