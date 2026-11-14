import { useState } from 'react';
import { useAudio } from '../../audio/AudioProvider.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon.tsx';
import { Switch } from '../../components/ui/Switch.tsx';
import { TextField } from '../../components/ui/TextField.tsx';
import { t, type SpokenHandle } from '../../core/strings/defineStrings.ts';
import { ChoiceGroup } from '../profiles/ChoiceGroup.tsx';
import {
  avatarName,
  avatarOptions,
  bandAbout,
  bandName,
  bandOptions,
  colorName,
  colorOptions,
} from '../profiles/profileChoices.tsx';
import { useAppDocument, useProfiles } from '../session/sessionHooks.ts';
import { ReplayButton, useSpeakOnShow } from '../shell/Instruction.tsx';
import {
  EMPTY_DRAFT,
  firstLaunchSteps,
  missingChoice,
  profileFromDraft,
  type FirstLaunchStep,
  type ProfileDraft,
} from './steps.ts';
import { strings } from './strings.ts';
import '../shell/shell.css';

/** The longest name the profile schema accepts. */
const MAX_NAME_LENGTH = 40;

const INSTRUCTION: Record<FirstLaunchStep, readonly SpokenHandle[]> = {
  animal: [strings.animalHeading],
  color: [strings.colorHeading],
  band: [strings.bandHeading, strings.bandIntro],
  sound: [strings.soundHeading],
  kiosk: [strings.kioskHeading, strings.kioskAbout],
};

const MISSING: Record<'animal' | 'color' | 'band', SpokenHandle> = {
  animal: strings.pickAnimalFirst,
  color: strings.pickColorFirst,
  band: strings.pickBandFirst,
};

type Hearing = 'not-tried' | 'played' | 'not-heard';

function focusOnMount(element: HTMLElement | null): void {
  element?.focus();
}

/**
 * First launch, for a parent and child together: an animal and a color, an optional name, the
 * age band, a sound check, and kiosk lock. Every step is spoken and has a replay control. The
 * start screen leaves this flow on its own once `firstLaunchDone` is saved.
 */
