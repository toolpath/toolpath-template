import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConnectForm } from './connect-form'

const submit = (key: string) => {
  fireEvent.change(screen.getByLabelText('Toolpath API key'), { target: { value: key } })
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }))
}

describe('the connect form', () => {
  it('hands the key to the session and clears the field once it connects', async () => {
    const onConnect = vi.fn(async () => undefined)
    render(<ConnectForm action="idle" error={null} onConnect={onConnect} />)

    submit('tp_key')

    expect(onConnect).toHaveBeenCalledWith('tp_key')
    await waitFor(() => expect(screen.getByLabelText('Toolpath API key')).toHaveValue(''))
  })

  it('keeps the key in the field when the session refuses it', async () => {
    const onConnect = vi.fn(async () => {
      throw new Error('refused')
    })
    render(<ConnectForm action="idle" error={null} onConnect={onConnect} />)

    submit('tp_wrong')

    await waitFor(() => expect(onConnect).toHaveBeenCalled())
    expect(screen.getByLabelText('Toolpath API key')).toHaveValue('tp_wrong')
  })

  it('shows the error the session reports', () => {
    render(<ConnectForm action="idle" error="This API key has expired." onConnect={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('This API key has expired.')
  })

  it('cannot be pressed again while a request is in flight', () => {
    render(<ConnectForm action="connecting" error={null} onConnect={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled()
  })
})
