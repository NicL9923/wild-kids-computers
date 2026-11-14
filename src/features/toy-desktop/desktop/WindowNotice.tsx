import { t } from '../../../core/strings/defineStrings.ts';
import { useDesktopContext } from './desktopContext.ts';

/**
 * The last gentle sentence for this window, such as "That name is here already", next to the
 * field it is about. It is spoken too; this keeps it on screen until the next action.
 */
export function WindowNotice({ windowId }: { readonly windowId: string }) {
  const { notice } = useDesktopContext();
  return (
    <output className='td-notice' data-notice={notice?.windowId === windowId ? 'shown' : 'none'}>
      {notice?.windowId === windowId ? t(notice.handle) : ''}
    </output>
  );
}
