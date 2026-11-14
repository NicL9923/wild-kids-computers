import { getRouteApi } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { AlertDialog } from '../../components/ui/AlertDialog.tsx';
import { Avatar } from '../../components/ui/Avatar.tsx';
import { AVATAR_IDS } from '../../components/ui/avatars.ts';
import { Button } from '../../components/ui/Button.tsx';
import { CalmPanel } from '../../components/ui/CalmPanel.tsx';
import { Dialog } from '../../components/ui/Dialog.tsx';
import { HomeMap, type HomeMapPlace } from '../../components/ui/HomeMap.tsx';
import { areaPicture, HOME_PLACE_IDS, type HomePlaceId } from '../../components/ui/homePlaces.ts';
import { IconButton } from '../../components/ui/IconButton.tsx';
import { InterfaceIcon } from '../../components/ui/InterfaceIcon.tsx';
import { INTERFACE_ICON_NAMES } from '../../components/ui/interfaceIcons.ts';
import { PROFILE_COLOR_IDS } from '../../components/ui/profileColors.ts';
import { ProfileColorMark } from '../../components/ui/ProfileColorMark.tsx';
import { Screen } from '../../components/ui/Screen.tsx';
import { SegmentedChoice } from '../../components/ui/SegmentedChoice.tsx';
import { Slider } from '../../components/ui/Slider.tsx';
import { Switch } from '../../components/ui/Switch.tsx';
import { TextField } from '../../components/ui/TextField.tsx';
import { Tile } from '../../components/ui/Tile.tsx';
import { VisuallyHidden } from '../../components/ui/VisuallyHidden.tsx';
import { BANDS, type Band } from '../../core/bands.ts';
import { DEFAULT_THEME, ThemeRoot } from '../theme/ThemeRoot.tsx';
import { galleryText as text } from './galleryText.ts';
import { GALLERY_VIEWS, type GalleryView } from './galleryViews.ts';

const route = getRouteApi('/dev/gallery');

const place = (id: HomePlaceId): HomeMapPlace => ({ label: text.places[id], onSelect: () => {} });

const PLACES: Record<HomePlaceId, HomeMapPlace> = {
  'paint-studio': place('paint-studio'),
  'early-learning': place('early-learning'),
  'toy-desktop': place('toy-desktop'),
  'computer-skills': place('computer-skills'),
  'robot-painter': place('robot-painter'),
};

/** Every primitive, the art, and the colors, at the band in the URL. A developer screen. */
export default function ComponentGallery() {
  const { band, view } = route.useSearch();
  const theme = useMemo(() => ({ ...DEFAULT_THEME, band }), [band]);
  return (
    <ThemeRoot settings={theme}>
      <GalleryPage band={band} view={view} />
    </ThemeRoot>
  );
}

