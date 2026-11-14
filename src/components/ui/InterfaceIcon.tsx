import { INTERFACE_ICONS, type InterfaceIconName } from './interfaceIcons.ts';

/**
 * One of the interface pictures, sized by --wk-icon-size. It is decorative: the button around it
 * carries the name.
 */
export function InterfaceIcon({ name }: { name: InterfaceIconName }) {
  return <img className='wk-icon' src={INTERFACE_ICONS[name]} alt='' draggable={false} />;
}
