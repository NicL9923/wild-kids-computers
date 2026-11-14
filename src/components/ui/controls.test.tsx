// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from './Button.tsx';
import { IconButton } from './IconButton.tsx';
import { SegmentedChoice } from './SegmentedChoice.tsx';
import { Slider } from './Slider.tsx';
import { Switch } from './Switch.tsx';
import { TextField } from './TextField.tsx';
import { Tile } from './Tile.tsx';

afterEach(cleanup);

function Mute() {
  const [on, setOn] = useState(true);
  return <IconButton label='Sound' pressed={on} icon={<span />} onClick={() => setOn(!on)} />;
}

describe('Button', () => {
  it('runs its action on click and never submits a form unless asked', () => {
    const onClick = vi.fn<() => void>();
    const onSubmit = vi.fn<(event: Event) => void>((event) => event.preventDefault());
    const { container } = render(
      <form>
        <Button onClick={onClick}>Play again</Button>
      </form>,
    );
    container.querySelector('form')?.addEventListener('submit', onSubmit);
    fireEvent.click(screen.getByRole('button', { name: 'Play again' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    const onClick = vi.fn<() => void>();
    render(
      <Button disabled onClick={onClick}>
        Not now
      </Button>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('is named by its label, since it shows only a picture', () => {
    render(<IconButton label='Hear it again' icon={<img alt='' src='replay.svg' />} />);
    expect(screen.getByRole('button', { name: 'Hear it again' }).getAttribute('aria-label')).toBe('Hear it again');
  });

  it.each(['', '   '])('refuses a blank label %j, which would leave the button without a name', (label) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<IconButton label={label} icon={<span />} />)).toThrow(/IconButton needs a label/);
  });

  it('reports a toggle state such as mute through aria-pressed', () => {
    render(<Mute />);
    const button = screen.getByRole('button', { name: 'Sound' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('Tile', () => {
  it('keeps its label as the accessible name even when the youngest band hides the text', () => {
    const onClick = vi.fn<() => void>();
    render(<Tile picture='paint.svg' label='Paint studio' onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paint studio' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('marks a chosen tile as pressed and adds a check, so color is not the only sign', () => {
    const { rerender } = render(<Tile picture='owl.svg' label='Owl' selected={false} />);
    const tile = screen.getByRole('button', { name: 'Owl' });
    expect(tile.getAttribute('aria-pressed')).toBe('false');
    expect(tile.querySelector('.wk-tile-check')).toBeNull();
    rerender(<Tile picture='owl.svg' label='Owl' selected />);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
    expect(tile.querySelector('.wk-tile-check')).not.toBeNull();
  });
});

describe('TextField', () => {
  it('labels the input and describes it with its hint', () => {
    render(<TextField label='Name' hint='Optional.' />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(screen.getByText('Optional.').id).toBe(input.getAttribute('aria-describedby'));
  });

  it('marks the input invalid and reads the error first when there is one', () => {
    render(<TextField label='New PIN' hint='Digits only.' error='Use 4 to 8 digits.' />);
    const input = screen.getByRole('textbox', { name: 'New PIN' });
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const [first, second] = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(document.getElementById(first ?? '')?.textContent).toBe('Use 4 to 8 digits.');
    expect(document.getElementById(second ?? '')?.textContent).toBe('Digits only.');
  });
});

describe('Slider', () => {
  it('reports the new value as a number and reads its value text aloud', () => {
    const onValueChange = vi.fn<(value: number) => void>();
    render(
      <Slider
        label='Voice volume'
        min={0}
        max={100}
        step={10}
        value={60}
        valueText='60%'
        onValueChange={onValueChange}
      />,
    );
    const slider = screen.getByRole('slider', { name: 'Voice volume' });
    expect(slider.getAttribute('aria-valuetext')).toBe('60%');
    fireEvent.change(slider, { target: { value: '70' } });
    expect(onValueChange).toHaveBeenCalledWith(70);
  });

  it('fills the track up to the value', () => {
    render(<Slider label='Volume' min={20} max={60} value={30} onValueChange={() => {}} />);
    expect(screen.getByRole('slider').style.getPropertyValue('--wk-slider-fill')).toBe('25%');
  });

  it('shows an empty track instead of dividing by zero when min equals max', () => {
    render(<Slider label='Volume' min={5} max={5} value={5} onValueChange={() => {}} />);
    expect(screen.getByRole('slider').style.getPropertyValue('--wk-slider-fill')).toBe('0%');
  });
});

describe('Switch', () => {
  it('is a labelled switch that asks for the opposite state when pressed', () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    render(
      <Switch
        label='Kiosk lock'
        description='Keeps the app full screen.'
        checked={false}
        onCheckedChange={onCheckedChange}
      />,
    );
    const control = screen.getByRole('switch', { name: 'Kiosk lock' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(control.getAttribute('aria-describedby')).toBe(screen.getByText('Keeps the app full screen.').id);
    fireEvent.click(control);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('asks to turn off when it is on', () => {
    const onCheckedChange = vi.fn<(checked: boolean) => void>();
    render(<Switch label='Kiosk lock' checked onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Kiosk lock' }));
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});

describe('SegmentedChoice', () => {
  const options = [
    { value: 'standard', label: 'Standard' },
    { value: 'large', label: 'Large' },
  ] as const;

  it('groups its options under the question and checks the current value', () => {
    render(<SegmentedChoice label='Text size' options={options} value='large' onValueChange={() => {}} />);
    const group = screen.getByRole('group', { name: 'Text size' });
    expect(group.querySelectorAll('input[type=radio]')).toHaveLength(2);
    expect(screen.getByRole('radio', { name: 'Large' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: 'Standard' })).toHaveProperty('checked', false);
  });

  it('reports the value of the option chosen', () => {
    const onValueChange = vi.fn<(value: string) => void>();
    render(<SegmentedChoice label='Text size' options={options} value='standard' onValueChange={onValueChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Large' }));
    expect(onValueChange).toHaveBeenCalledWith('large');
  });
});
