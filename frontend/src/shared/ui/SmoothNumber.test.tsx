import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SmoothNumber } from './SmoothNumber'

describe('SmoothNumber component', () => {
  it('renders formatted IDR currency', () => {
    render(<SmoothNumber value={150000000} format="idr" />)
    expect(screen.getByText('Rp 150.000.000')).toBeInTheDocument()
  })

  it('renders formatted percentage', () => {
    render(<SmoothNumber value={68.2} format="percent" decimals={1} />)
    expect(screen.getByText('68.2%')).toBeInTheDocument()
  })

  it('supports prefix and suffix', () => {
    render(<SmoothNumber value={100} format="number" prefix="+" suffix=" items" />)
    expect(screen.getByText('+100 items')).toBeInTheDocument()
  })
})
