import { t } from '../../core/strings/defineStrings.ts';
import { strings as emojiNames, type EmojiId } from '../../core/strings/shared/emoji.ts';
import { emojiUrl } from '../../registry/emoji.ts';

export interface EmojiProps {
  readonly id: EmojiId;
  /** Hides the picture from assistive technology when nearby text already names it. */
  readonly decorative?: boolean;
  readonly className?: string;
}

/**
 * A bundled Fluent Emoji picture. Its accessible name is the emoji's spoken name, so a screen
 * reader says the same word the voice does. Size it with `className`.
 */
export function Emoji({ id, decorative = false, className }: EmojiProps) {
  return <img src={emojiUrl(id)} alt={decorative ? '' : t(emojiNames[id])} className={className} />;
}
