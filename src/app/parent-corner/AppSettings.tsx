import { KeyRound, Trash2 } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { AlertDialog } from '../../components/ui/AlertDialog.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Dialog } from '../../components/ui/Dialog.tsx';
import { Switch } from '../../components/ui/Switch.tsx';
import { TextField } from '../../components/ui/TextField.tsx';
import { hashParentPin } from '../../core/storage/parentPin.ts';
import { t } from '../../core/strings/defineStrings.ts';
import { useAppDocument } from '../session/sessionHooks.ts';
import { pinProblem } from './pin.ts';
import { strings } from './strings.ts';

/** Settings for the whole app: kiosk lock and the parent PIN. */
export function AppSettings() {
  const { app, updateApp, setKioskLock } = useAppDocument();
  const [kioskFailed, setKioskFailed] = useState(false);
  const [settingPin, setSettingPin] = useState(false);
  const [removingPin, setRemovingPin] = useState(false);
  const headingId = useId();
  const hasPin = app.parentPin !== null;

  const changeKiosk = async (on: boolean) => {
    setKioskFailed(false);
    const result = await setKioskLock(on);
    if (!result.ok) setKioskFailed(true);
  };

  return (
    <section className='wk-parent-section' aria-labelledby={headingId}>
      <h2 id={headingId}>{t(strings.wholeApp)}</h2>
      <div className='wk-parent-group'>
        <Switch
          label={t(strings.kiosk)}
          description={t(strings.kioskAbout)}
          checked={app.kioskLock}
          onCheckedChange={(on) => void changeKiosk(on)}
        />
        <p role='alert' className='wk-parent-problem-text'>
          {kioskFailed ? t(strings.kioskProblem) : ''}
        </p>
      </div>
      <div className='wk-parent-group'>
        <h3>{t(strings.pin)}</h3>
        <p className='wk-parent-about'>{t(hasPin ? strings.pinOn : strings.pinOff)}</p>
        <div className='wk-parent-row'>
          <Button icon={<KeyRound className='wk-lucide' aria-hidden='true' />} onClick={() => setSettingPin(true)}>
            {t(hasPin ? strings.changePin : strings.setPin)}
          </Button>
          {hasPin && (
            <Button
              variant='danger'
              icon={<Trash2 className='wk-lucide' aria-hidden='true' />}
              onClick={() => setRemovingPin(true)}
            >
              {t(strings.removePin)}
            </Button>
          )}
        </div>
      </div>
      {settingPin && (
        <PinDialog
          onSave={(parentPin) => {
            updateApp({ parentPin });
            setSettingPin(false);
          }}
          onCancel={() => setSettingPin(false)}
        />
      )}
      <AlertDialog
        open={removingPin}
        onOpenChange={setRemovingPin}
        title={t(strings.removePinTitle)}
        description={t(strings.removePinAbout)}
        confirmLabel={t(strings.removePin)}
        cancelLabel={t(strings.keepPin)}
        destructive
        onConfirm={() => updateApp({ parentPin: null })}
      />
    </section>
  );
}

type PinRecord = Awaited<ReturnType<typeof hashParentPin>>;

/** Asks for a new PIN twice. Only its salted hash is saved; the PIN itself never is. */
function PinDialog({ onSave, onCancel }: { onSave: (record: PinRecord) => void; onCancel: () => void }) {
  const [pin, setPin] = useState('');
  const [repeat, setRepeat] = useState('');
  const [problem, setProblem] = useState<ReturnType<typeof pinProblem>>(null);
  const [saving, setSaving] = useState(false);
  const formId = useId();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = pinProblem(pin, repeat);
    setProblem(found);
    if (found !== null || saving) return;
    setSaving(true);
    onSave(await hashParentPin(pin));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onCancel();
      }}
      title={t(strings.setPin)}
      closeLabel={t(strings.close)}
      actions={
        <>
          <Button onClick={onCancel} disabled={saving}>
            {t(strings.cancel)}
          </Button>
          <Button type='submit' form={formId} variant='primary' disabled={saving}>
            {t(saving ? strings.savingPin : strings.savePin)}
          </Button>
        </>
      }
    >
      <form id={formId} className='wk-parent-editor' onSubmit={(event) => void submit(event)}>
        <TextField
          label={t(strings.newPin)}
          hint={t(strings.pinHint)}
          type='password'
          inputMode='numeric'
          autoComplete='new-password'
          maxLength={8}
          value={pin}
          error={problem === 'invalid' ? t(strings.pinInvalid) : undefined}
          onChange={(event) => setPin(event.currentTarget.value)}
        />
        <TextField
          label={t(strings.repeatPin)}
          type='password'
          inputMode='numeric'
          autoComplete='new-password'
          maxLength={8}
          value={repeat}
          error={problem === 'mismatch' ? t(strings.pinMismatch) : undefined}
          onChange={(event) => setRepeat(event.currentTarget.value)}
        />
      </form>
    </Dialog>
  );
}
