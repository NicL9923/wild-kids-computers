import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { useAudio } from '../../audio/AudioProvider.tsx';
import { Avatar } from '../../components/ui/Avatar.tsx';
import { IconButton } from '../../components/ui/IconButton.tsx';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon.tsx';
import { ProfileColorMark } from '../../components/ui/ProfileColorMark.tsx';
import { t } from '../../core/strings/defineStrings.ts';
import type { Profile } from '../../core/storage/schemas.ts';
import { HOME_PATH, PARENT_CORNER_PATH } from '../paths.ts';
import { avatarName, colorName } from '../profiles/profileChoices.tsx';
import { useProfiles } from '../session/sessionHooks.ts';
import { ReplayButton, useSpeakOnShow } from '../shell/Instruction.tsx';
import { strings as shellStrings } from '../shell/strings.ts';
import { strings as startStrings } from '../start/strings.ts';
import { strings } from './strings.ts';
import '../shell/shell.css';

const QUESTION = [strings.heading];
const NOT_OPENED = [startStrings.unavailable, strings.heading];

/**
 * "Who is playing?" Each child is a big button with their animal, their color mark, and their
 * name when they have one, so a child who cannot read finds theirs by picture. The question is
 * spoken, and each animal says its name when the pointer or the keyboard reaches it.
 *
 * When the saved things of the child chosen last could not be opened, it says so first, and the
 * grown-ups control leads to the parent corner, where an adult can delete that profile. Choosing
 * the child again tries again. Every other child still opens as usual.
 */
export default function ProfileChoice() {
  const { profiles, notOpened, chooseProfile } = useProfiles();
  const navigate = useNavigate();
  const audio = useAudio();
  const spoken = useRef<string | null>(null);
  const instruction = notOpened === null ? QUESTION : NOT_OPENED;
  useSpeakOnShow(instruction);

  const sayName = (profile: Profile) => {
    if (spoken.current === profile.id) return;
    spoken.current = profile.id;
    const name = avatarName(profile.avatarId);
    if (name !== null) void audio.speak(name);
  };

  const choose = (profile: Profile) => {
    audio.play('tap');
    chooseProfile(profile.id);
    void navigate({ to: HOME_PATH });
  };

  return (
    <main className='wk-choose'>
      <header className='wk-choose-head'>
        <ReplayButton handles={instruction} />
        <h1 className='wk-choose-heading'>{t(strings.heading)}</h1>
      </header>
      {notOpened !== null && <p className='wk-choose-problem'>{t(startStrings.unavailable)}</p>}
      <ul className='wk-choose-list'>
        {profiles.map((profile) => {
          const animal = avatarName(profile.avatarId);
          const color = colorName(profile.colorId);
          return (
            <li key={profile.id}>
              <button
                type='button'
                className='wk-choose-profile'
                data-profile={profile.id}
                onClick={() => choose(profile)}
                onFocus={() => sayName(profile)}
                onBlur={() => {
                  spoken.current = null;
                }}
                onPointerEnter={() => sayName(profile)}
                onPointerLeave={() => {
                  spoken.current = null;
                }}
              >
                <Avatar
                  avatarId={profile.avatarId}
                  label={animal === null ? undefined : t(animal)}
                  size='calc(var(--wk-target-large) * 1.25)'
                />
                <span className='wk-choose-name'>
                  <ProfileColorMark colorId={profile.colorId} label={color === null ? undefined : t(color)} />
                  {profile.name !== undefined && <span>{profile.name}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {notOpened !== null && (
        <div className='wk-corner-control'>
          <IconButton
            label={t(shellStrings.grownUps)}
            icon={<InterfaceIcon name='parent-corner' />}
            onClick={() => void navigate({ to: PARENT_CORNER_PATH })}
          />
        </div>
      )}
    </main>
  );
}
