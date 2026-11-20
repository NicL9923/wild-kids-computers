import { Pencil, Plus, Trash2 } from 'lucide-react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { useId, useRef, useState, type RefObject } from 'react';
import { Avatar } from '../../components/ui/Avatar.tsx';
import { AVATAR_IDS } from '../../components/ui/avatars.ts';
import { Button } from '../../components/ui/Button.tsx';
import { Dialog } from '../../components/ui/Dialog.tsx';
import { PROFILE_COLOR_IDS } from '../../components/ui/profileColors.ts';
import { ProfileColorMark } from '../../components/ui/ProfileColorMark.tsx';
import { TextField } from '../../components/ui/TextField.tsx';
import { useReturnFocus } from '../../components/ui/useReturnFocus.ts';
import { DEFAULT_BAND, type Band } from '../../core/bands.ts';
import { t } from '../../core/strings/defineStrings.ts';
import { MAX_PROFILES, type Profile } from '../../core/storage/schemas.ts';
import { ChoiceGroup } from '../profiles/ChoiceGroup.tsx';
import {
  avatarName,
  avatarOptions,
  bandName,
  bandOptions,
  colorName,
  colorOptions,
} from '../profiles/profileChoices.tsx';
import { useProfiles, useSessionStore } from '../session/sessionHooks.ts';
import type { NewProfile } from '../session/sessionStore.ts';
import { strings } from './strings.ts';

const MAX_NAME_LENGTH = 40;

/** The name a profile goes by in the parent corner: the child's name, or else their animal. */
export function profileLabel(profile: Profile): string {
  if (profile.name !== undefined) return profile.name;
  const animal = avatarName(profile.avatarId);
  return animal === null ? '' : t(animal);
}

/** A profile's animal, color mark, and name, as one row of the parent corner shows it. */
export function ProfileBadge({ profile }: { profile: Profile }) {
  const color = colorName(profile.colorId);
  return (
    <span className='wk-parent-badge'>
      <Avatar avatarId={profile.avatarId} size='calc(var(--wk-target-min) * 1.5)' />
      <ProfileColorMark colorId={profile.colorId} label={color === null ? undefined : t(color)} />
      <span className='wk-parent-badge-name'>{profileLabel(profile)}</span>
    </span>
  );
}

type Editing = { kind: 'add' } | { kind: 'edit'; profile: Profile };