export default function FirstLaunch() {
  const audio = useAudio();
  const { profiles, createProfile, updateProfile, chooseProfile } = useProfiles();
  const { updateApp, setKioskLock } = useAppDocument();
  // Decided once: a profile this flow saves must not turn the remaining steps into a resume.
  const [steps] = useState(() => firstLaunchSteps(profiles.length > 0));
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [missing, setMissing] = useState<SpokenHandle | null>(null);
  const [hearing, setHearing] = useState<Hearing>('not-tried');
  const [kiosk, setKiosk] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const step = steps[index] ?? 'kiosk';
  const isLast = index === steps.length - 1;
  useSpeakOnShow(INSTRUCTION[step]);

  const change = (update: Partial<ProfileDraft>, spoken: readonly (SpokenHandle | null)[] = []) => {
    setDraft((current) => ({ ...current, ...update }));
    setMissing(null);
    const say = spoken.filter((handle): handle is SpokenHandle => handle !== null);
    if (say.length > 0) void audio.speakSequence(say);
  };

  const saveProfile = () => {
    const profile = profileFromDraft(draft);
    if (profile === null) return;
    if (profileId === null) {
      const created = createProfile(profile);
      setProfileId(created.id);
      chooseProfile(created.id);
    } else {
      // Back from a later step: change the saved profile instead of adding a second one.
      updateProfile(profileId, () => profile);
    }
  };

  const next = async () => {
    const lacking = missingChoice(step, draft);
    if (lacking !== null) {
      setMissing(MISSING[lacking]);
      void audio.speak(MISSING[lacking]);
      return;
    }
    if (step === 'band') saveProfile();
    if (!isLast) {
      setIndex(index + 1);
      return;
    }
    setFinishing(true);
    // Kiosk lock is best effort; the flow finishes even if the window refuses it.
    if (kiosk) await setKioskLock(true);
    updateApp({ firstLaunchDone: true });
  };

  const playSound = (spoken: readonly SpokenHandle[]) => {
    audio.play('chime');
    void audio.speakSequence(spoken);
  };

  return (
    <div className='wk-setup'>
      <header className='wk-setup-head'>
        <ReplayButton handles={INSTRUCTION[step]} />
        {/* A new heading per step takes focus as it appears, so keyboard and screen reader users
            begin each step at its question. */}
        <h1 key={step} ref={focusOnMount} tabIndex={-1} className='wk-setup-heading'>
          {t(INSTRUCTION[step][0] ?? strings.animalHeading)}
        </h1>
      </header>

      <main className='wk-setup-body'>
        {step === 'animal' && (
          <ChoiceGroup
            legend={t(strings.animalLabel)}
            legendHidden
            layout='pictures'
            labels='reading'
            options={avatarOptions()}
            value={draft.avatarId}
            onValueChange={(avatarId) => change({ avatarId }, [avatarName(avatarId)])}
          />
        )}

        {step === 'color' && (
          <div className='wk-setup-stack'>
            <ChoiceGroup
              legend={t(strings.colorLabel)}
              legendHidden
              layout='pictures'
              labels='reading'
              options={colorOptions('calc(var(--wk-target-min) * 1.5)')}
              value={draft.colorId}
              onValueChange={(colorId) => change({ colorId }, [colorName(colorId)])}
            />
            <TextField
              className='wk-setup-name'
              label={t(strings.nameLabel)}
              hint={t(strings.nameHint)}
              value={draft.name}
              maxLength={MAX_NAME_LENGTH}
              autoComplete='off'
              spellCheck={false}
              onChange={(event) => change({ name: event.currentTarget.value })}
            />
          </div>
        )}

        {step === 'band' && (
          <div className='wk-setup-stack'>
            <p className='wk-setup-intro'>{t(strings.bandIntro)}</p>
            <ChoiceGroup
              legend={t(strings.bandLabel)}
              legendHidden
              layout='cards'
              labels='always'
              options={bandOptions()}
              value={draft.band}
              onValueChange={(band) => change({ band }, [bandName(band), bandAbout(band)])}
            />
          </div>
        )}

        {step === 'sound' && (
          <div className='wk-setup-stack wk-setup-sound'>
            <Button
              variant='primary'
              icon={<InterfaceIcon name='sound-on' />}
              onClick={() => {
                setHearing((current) => (current === 'not-tried' ? 'played' : current));
                playSound([strings.testSentence, strings.heardQuestion]);
              }}
            >
              {t(strings.playSound)}
            </Button>
            {hearing !== 'not-tried' && (
              <fieldset className='wk-setup-question'>
                <legend className='wk-setup-question-text'>{t(strings.heardQuestion)}</legend>
                <div className='wk-setup-actions'>
                  <Button onClick={() => void next()}>{t(strings.heardYes)}</Button>
                  <Button
                    onClick={() => {
                      setHearing('not-heard');
                      playSound([strings.volumeHint, strings.testSentence, strings.heardQuestion]);
                    }}
                  >
                    {t(strings.heardNo)}
                  </Button>
                </div>
              </fieldset>
            )}
            <output className='wk-setup-hint'>{hearing === 'not-heard' ? t(strings.volumeHint) : ''}</output>
          </div>
        )}

        {step === 'kiosk' && (
          <div className='wk-setup-stack wk-setup-kiosk'>
            <Switch
              label={t(strings.kioskLabel)}
              description={t(strings.kioskAbout)}
              checked={kiosk}
              onCheckedChange={setKiosk}
            />
          </div>
        )}
      </main>

      <footer className='wk-setup-foot'>
        <div>
          {index > 0 && (
            <Button
              onClick={() => {
                setMissing(null);
                setIndex(index - 1);
              }}
            >
              {t(strings.back)}
            </Button>
          )}
        </div>
        <ol className='wk-setup-dots' aria-hidden='true'>
          {steps.map((name, position) => (
            <li key={name} data-state={position < index ? 'done' : position === index ? 'current' : 'next'} />
          ))}
        </ol>
        <div className='wk-setup-next'>
          <output className='wk-setup-missing'>{missing === null ? '' : t(missing)}</output>
          <Button variant='primary' disabled={finishing} onClick={() => void next()}>
            {t(isLast ? strings.finish : strings.next)}
          </Button>
        </div>
      </footer>
    </div>
  );
}
