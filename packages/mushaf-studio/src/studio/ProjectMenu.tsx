// The dock header's Project menu: export the composition's props and the list of its files as
// `public/mushaf-studio/<project>/project.json` (and as a download), or import such a file back.
import type * as React from 'react';
import {useRef, useState} from 'react';
import {MushafStudioError} from '../errors';
import {
  downloadText,
  missingProjectFiles,
  PROJECT_FILE_NAME,
  projectFileOf,
  projectFits,
  readFileText,
  validateProjectFile,
} from './project';
import {runStudioTask, setStudioState, t as tNow, useStudioState, useT} from './store';
import {type PropsPatch, patchProps, projectPath, staticFileList, writeJsonFile} from './studio-api';
import {colors, styles} from './styles';
import type {StudioCompositionProps} from './tab-props';

/** Exports the project; resolves with the path written. */
export const exportProject = async (
  compositionId: string,
  props: StudioCompositionProps,
  project: string | undefined,
): Promise<string> => {
  const file = projectFileOf(compositionId, props);
  const path = await writeJsonFile(projectPath(project, PROJECT_FILE_NAME), file);
  downloadText(PROJECT_FILE_NAME, `${JSON.stringify(file, null, 1)}\n`);
  return path;
};

/**
 * Imports a project file's text into the composition: validated, refused when its props are for
 * the other kind of composition or when `public/` lacks a file it needs (all of them named), else
 * its props saved with `patchProps()`.
 */
export const importProject = async (compositionId: string, props: StudioCompositionProps, text: string) => {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  const project = validateProjectFile(json);
  if (!projectFits(project, props))
    throw new MushafStudioError('BAD_PROJECT_FILE', tNow('project.otherKind', {composition: project.compositionId}), {
      compositionId: project.compositionId,
    });
  const missing = missingProjectFiles(project, staticFileList());
  if (missing.length > 0)
    throw new MushafStudioError(
      'BAD_PROJECT_FILE',
      tNow('project.missing', {count: missing.length, files: missing.map((f) => `public/${f}`).join(', ')}),
      {missing},
    );
  await patchProps(compositionId, project.props as PropsPatch);
  return project;
};

export const ProjectMenu: React.FC<{
  readonly compositionId: string;
  readonly props: StudioCompositionProps;
  readonly project: string | undefined;
}> = ({compositionId, props, project}) => {
  const t = useT();
  const {busy} = useStudioState();
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const onExport = () => {
    setOpen(false);
    void runStudioTask(tNow('project.busy.export'), async () => {
      const path = await exportProject(compositionId, props, project);
      setStudioState({notice: tNow('project.exported', {path})});
    });
  };

  const onImport = (file: File) => {
    setOpen(false);
    void runStudioTask(tNow('project.busy.import'), async () => {
      const imported = await importProject(compositionId, props, await readFileText(file));
      setStudioState({notice: tNow('project.imported', {name: file.name, count: imported.files.length})});
    });
  };

  return (
    <span style={{position: 'relative'}}>
      <button
        type="button"
        data-mushaf-control="project-menu"
        aria-haspopup="menu"
        aria-expanded={open}
        style={styles.button('ghost', false)}
        title={t('project.menu')}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open ? (
        <span
          role="menu"
          style={{
            position: 'absolute',
            insetInlineEnd: 0,
            top: '100%',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 160,
            background: colors.panel,
            border: `1px solid ${colors.border}`,
            borderRadius: 3,
            padding: 4,
          }}
        >
          <button
            type="button"
            role="menuitem"
            data-mushaf-control="export-project"
            style={{...styles.button('ghost', busy !== null), textAlign: 'start', padding: '4px 6px'}}
            disabled={busy !== null}
            onClick={onExport}
          >
            {t('project.export')}
          </button>
          <button
            type="button"
            role="menuitem"
            data-mushaf-control="import-project"
            style={{...styles.button('ghost', busy !== null), textAlign: 'start', padding: '4px 6px'}}
            disabled={busy !== null}
            onClick={() => input.current?.click()}
          >
            {t('project.import')}
          </button>
        </span>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        aria-label={t('project.import')}
        data-mushaf-control="import-project-file"
        style={{display: 'none'}}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImport(file);
          e.target.value = '';
        }}
      />
    </span>
  );
};
