import type {StaticFile} from '@remotion/studio';
import {watchPublicFolder} from '@remotion/studio';
import {useEffect, useState} from 'react';
import {publicFiles} from './studio-api';

/** The files of `public/` with these extensions, kept current while the folder changes. Pass a module-level array. */
export const usePublicFiles = (extensions: readonly string[]): readonly StaticFile[] => {
  const [files, setFiles] = useState<readonly StaticFile[]>(() => publicFiles(extensions));
  useEffect(() => {
    setFiles(publicFiles(extensions));
    try {
      return watchPublicFolder(() => setFiles(publicFiles(extensions))).cancel;
    } catch {
      return undefined;
    }
  }, [extensions]);
  return files;
};
