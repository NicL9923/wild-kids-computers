import { useNavigate } from '@tanstack/react-router';
import { useRef } from 'react';
import { useAudio } from '../../audio/AudioProvider.tsx';
import { Avatar } from '../../components/ui/Avatar.tsx';
import { ProfileColorMark } from '../../components/ui/ProfileColorMark.tsx';
import { t } from '../../core/strings/defineStrings.ts';
import type { Profile } from '../../core/storage/schemas.ts';
import { HOME_PATH } from '../paths.ts';
import { avatarName, colorName } from '../profiles/profileChoices.tsx';
import { useProfiles } from '../session/sessionHooks.ts';
import { ReplayButton, useSpeakOnShow } from '../shell/Instruction.tsx';
import { strings } from './strings.ts';
import '../shell/shell.css';

const QUESTION = [strings.heading];

/**
 * "Who is playing?" Each child is a big button with their animal, their color mark, and their
 * name when they have one, so a child who cannot read finds theirs by picture. The question is
 * spoken, and each animal says its name when the pointer or the keyboard reaches it.
 */
export default function ProfileChoice() {
  const { profiles, chooseProfile } = useProfiles();
  const navigate = useNavigate();
  const audio = useAudio();
  const spoken = useRef<string | null>(null);
  useSpeakOnShow(QUESTION);

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
        <ReplayButton handles={QUESTION} />
        <h1 className='wk-choose-heading'>{t(strings.heading)}</h1>
      </header>
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
    </main>
  );
}
