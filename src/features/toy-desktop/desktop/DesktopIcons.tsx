import { Emoji } from '../../../components/ui/Emoji.tsx';
import { t } from '../../../core/strings/defineStrings.ts';
import { nodeAtPath, TRASH_ID } from '../model/fileSystem.ts';
import { AppPicture } from './AppPicture.tsx';
import { useDesktopContext } from './desktopContext.ts';
import { APP_NAMES, nodePicture } from './labels.ts';
import { isHighlighted, type DesktopIconSpec } from './parts.ts';
import { strings } from './strings.ts';

/**
 * The icons on the desktop. One click opens an icon: an app, a file in its app, a folder or the
 * trash in the file explorer. Names show under icons unless the settings hide them; a screen
 * reader always hears them.
 */
export function DesktopIcons() {
  const { desktop, parts, highlight, sayName, open } = useDesktopContext();
  const { state, dispatch } = desktop;
  const { iconSize, showNames } = state.settings;

  function openFolder(folderId: string): void {
    const opened = open({ type: 'open-app', app: 'file-explorer' });
    const windowId = opened.events.find((event) => event.type === 'window-opened')?.windowId;
    if (windowId !== undefined)
      dispatch({ type: 'explorer', windowId, action: { type: 'open-node', nodeId: folderId } });
  }

  return (
    <ul className='td-icons' aria-label={t(strings.desktop)} data-icon-size={iconSize}>
      {parts.icons.map((spec, index) => {
        const icon = describe(spec);
        if (icon === null) return null;
        return (
          <li key={icon.key}>
            <button
              type='button'
              className='td-icon'
              data-desktop-icon={icon.key}
              data-highlight={isHighlighted(highlight, { kind: 'icon', index })}
              aria-label={icon.name}
              {...(icon.handle === null ? {} : sayName(icon.handle))}
              onClick={icon.run}
            >
              <span className='td-icon-picture'>{icon.picture}</span>
              <span className='td-icon-name' data-hidden={!showNames} aria-hidden='true'>
                {icon.name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );

  function describe(spec: DesktopIconSpec) {
    if ('trash' in spec) {
      return {
        key: 'trash',
        name: t(strings.trash),
        handle: strings.trash,
        picture: <Emoji id='trash-can' decorative />,
        run: () => openFolder(TRASH_ID),
      };
    }
    if ('app' in spec) {
      const target = spec.file === undefined ? undefined : nodeAtPath(state.fs, spec.file);
      return {
        key: `app:${spec.app}`,
        name: t(APP_NAMES[spec.app]),
        handle: APP_NAMES[spec.app],
        picture: <AppPicture app={spec.app} />,
        run: () =>
          open(
            target === undefined || target.kind === 'folder'
              ? { type: 'open-app', app: spec.app }
              : { type: 'open-file', fileId: target.id },
          ),
      };
    }
    const node = nodeAtPath(state.fs, spec.file);
    if (node === undefined) return null;
    return {
      key: `file:${spec.file}`,
      name: node.name,
      handle: null,
      picture: <Emoji id={nodePicture(node)} decorative />,
      run: () => (node.kind === 'folder' ? openFolder(node.id) : open({ type: 'open-file', fileId: node.id })),
    };
  }
}
