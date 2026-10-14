import jsQR from 'jsqr'
import { useEffect, useRef, useState } from 'react'
import { Button } from './Button.tsx'

interface QrScannerProps {
  /** Called once with the decoded text. The scanner then stops the camera. */
  onScan: (text: string) => void
  onCancel: () => void
}

type Status = 'starting' | 'scanning' | 'denied' | 'unavailable'

/**
 * Reads a QR code from the camera. Video frames are processed on the device and never stored
 * or sent. The camera is released when a code is read, on cancel, and on unmount.
 */
export function QrScanner({ onScan, onCancel }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<Status>('starting')
  // Keep the latest callback without restarting the camera when the parent re-renders.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  })

  useEffect(() => {
    let stopped = false
    let frame = 0
    let stream: MediaStream | undefined

    const stop = () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => {
        track.stop()
      })
    }

    async function start() {
      if (typeof navigator.mediaDevices === 'undefined') {
        setStatus('unavailable')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      } catch {
        if (!stopped) setStatus('denied')
        return
      }
      const video = videoRef.current
      if (stopped || video === null) {
        stop()
        return
      }
      video.srcObject = stream
      await video.play()
      setStatus('scanning')

      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })
      const tick = () => {
        if (stopped) return
        if (
          context !== null &&
          video.readyState >= video.HAVE_ENOUGH_DATA &&
          video.videoWidth > 0
        ) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          context.drawImage(video, 0, 0)
          const image = context.getImageData(0, 0, canvas.width, canvas.height)
          const code = jsQR(image.data, image.width, image.height)
          if (code !== null && code.data !== '') {
            stop()
            onScanRef.current(code.data)
            return
          }
        }
        frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }

    void start()
    return stop
  }, [])

  if (status === 'denied' || status === 'unavailable') {
    return (
      <div className="space-y-4 rounded-card border border-line bg-surface p-4">
        <p role="alert">
          {status === 'denied'
            ? 'Camera access was blocked. Allow it in your browser settings, or paste the code instead.'
            : 'This browser cannot open a camera here. Paste the code instead.'}
        </p>
        <Button variant="secondary" onClick={onCancel}>
          Close
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <video
        ref={videoRef}
        muted
        playsInline
        aria-label="Camera view for scanning a QR code"
        className="aspect-square w-full max-w-sm rounded-card bg-sunken object-cover"
      />
      <p className="text-sm text-muted" role="status">
        {status === 'starting' ? 'Starting the camera…' : 'Point the camera at the QR code.'}
      </p>
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
