// Saving a file from the page: a Blob behind a temporary object URL and an `<a download>` click.

/** Saves `data` as `name`. The object URL is revoked once the browser has started the download. */
export const saveFile = (name: string, data: Blob | string, type = 'text/plain'): void => {
  const blob = typeof data === 'string' ? new Blob([data], {type: `${type};charset=utf-8`}) : data;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
