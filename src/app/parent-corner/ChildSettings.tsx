import { Music, Volume2 } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useAudio } from '../../audio/AudioProvider.tsx';
import { Avatar } from '../../components/ui/Avatar.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { SegmentedChoice } from '../../components/ui/SegmentedChoice.tsx';
import { Slider } from '../../components/ui/Slider.tsx';
import { Switch } from '../../components/ui/Switch.tsx';
import { t } from '../../core/strings/defineStrings.ts';
import type { Settings } from '../../core/storage/schemas.ts';
import { ChoiceGroup } from '../profiles/ChoiceGroup.tsx';
import { useActiveProfile, useProfiles, useSettings } from '../session/sessionHooks.ts';
import { ProfileBadge, profileLabel } from './ProfilesSection.tsx';
import { strings } from './strings.ts';

const TEXT_SIZES = ['standard', 'large', 'larger'] as const satisfies readonly Settings['textSize'][];
const LETTER_SPACINGS = ['standard', 'wide', 'wider'] as const satisfies readonly Settings['letterSpacing'][];
const MOTION = ['system', 'on', 'off'] as const satisfies readonly Settings['reducedMotion'][];
/** Session length choices in minutes. Off is the default. */
const SESSION_MINUTES = [15, 30, 45, 60, 90] as const;
/** `custom` is a saved length that is not one of the choices, so no choice shows as picked. */
type SessionChoice = 'off' | 'custom' | `${(typeof SESSION_MINUTES)[number]}`;

const percent = new Intl.NumberFormat(undefined, { style: 'percent' });

function sessionChoice(minutes: number | null): SessionChoice {
  if (minutes === null) return 'off';
  const choice = SESSION_MINUTES.find((known) => known === minutes);
  return choice === undefined ? 'custom' : `${choice}`;
}

/**
 * Settings that belong to one child. The child chosen here becomes the active profile, because
 * the session holds one profile's settings at a time; the meadow then opens for that child.
 */
export function ChildSettings() {
  const { profiles, chooseProfile } = useProfiles();
  const profile = useActiveProfile();
  const { settings, updateSettings } = useSettings();
  const audio = useAudio();
  const headingId = useId();
  if (profile === null) return null;

  return (
    <section className='wk-parent-section' aria-labelledby={headingId}>
      <h2 id={headingId}>{t(strings.settings)}</h2>
      {profiles.length > 1 ? (
        <>
          <p className='wk-parent-about'>{t(strings.settingsAbout)}</p>
          <ChoiceGroup
            legend={t(strings.settingsChild)}
            layout='pictures'
            labels='always'
            options={profiles.map((choice) => ({
              value: choice.id,
              label: profileLabel(choice),
              picture: <Avatar avatarId={choice.avatarId} size='calc(var(--wk-target-min) * 1.5)' />,
            }))}
            value={profile.id}
            onValueChange={chooseProfile}
          />
        </>
      ) : (
        <ProfileBadge profile={profile} />
      )}

      <Group title={t(strings.sound)}>
        <Switch
          label={t(strings.muteSound)}
          description={t(strings.muteSoundAbout)}
          checked={settings.muted}
          onCheckedChange={(muted) => updateSettings({ muted })}
        />
        <Slider
          label={t(strings.voiceVolume)}
          min={0}
          max={100}
          step={10}
          value={Math.round(settings.voiceVolume * 100)}
          valueText={percent.format(settings.voiceVolume)}
          onValueChange={(value) =>
            updateSettings(
              value > 0 && settings.muted ? { voiceVolume: value / 100, muted: false } : { voiceVolume: value / 100 },
            )
          }
        />
        <Slider
          label={t(strings.effectsVolume)}
          min={0}
          max={100}
          step={10}
          value={Math.round(settings.effectsVolume * 100)}
          valueText={percent.format(settings.effectsVolume)}
          onValueChange={(value) =>
            updateSettings(
              value > 0 && settings.muted
                ? { effectsVolume: value / 100, muted: false }
                : { effectsVolume: value / 100 },
            )
          }
        />
        <div className='wk-parent-row'>
          <Button
            icon={<Volume2 className='wk-lucide' aria-hidden='true' />}
            onClick={() => {
              if (settings.muted) {
                updateSettings({ muted: false });
                audio.setVolume({ muted: false });
              }
              void audio.speak(strings.voiceSample);
            }}
          >
            {t(strings.playVoice)}
          </Button>
          <Button
            icon={<Music className='wk-lucide' aria-hidden='true' />}
            onClick={() => {
              if (settings.muted) {
                updateSettings({ muted: false });
                audio.setVolume({ muted: false });
              }
              audio.play('chime');
            }}
          >
            {t(strings.playEffect)}
          </Button>
        </div>
      </Group>

      <Group title={t(strings.reading)}>
        <SegmentedChoice
          label={t(strings.textSize)}
          options={TEXT_SIZES.map((value) => ({ value, label: t(strings[`text-size-${value}`]) }))}
          value={settings.textSize}
          onValueChange={(textSize) => updateSettings({ textSize })}
        />
        <SegmentedChoice
          label={t(strings.letterSpacing)}
          options={LETTER_SPACINGS.map((value) => ({ value, label: t(strings[`letter-spacing-${value}`]) }))}
          value={settings.letterSpacing}
          onValueChange={(letterSpacing) => updateSettings({ letterSpacing })}
        />
        <figure className='wk-parent-preview'>
          <figcaption className='wk-field-label'>{t(strings.preview)}</figcaption>
          {/* The child's own band, text size, and spacing, on this one element. */}
          <p
            className='wk-parent-preview-text'
            data-band={profile.band}
            data-text-size={settings.textSize}
            data-letter-spacing={settings.letterSpacing}
          >
            {t(strings.previewText)}
          </p>
        </figure>
      </Group>

      <Group title={t(strings.motion)}>
        <SegmentedChoice
          label={t(strings.reducedMotion)}
          options={MOTION.map((value) => ({ value, label: t(strings[`motion-${value}`]) }))}
          value={settings.reducedMotion}
          onValueChange={(reducedMotion) => updateSettings({ reducedMotion })}
        />
      </Group>

      <Group title={t(strings.playTime)}>
        <p className='wk-parent-about'>{t(strings.sessionLengthAbout)}</p>
        <SegmentedChoice<SessionChoice>
          label={t(strings.sessionLength)}
          options={[
            { value: 'off', label: t(strings['session-off']) },
            ...SESSION_MINUTES.map((minutes) => ({
              value: `${minutes}` as const,
              label: t(strings[`session-${minutes}`]),
            })),
          ]}
          value={sessionChoice(settings.sessionLengthMinutes)}
          onValueChange={(choice) => updateSettings({ sessionLengthMinutes: choice === 'off' ? null : Number(choice) })}
        />
      </Group>

      <Group title={t(strings.pictures)}>
        <Switch
          label={t(strings.outputGate)}
          description={t(strings.outputGateAbout)}
          checked={settings.outputNeedsParentGate}
          onCheckedChange={(outputNeedsParentGate) => updateSettings({ outputNeedsParentGate })}
        />
      </Group>
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='wk-parent-group'>
      <h3>{title}</h3>
      {children}
    </div>
  );
}
