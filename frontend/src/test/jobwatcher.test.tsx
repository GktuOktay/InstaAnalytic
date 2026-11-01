import { describe, it, expect } from 'vitest'
import { act, screen } from '@testing-library/react'
import { renderApp } from './utils'
import JobWatcher from '../components/JobWatcher'

// jsdom postMessage olaylarında origin/source boş kalır; gerçek tarayıcıdaki gibi doldurulmuş olay gönder
function fromExtension(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent('message', { data: { __ia: true, ...data }, origin: window.location.origin, source: window }))
}

const job = (over: Record<string, unknown>) => ({
  id: 'j1', kind: 'likers', state: 'running', index: 0, total: 2, message: 'Beğenenler: 1 / 2', errors: [], queue: [],
  startedAt: Date.now(), ...over,
})

describe('JobWatcher', () => {
  it('announces the start and shows the detailed result when the job ends', async () => {
    renderApp(<JobWatcher />)
    await act(async () => { fromExtension({ type: 'ia-job-update', job: job({}) }) })
    expect(await screen.findByText(/Eklenti işe başladı: Beğenenler: 1 \/ 2/)).toBeInTheDocument()

    const message = 'Beğenenler: 2 gönderi açıldı, 1 tanesinden toplam 40 beğenen kaydedildi.\n• BBBBB: Beğenme sayısı sayfada bulunamadı.'
    await act(async () => {
      fromExtension({ type: 'ia-job-update', job: job({ state: 'done', outcome: 'partial', finishedAt: Date.now(), message }) })
    })
    expect(await screen.findByText(/toplam 40 beğenen kaydedildi/)).toBeInTheDocument()
    expect(screen.getByText(/BBBBB: Beğenme sayısı sayfada bulunamadı/)).toBeInTheDocument()
  })

  it('does not replay an old result when the page opens', async () => {
    renderApp(<JobWatcher />)
    await act(async () => {
      fromExtension({ type: 'ia-job-update', job: job({ id: 'old', state: 'done', outcome: 'ok', finishedAt: Date.now() - 3600e3, message: 'Eski sonuç' }) })
    })
    expect(screen.queryByText('Eski sonuç')).toBeNull()
  })
})
