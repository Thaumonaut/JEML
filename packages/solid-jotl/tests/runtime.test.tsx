/**
 * End-to-end smoke test: a `.jot` file goes through the Vite plugin, gets
 * Solid-compiled, mounts in JSDOM, and reacts to a button click.
 *
 * If this test fails, something between codegen and Solid's reactive system
 * is broken — usually a sign that the emitted JSX isn't using signal calls
 * correctly.
 */
import { describe, expect, it } from 'vitest'
import { render, fireEvent } from '@solidjs/testing-library'
import Counter from './fixtures/Counter.jot'

describe('Counter — runtime', () => {
  it('starts at the initial value and increments on click', () => {
    const { container } = render(() => <Counter initial={5} />)

    const button = container.querySelector('button')
    expect(button).not.toBeNull()
    expect(container.textContent).toContain('Clicks: 5')

    fireEvent.click(button!)
    expect(container.textContent).toContain('Clicks: 6')

    fireEvent.click(button!)
    fireEvent.click(button!)
    expect(container.textContent).toContain('Clicks: 8')
  })
})
