import type { SpokenHandle } from '../../core/strings/defineStrings.ts';
import type { EmojiId } from '../../core/strings/shared/emoji.ts';

/**
 * A stamp category for the paint studio's stamp library. Each category is one module in stamps/,
 * named after its id, whose default export comes from `defineStampCategory`. The registry in
 * src/registry/stampCategories.ts finds them, so adding a category edits no list.
 *
 * Stamps are bundled Fluent Emoji. Each one's spoken name comes from the shared emoji strings.
 */
export interface StampCategory {
  /** camelCase, matching the file name. */
  readonly id: string;
  /** Position in the library, lowest first. */
  readonly order: number;
  /** The spoken name of the category. */
  readonly title: SpokenHandle;
  /** The picture on the category's button. */
  readonly icon: EmojiId;
  readonly stamps: readonly EmojiId[];
}

const CATEGORY_ID = /^[a-z][a-zA-Z0-9]*$/;

/** Checks a category and returns it. A bad one throws at import, so the registry test catches it. */
export function defineStampCategory(category: StampCategory): StampCategory {
  const { id } = category;
  if (!CATEGORY_ID.test(id)) throw new Error(`Stamp category id "${id}" must be camelCase, like "seaAndBugs".`);
  if (!Number.isInteger(category.order) || category.order < 0) {
    throw new Error(`Stamp category "${id}": order must be a whole number from 0, got ${category.order}.`);
  }
  if (category.stamps.length === 0) throw new Error(`Stamp category "${id}" has no stamps.`);
  const repeated = category.stamps.find((stamp, i) => category.stamps.indexOf(stamp) !== i);
  if (repeated !== undefined) throw new Error(`Stamp category "${id}" lists "${repeated}" twice.`);
  return category;
}
