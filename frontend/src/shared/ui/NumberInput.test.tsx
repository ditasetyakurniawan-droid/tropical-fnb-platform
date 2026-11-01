import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NumberInput } from './NumberInput'

function StatefulHarness({
  initial = 0,
  min,
  max,
  allowDecimal = true,
}: {
  initial?: number
  min?: number
  max?: number
  allowDecimal?: boolean
}) {
  const [val, setVal] = useState(initial)
  return (
    <div>
      <NumberInput
        aria-label="nominal"
        value={val}
        onChange={setVal}
        min={min}
        max={max}
        allowDecimal={allowDecimal}
      />
      <button type="button" onClick={() => setVal(85000)}>
        Set Preset
      </button>
      <span data-testid="numeric-state">{val}</span>
    </div>
  )
}

describe('NumberInput', () => {
  it('renders initial numeric value', () => {
    const onChange = vi.fn()
    render(<NumberInput value={100} onChange={onChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('100')
  })

  it('clears initial 0 automatically on focus so typing 5000 produces 5000 without leading 0', async () => {
    const user = userEvent.setup()
    render(<StatefulHarness initial={0} min={0} />)
    const input = screen.getByLabelText('nominal') as HTMLInputElement

    expect(input.value).toBe('0')
    await user.click(input)
    expect(input.value).toBe('')

    await user.keyboard('5000')
    expect(input.value).toBe('5000')
    expect(screen.getByTestId('numeric-state').textContent).toBe('5000')
  })

  it('restores 0 cleanly on blur if user focused a 0 field and left without typing', () => {
    render(<StatefulHarness initial={0} min={0} />)
    const input = screen.getByLabelText('nominal') as HTMLInputElement

    fireEvent.focus(input)
    expect(input.value).toBe('')

    fireEvent.blur(input)
    expect(input.value).toBe('0')
  })

  it('automatically strips leading zeroes when user types numbers like 0500', () => {
    const onChange = vi.fn()
    render(<NumberInput value={0} onChange={onChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    fireEvent.change(input, { target: { value: '0500' } })
    expect(input.value).toBe('500')
    expect(onChange).toHaveBeenCalledWith(500)
  })

  it('allows user in a controlled stateful parent to backspace completely to empty without snapping back to 0', async () => {
    const user = userEvent.setup()
    render(<StatefulHarness initial={500} min={0} />)
    const input = screen.getByLabelText('nominal') as HTMLInputElement

    await user.clear(input)
    expect(input.value).toBe('')
    expect(screen.getByTestId('numeric-state').textContent).toBe('0')

    await user.keyboard('12500')
    expect(input.value).toBe('12500')
    expect(screen.getByTestId('numeric-state').textContent).toBe('12500')
  })

  it('supports Indonesian comma decimal input (2,5 -> 2.5) and intermediate trailing decimals (4.05)', async () => {
    const user = userEvent.setup()
    render(<StatefulHarness initial={0} min={0} />)
    const input = screen.getByLabelText('nominal') as HTMLInputElement

    await user.click(input)
    await user.keyboard('2,5')
    expect(input.value).toBe('2.5')
    expect(screen.getByTestId('numeric-state').textContent).toBe('2.5')

    await user.clear(input)
    await user.keyboard('4.05')
    expect(input.value).toBe('4.05')
    expect(screen.getByTestId('numeric-state').textContent).toBe('4.05')
  })

  it('syncs when parent updates value externally via preset button', async () => {
    const user = userEvent.setup()
    render(<StatefulHarness initial={0} min={0} />)
    const input = screen.getByLabelText('nominal') as HTMLInputElement

    await user.click(screen.getByRole('button', { name: 'Set Preset' }))
    expect(input.value).toBe('85000')
  })

  it('selects all text on focus for non-zero numbers so user can immediately overwrite', () => {
    const onChange = vi.fn()
    render(<NumberInput value={100} onChange={onChange} />)
    const input = screen.getByRole('textbox') as HTMLInputElement

    const selectSpy = vi.spyOn(input, 'select')
    fireEvent.focus(input)
    expect(selectSpy).toHaveBeenCalled()
  })

  it('clamps to max while typing and clamps to min on blur', () => {
    render(<StatefulHarness initial={10} min={5} max={28} />)
    const input = screen.getByLabelText('nominal') as HTMLInputElement

    fireEvent.change(input, { target: { value: '35' } })
    expect(input.value).toBe('28')
    expect(screen.getByTestId('numeric-state').textContent).toBe('28')

    fireEvent.change(input, { target: { value: '2' } })
    expect(input.value).toBe('2')
    fireEvent.blur(input)
    expect(input.value).toBe('5')
    expect(screen.getByTestId('numeric-state').textContent).toBe('5')
  })
})
