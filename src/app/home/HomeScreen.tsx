import { Navigate, useNavigate } from '@tanstack/react-router';
import { useRef, type FocusEvent, type PointerEvent } from 'react';
import { useAudio, useMute } from '../../audio/AudioProvider.tsx';
import { Avatar } from '../../components/ui/Avatar.tsx';
import { HomeMap, type HomeMapPlace } from '../../components/ui/HomeMap.tsx';
import { HOME_PLACE_IDS, type HomePlaceId } from '../../components/ui/homePlaces.ts';
import { IconButton } from '../../components/ui/IconButton.tsx';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon.tsx';
import { t } from '../../core/strings/defineStrings.ts';
import { useSessionLimit } from '../closing/useSessionLimit.ts';
import { PARENT_CORNER_PATH, placePath, START_PATH } from '../paths.ts';
import { useActiveProfile, useProfiles, useSessionStatus } from '../session/sessionHooks.ts';
import { ReplayButton, useSpeakOnShow } from '../shell/Instruction.tsx';
import { strings as shellStrings } from '../shell/strings.ts';
import { strings } from './strings.ts';
import '../shell/shell.css';

const INSTRUCTION = [strings.instruction];

function isPlaceId(value: string | undefined): value is HomePlaceId {
  return (HOME_PLACE_IDS as readonly (string | undefined)[]).includes(value);
}

/** The home map for the active child. Without one ready, the start screen decides what comes first. */
export default function HomeScreen() {
  const status = useSessionStatus();
  if (status === 'loading') return null;
  if (status !== 'ready') return <Navigate to={START_PATH} replace />;
  return <Meadow />;
}

function Meadow() {
  const navigate = useNavigate();
  const audio = useAudio();
  const [muted, toggleMute] = useMute();
  const { profiles } = useProfiles();
  const profile = useActiveProfile();
  const { closeIfLimitReached } = useSessionLimit();
  const spokenPlace = useRef<HomePlaceId | null>(null);
  useSpeakOnShow(INSTRUCTION);

  const go = (to: string) => {
    if (closeIfLimitReached()) return;
    void navigate({ to });
  };

  const place = (id: HomePlaceId): HomeMapPlace => ({
    label: t(strings[`place-${id}`]),
    onSelect: () => go(placePath(id)),
  });
  const places: Record<HomePlaceId, HomeMapPlace> = {
    'paint-studio': place('paint-studio'),
    'early-learning': place('early-learning'),
    'toy-desktop': place('toy-desktop'),
    'computer-skills': place('computer-skills'),
    'robot-painter': place('robot-painter'),
  };

  // Each place says its name once when the pointer or the keyboard reaches it. HomeMap renders
  // the buttons, so the names come from events that bubble up to this wrapper.
  const speakPlace = (target: EventTarget) => {
    const reached = target instanceof Element ? target.closest<HTMLElement>('[data-place]')?.dataset.place : undefined;
    if (!isPlaceId(reached) || reached === spokenPlace.current) return;
    spokenPlace.current = reached;
    void audio.speak(strings[`place-${reached}`]);
  };
  const forgetPlace = (event: PointerEvent | FocusEvent) => {
    const next = event.relatedTarget instanceof Element ? event.relatedTarget.closest('[data-place]') : null;
    if (next === null) spokenPlace.current = null;
  };

  return (
    <div className='wk-home'>
      <h1 className='wk-visually-hidden'>{t(strings.title)}</h1>
      <div
        className='wk-home-map-frame'
        onPointerOver={(event) => speakPlace(event.target)}
        onFocus={(event) => speakPlace(event.target)}
        onPointerOut={forgetPlace}
        onBlur={forgetPlace}
      >
        <HomeMap label={t(strings.title)} places={places} />
      </div>
      <div className='wk-screen-bar wk-home-bar'>
        <div className='wk-screen-slot' data-slot='exit'>
          {profiles.length > 1 && profile !== null && (
            <IconButton
              label={t(strings.changePlayer)}
              icon={<Avatar avatarId={profile.avatarId} size='var(--wk-icon-size)' />}
              onClick={() => void navigate({ to: START_PATH })}
            />
          )}
        </div>
        <div className='wk-screen-slot' data-slot='instruction'>
          <ReplayButton handles={INSTRUCTION} />
        </div>
        <div className='wk-screen-slot' data-slot='end'>
          <IconButton
            label={t(shellStrings.mute)}
            icon={<InterfaceIcon name={muted ? 'sound-off' : 'sound-on'} />}
            pressed={muted}
            onClick={toggleMute}
          />
        </div>
      </div>
      <div className='wk-corner-control'>
        <IconButton
          label={t(shellStrings.grownUps)}
          icon={<InterfaceIcon name='parent-corner' />}
          onClick={() => void navigate({ to: PARENT_CORNER_PATH })}
        />
      </div>
    </div>
  );
}
