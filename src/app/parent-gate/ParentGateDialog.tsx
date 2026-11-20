import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button.tsx';
import { TextField } from '../../components/ui/TextField.tsx';
import type { OsFamily } from '../../core/platform/bridge.ts';
import { verifyParentPin } from '../../core/storage/parentPin.ts';
import { t } from '../../core/strings/defineStrings.ts';
import { useAppDocument } from '../session/sessionHooks.ts';
import { useShellPlatform } from '../shell/shellPlatform.tsx';
import { isChallengeAnswer, newChallenge, retryDelayMs, type Digit } from './challenge.ts';
import type { ParentGateReason } from './reasons.ts';
import { strings } from './strings.ts';
import './parentGate.css';

export interface ParentGateDialogProps {
  reason: ParentGateReason;
  opener: Element | null;
  onSettle: (passed: boolean) => void;
}

type Feedback = 'none' | 'waiting' | 'no-match' | 'pin-unusable';

/**
 * The gate itself. With no parent PIN it shows three digits as words and asks for them as
 * digits; with a PIN it asks for the PIN. A wrong answer gets a neutral message and a short delay
 * that grows with each try, and never a lockout. A PIN that cannot be checked falls back to the
 * words, because a gate that never answers would also keep the adult from quitting under kiosk
 * lock. Nothing here is ever spoken.
 */
export function ParentGateDialog({ reason, opener, onSettle }: ParentGateDialogProps) {
  const { app } = useAppDocument();
  const [pinUnusable, setPinUnusable] = useState(false);
  const pin = pinUnusable ? null : app.parentPin;
  // New digits each time the gate opens. The same digits stay through wrong answers, so a typo
  // does not cost the adult a new puzzle.
  const [digits] = useState<Digit[]>(() => newChallenge());
  const [typed, setTyped] = useState('');
  const [wrongAnswers, setWrongAnswers] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>('none');
  const [checking, setChecking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (feedback !== 'waiting') return undefined;
    const timer = setTimeout(() => setFeedback('no-match'), retryDelayMs(wrongAnswers));
    return () => clearTimeout(timer);
  }, [feedback, wrongAnswers]);

  const settle = (passed: boolean) => {
    if (settled.current) return;
    settled.current = true;
    onSettle(passed);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (checking || feedback === 'waiting') return;
    setChecking(true);
    let passed: boolean;
    try {
      passed = pin === null ? isChallengeAnswer(typed, digits) : await verifyParentPin(typed, pin);
    } catch {
      setChecking(false);
      setPinUnusable(true);
      setTyped('');
      setFeedback('pin-unusable');
      input.current?.focus();
      return;
    }
    setChecking(false);
    if (passed) {
      settle(true);
      return;
    }
    setTyped('');
    setWrongAnswers((count) => count + 1);
    setFeedback('waiting');
    input.current?.focus();
  };

  const messages: Record<Feedback, string> = {
    none: '',
    waiting: t(strings.waiting),
    'no-match': t(strings.noMatch),
    'pin-unusable': t(strings.pinUnusable),
  };
  const message = messages[feedback];
  const prompt = pin === null ? strings.wordPrompt : strings.pinPrompt;

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) settle(false);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className='wk-dialog-scrim' />
        <DialogPrimitive.Content
          className='wk-dialog wk-gate'
          data-band='band-9-12'
          data-text-size='standard'
          data-letter-spacing='standard'
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            input.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            if (opener instanceof HTMLElement && opener.isConnected) {
              event.preventDefault();
              opener.focus();
            }
          }}
        >
          <div className='wk-dialog-head'>
            <DialogPrimitive.Title className='wk-dialog-title'>{t(strings[`title-${reason}`])}</DialogPrimitive.Title>
            <DialogPrimitive.Close className='wk-button' data-shape='icon' aria-label={t(strings.close)}>
              <X className='wk-lucide' strokeWidth={3} aria-hidden='true' />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className='wk-dialog-description'>{t(prompt)}</DialogPrimitive.Description>
          {pin === null && (
            <p className='wk-gate-words' data-testid='gate-words'>
              {digits.map((digit, index) => (
                <span key={index}>
                  {index > 0 && ' '}
                  <span className='wk-gate-word'>{t(strings[`digit-${digit}`])}</span>
                </span>
              ))}
            </p>
          )}
          <form className='wk-gate-form' onSubmit={(event) => void submit(event)}>
            <TextField
              ref={input}
              label={t(pin === null ? strings.wordLabel : strings.pinLabel)}
              type={pin === null ? 'text' : 'password'}
              inputMode='numeric'
              autoComplete='off'
              spellCheck={false}
              maxLength={pin === null ? 12 : 8}
              value={typed}
              onChange={(event) => setTyped(event.currentTarget.value)}
              error={message === '' ? undefined : message}
            />
            {/* Announces each wrong answer; the field above shows the same words. */}
            <output className='wk-visually-hidden'>{message}</output>
            {pin !== null && <ForgotPin />}
            <div className='wk-dialog-actions'>
              <Button onClick={() => settle(false)}>{t(strings.cancel)}</Button>
              <Button type='submit' variant='primary' disabled={checking || feedback === 'waiting'}>
                {t(checking ? strings.checking : strings.continue)}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** How an adult who forgot the PIN removes it. The steps are in the README too. */
function ForgotPin() {
  const platform = useShellPlatform();
  const [place, setPlace] = useState<{ os: OsFamily; isElectron: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const result = await platform.info();
        if (live) setPlace({ os: result.os, isElectron: result.isElectron });
      } catch {
        // Without the platform, the steps show without the folder.
      }
    })();
    return () => {
      live = false;
    };
  }, [platform]);

  return (
    <details className='wk-gate-forgot'>
      <summary>{t(strings.forgotPin)}</summary>
      {place?.isElectron === false ? (
        <p>{t(strings.forgotPinBrowser)}</p>
      ) : (
        <>
          <p>{t(strings.forgotPinSteps)}</p>
          {place !== null && <code className='wk-gate-folder'>{t(strings[`folder-${place.os}`])}</code>}
        </>
      )}
    </details>
  );
}