function GalleryPage({ band, view }: { band: Band; view: GalleryView }) {
  const navigate = route.useNavigate();

  if (view === 'map') {
    return (
      <main className='h-dvh'>
        <h1>
          <VisuallyHidden>{text.homeMap}</VisuallyHidden>
        </h1>
        <HomeMap label={text.meadow} places={PLACES} />
      </main>
    );
  }
  if (view === 'finish') {
    return (
      <CalmPanel
        picture='finish'
        heading={text.finishHeading}
        actions={
          <>
            <Button icon={<InterfaceIcon name='play-again' />}>{text.primary}</Button>
            <Button icon={<InterfaceIcon name='meadow' />}>{text.secondary}</Button>
          </>
        }
      />
    );
  }
  if (view === 'closing') return <CalmPanel picture='closing' heading={text.closingHeading} />;

  return (
    <Screen
      exit={<IconButton label={text.exit} icon={<InterfaceIcon name='meadow' />} />}
      instruction={<InstructionDemo />}
      end={<MuteDemo />}
    >
      <div className='mx-auto flex max-w-[1400px] flex-col gap-section'>
        <h1 className='m-0 text-display'>{text.title}</h1>
        <div className='flex flex-wrap gap-container'>
          <SegmentedChoice
            label={text.bandQuestion}
            options={BANDS.map((value) => ({ value, label: text.bands[value] }))}
            value={band}
            onValueChange={(next) => void navigate({ search: { band: next, view } })}
          />
          <SegmentedChoice
            label={text.viewQuestion}
            options={GALLERY_VIEWS.map((value) => ({ value, label: text.views[value] }))}
            value={view}
            onValueChange={(next) => void navigate({ search: { band, view: next } })}
          />
        </div>

        <Section title={text.buttons}>
          <div className='flex flex-wrap items-center gap-item'>
            <Button variant='primary' icon={<InterfaceIcon name='play-again' />}>
              {text.primary}
            </Button>
            <Button icon={<InterfaceIcon name='meadow' />}>{text.secondary}</Button>
            <Button variant='danger' icon={<Trash2 className='wk-lucide' aria-hidden='true' />}>
              {text.danger}
            </Button>
            <Button disabled>{text.disabled}</Button>
          </div>
        </Section>

        <Section title={text.iconButtons}>
          <div className='flex flex-wrap gap-item'>
            {INTERFACE_ICON_NAMES.map((name) => (
              <IconButton key={name} label={text.icons[name]} icon={<InterfaceIcon name={name} />} />
            ))}
          </div>
        </Section>

        <Section title={text.tiles}>
          <TileDemo />
        </Section>

        <Section title={text.homeMap}>
          <div className='h-[min(70dvh,calc(min(100vw,1400px)*0.625))] overflow-hidden rounded-card'>
            <HomeMap label={text.meadow} places={PLACES} />
          </div>
        </Section>

        <Section title={text.avatars}>
          <div className='flex flex-wrap gap-container'>
            {AVATAR_IDS.map((id) => (
              <Avatar key={id} avatarId={id} label={text.avatarNames[id]} />
            ))}
          </div>
          <h3 className='m-0 text-body'>{text.avatarAtMinimum}</h3>
          <div className='flex flex-wrap gap-item'>
            {AVATAR_IDS.map((id) => (
              <Avatar key={id} avatarId={id} label={text.avatarNames[id]} size='var(--wk-target-min)' />
            ))}
          </div>
        </Section>

        <Section title={text.colors}>
          <ul className='m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-item p-0'>
            {PROFILE_COLOR_IDS.map((id) => (
              <li key={id} className='flex items-center gap-item'>
                <ProfileColorMark colorId={id} />
                <span>{text.colorNames[id]}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={text.fields}>
          <FieldsDemo />
        </Section>

        <Section title={text.dialogs}>
          <DialogsDemo />
        </Section>
      </div>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-container'>
      <h2 className='m-0 text-title'>{title}</h2>
      {children}
    </section>
  );
}

function InstructionDemo() {
  return (
    <div className='flex items-center gap-item'>
      <IconButton label={text.replay} icon={<InterfaceIcon name='replay' />} />
      <p className='wk-reading-text m-0 font-bold'>{text.instruction}</p>
    </div>
  );
}

function MuteDemo() {
  const [muted, setMuted] = useState(false);
  return (
    <IconButton
      label={text.sound}
      pressed={!muted}
      icon={<InterfaceIcon name={muted ? 'sound-off' : 'sound-on'} />}
      onClick={() => setMuted(!muted)}
    />
  );
}

function TileDemo() {
  const [avatar, setAvatar] = useState<string>('owl');
  return (
    <div className='flex flex-col gap-container'>
      <div className='flex flex-wrap gap-container'>
        {HOME_PLACE_IDS.map((id) => (
          <Tile key={id} picture={areaPicture(id)} label={text.places[id]} />
        ))}
      </div>
      <div className='flex flex-wrap gap-item'>
        {(['owl', 'frog', 'snail'] as const).map((id) => (
          <Tile
            key={id}
            picture={<Avatar avatarId={id} />}
            label={text.avatarNames[id]}
            selected={avatar === id}
            onClick={() => setAvatar(id)}
          />
        ))}
      </div>
    </div>
  );
}

function FieldsDemo() {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('12');
  const [volume, setVolume] = useState(60);
  const [kiosk, setKiosk] = useState(false);
  const [size, setSize] = useState<'standard' | 'large' | 'larger'>('standard');
  return (
    <div className='grid max-w-[40rem] gap-container'>
      <TextField
        label={text.nameLabel}
        hint={text.nameHint}
        value={name}
        autoComplete='off'
        onChange={(event) => setName(event.currentTarget.value)}
      />
      <TextField
        label={text.pinLabel}
        error={text.pinError}
        value={pin}
        inputMode='numeric'
        autoComplete='off'
        onChange={(event) => setPin(event.currentTarget.value)}
      />
      <Slider
        label={text.volume}
        min={0}
        max={100}
        step={10}
        value={volume}
        valueText={`${volume}%`}
        onValueChange={setVolume}
      />
      <Switch label={text.kioskLabel} description={text.kioskDescription} checked={kiosk} onCheckedChange={setKiosk} />
      <SegmentedChoice
        label={text.textSize}
        options={(['standard', 'large', 'larger'] as const).map((value) => ({ value, label: text.textSizes[value] }))}
        value={size}
        onValueChange={setSize}
      />
    </div>
  );
}

function DialogsDemo() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [kiosk, setKiosk] = useState(true);
  return (
    <div className='flex flex-wrap gap-item'>
      <Button icon={<InterfaceIcon name='parent-corner' />} onClick={() => setDialogOpen(true)}>
        {text.openDialog}
      </Button>
      <Button variant='danger' onClick={() => setAlertOpen(true)}>
        {text.openAlert}
      </Button>
      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={text.dialogTitle}
        description={text.dialogDescription}
        closeLabel={text.close}
        actions={
          <Button variant='primary' onClick={() => setDialogOpen(false)}>
            {text.done}
          </Button>
        }
      >
        <Switch
          label={text.kioskLabel}
          description={text.kioskDescription}
          checked={kiosk}
          onCheckedChange={setKiosk}
        />
      </Dialog>
      <AlertDialog
        open={alertOpen}
        onOpenChange={setAlertOpen}
        title={text.alertTitle}
        description={text.alertDescription}
        cancelLabel={text.keep}
        confirmLabel={text.danger}
        destructive
        onConfirm={() => setAlertOpen(false)}
      />
    </div>
  );
}