/** Every child's profile: add one, change one, or delete one after a confirmation. */
export function ProfilesSection() {
  const { profiles } = useProfiles();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<Profile | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();
  const full = profiles.length >= MAX_PROFILES;

  return (
    <section className='wk-parent-section' aria-labelledby={headingId}>
      <h2 id={headingId}>{t(strings.children)}</h2>
      <p className='wk-parent-about'>{t(strings.childrenAbout)}</p>
      <ul className='wk-parent-profiles'>
        {profiles.map((profile) => (
          <li key={profile.id} className='wk-parent-profile' data-profile={profile.id}>
            <ProfileBadge profile={profile} />
            <span className='wk-parent-profile-band'>{t(bandName(profile.band))}</span>
            <span className='wk-parent-profile-actions'>
              <Button
                icon={<Pencil className='wk-lucide' aria-hidden='true' />}
                onClick={() => setEditing({ kind: 'edit', profile })}
              >
                {t(strings.edit)}
              </Button>
              {/* Quiet here; the confirmation carries the danger color. */}
              <Button icon={<Trash2 className='wk-lucide' aria-hidden='true' />} onClick={() => setDeleting(profile)}>
                {t(strings.delete)}
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className='wk-parent-row'>
        <Button
          ref={addButtonRef}
          variant='primary'
          disabled={full}
          icon={<Plus className='wk-lucide' aria-hidden='true' />}
          onClick={() => setEditing({ kind: 'add' })}
        >
          {t(strings.addChild)}
        </Button>
        {full && <p className='wk-parent-about'>{t(strings.profilesFull)}</p>}
      </div>
      {editing !== null && <ProfileEditor editing={editing} onDone={() => setEditing(null)} />}
      {deleting !== null && (
        <DeleteProfile profile={deleting} afterDeleteFocus={addButtonRef} onDone={() => setDeleting(null)} />
      )}
    </section>
  );
}

/** The first of `ids` that no other profile uses, so a new child starts with a choice of their own. */
function firstUnused<T extends string>(ids: readonly T[], used: readonly string[]): T | undefined {
  return ids.find((id) => !used.includes(id)) ?? ids[0];
}

/** The id among `ids` equal to a saved value, or null for an id this build does not know. */
function known<T extends string>(ids: readonly T[], value: string): T | null {
  return ids.find((id) => id === value) ?? null;
}

function ProfileEditor({ editing, onDone }: { editing: Editing; onDone: () => void }) {
  const { profiles, createProfile, updateProfile } = useProfiles();
  const start =
    editing.kind === 'edit'
      ? editing.profile
      : {
          avatarId: firstUnused(
            AVATAR_IDS,
            profiles.map((p) => p.avatarId),
          ),
          colorId: firstUnused(
            PROFILE_COLOR_IDS,
            profiles.map((p) => p.colorId),
          ),
          band: DEFAULT_BAND,
          name: undefined,
        };
  const [avatarId, setAvatarId] = useState<string>(start.avatarId ?? AVATAR_IDS[0]);
  const [colorId, setColorId] = useState<string>(start.colorId ?? PROFILE_COLOR_IDS[0]);
  const [band, setBand] = useState<Band>(start.band);
  const [name, setName] = useState(start.name ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  /** A new child is added only once the list that names them is saved, so the dialog waits for it. */
  const save = async () => {
    const trimmed = name.trim();
    const profile: NewProfile =
      trimmed === '' ? { avatarId, colorId, band } : { avatarId, colorId, band, name: trimmed };
    if (editing.kind === 'edit') {
      // A function replaces the whole profile, so clearing the name removes it.
      updateProfile(editing.profile.id, () => profile);
      onDone();
      return;
    }
    setBusy(true);
    setFailed(false);
    const created = await createProfile(profile);
    setBusy(false);
    if (!created.ok) {
      setFailed(true);
      return;
    }
    onDone();
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onDone();
      }}
      title={t(editing.kind === 'add' ? strings.addTitle : strings.editTitle)}
      closeLabel={t(strings.close)}
      actions={
        <>
          <Button disabled={busy} onClick={onDone}>
            {t(strings.cancel)}
          </Button>
          <Button variant='primary' disabled={busy} onClick={() => void save()}>
            {t(strings.save)}
          </Button>
        </>
      }
    >
      <p role='alert' className='wk-parent-problem-text'>
        {failed ? t(strings.addProblem) : ''}
      </p>
      <div className='wk-parent-editor'>
        <ChoiceGroup
          legend={t(strings.avatarLabel)}
          layout='pictures'
          labels='always'
          options={avatarOptions('calc(var(--wk-target-min) * 1.5)')}
          value={known(AVATAR_IDS, avatarId)}
          onValueChange={setAvatarId}
        />
        <ChoiceGroup
          legend={t(strings.colorLabel)}
          layout='pictures'
          labels='always'
          options={colorOptions()}
          value={known(PROFILE_COLOR_IDS, colorId)}
          onValueChange={setColorId}
        />
        <TextField
          label={t(strings.nameLabel)}
          hint={t(strings.nameHint)}
          value={name}
          maxLength={MAX_NAME_LENGTH}
          autoComplete='off'
          spellCheck={false}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <ChoiceGroup
          legend={t(strings.bandLabel)}
          layout='cards'
          labels='always'
          options={bandOptions()}
          value={band}
          onValueChange={setBand}
        />
      </div>
    </Dialog>
  );
}

/**
 * Asks before deleting, and names what goes with the profile. Focus starts on "Keep profile", so
 * Enter by habit keeps it. The dialog stays open until the deletion finishes or fails.
 */
function DeleteProfile({
  profile,
  afterDeleteFocus,
  onDone,
}: {
  profile: Profile;
  afterDeleteFocus: RefObject<HTMLButtonElement | null>;
  onDone: () => void;
}) {
  const { deleteProfile, chooseProfile } = useProfiles();
  const store = useSessionStore();
  const returnFocus = useReturnFocus();
  const deleted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    const result = await deleteProfile(profile.id);
    setBusy(false);
    if (!result.ok) {
      setFailed(true);
      return;
    }
    deleted.current = true;
    // Deleting the active child leaves none active. Only now, with the profile gone from the
    // list, can the settings move to the first child left without picking the deleted one.
    const { activeProfile, profiles } = store.getSnapshot();
    const next = profiles[0];
    if (activeProfile === null && next !== undefined) chooseProfile(next.id);
    onDone();
    // Move focus explicitly because the deleted row's button is gone from the DOM.
    queueMicrotask(() => {
      const target = afterDeleteFocus.current;
      if (target !== null && target.isConnected && !target.disabled) target.focus();
    });
  };

  return (
    <AlertDialogPrimitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onDone();
      }}
    >
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className='wk-dialog-scrim' />
        <AlertDialogPrimitive.Content
          className='wk-dialog'
          data-band='band-9-12'
          data-text-size='standard'
          data-letter-spacing='standard'
          {...returnFocus}
          onCloseAutoFocus={(event) => {
            if (deleted.current) {
              const target = afterDeleteFocus.current;
              if (target !== null && target.isConnected && !target.disabled) {
                event.preventDefault();
                target.focus();
                return;
              }
            }
            returnFocus.onCloseAutoFocus(event);
          }}
        >
          <AlertDialogPrimitive.Title className='wk-dialog-title'>{t(strings.deleteTitle)}</AlertDialogPrimitive.Title>
          <ProfileBadge profile={profile} />
          <AlertDialogPrimitive.Description className='wk-dialog-description'>
            {t(strings.deleteWhat)}
          </AlertDialogPrimitive.Description>
          <p role='alert' className='wk-parent-problem-text'>
            {failed ? t(strings.deleteProblem) : ''}
          </p>
          <div className='wk-dialog-actions'>
            <AlertDialogPrimitive.Cancel className='wk-button' data-variant='secondary' disabled={busy}>
              {t(strings.deleteKeep)}
            </AlertDialogPrimitive.Cancel>
            <Button variant='danger' disabled={busy} onClick={() => void confirm()}>
              {t(strings.deleteConfirm)}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
