import { useState, useRef, useEffect, useCallback } from 'react'

const CameraCapture = ({ onCapture, guideLabel, onClose }) => {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)

  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState(false)
  const [preview, setPreview] = useState(null) // { url, blob }

  // Start camera
  const startCamera = useCallback(async () => {
    setCameraReady(false)
    setCameraError(false)
    setPreview(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play()
          setCameraReady(true)
        }
      }
    } catch {
      setCameraError(true)
    }
  }, [])

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [startCamera, stopCamera])

  // Capture frame from video
  const handleCapture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0)

    canvas.toBlob((blob) => {
      if (!blob) return
      stopCamera()
      setPreview({ url: URL.createObjectURL(blob), blob })
    }, 'image/jpeg', 0.85)
  }

  // Retake
  const handleRetake = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
    setPreview(null)
    startCamera()
  }

  // Confirm
  const handleUse = () => {
    if (preview?.blob) {
      onCapture(preview.blob)
    }
  }

  // File upload fallback
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    stopCamera()
    setPreview({ url: URL.createObjectURL(file), blob: file })
    e.target.value = ''
  }

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (preview?.url) URL.revokeObjectURL(preview.url)
    }
  }, [preview])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/80">
        <p className="text-sm text-white font-medium">{guideLabel}</p>
        <button
          type="button"
          onClick={() => { stopCamera(); onClose() }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <span className="material-symbols-outlined text-white text-lg">close</span>
        </button>
      </div>

      {/* Preview Mode */}
      {preview && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-4">
          <div className="relative max-w-md w-full">
            <img
              src={preview.url}
              alt="Captured ID"
              className="w-full rounded-lg border border-neutral-700"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleRetake}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-neutral-600 text-white font-semibold text-sm hover:bg-neutral-800 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">replay</span>
              Retake
            </button>
            <button
              type="button"
              onClick={handleUse}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-neutral-900 font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">check</span>
              Use this photo
            </button>
          </div>
        </div>
      )}

      {/* Camera Viewfinder */}
      {!preview && (
        <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
          {/* Video feed */}
          {!cameraError && (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}

          {/* Guide overlay — 4 dark rectangles around the cutout */}
          {!cameraError && cameraReady && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Top dark bar */}
              <div className="absolute top-0 left-0 right-0 bg-black/60" style={{ height: 'calc(50% - 110px)' }} />
              {/* Bottom dark bar */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: 'calc(50% - 110px)' }} />
              {/* Left dark bar */}
              <div className="absolute bg-black/60" style={{ top: 'calc(50% - 110px)', bottom: 'calc(50% - 110px)', left: 0, width: 'calc(50% - 170px)' }} />
              {/* Right dark bar */}
              <div className="absolute bg-black/60" style={{ top: 'calc(50% - 110px)', bottom: 'calc(50% - 110px)', right: 0, width: 'calc(50% - 170px)' }} />
              {/* Card guide border */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-dashed border-primary rounded-lg" style={{ width: '340px', height: '220px' }}>
                {/* Corner accents */}
                <div className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-3 border-l-3 border-primary rounded-tl-lg" />
                <div className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-3 border-r-3 border-primary rounded-tr-lg" />
                <div className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-3 border-l-3 border-primary rounded-bl-lg" />
                <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-3 border-r-3 border-primary rounded-br-lg" />
              </div>
            </div>
          )}

          {/* Camera loading */}
          {!cameraError && !cameraReady && (
            <div className="flex flex-col items-center gap-3 z-10">
              <span className="material-symbols-outlined text-white text-4xl animate-spin">progress_activity</span>
              <p className="text-sm text-neutral-400">Starting camera...</p>
            </div>
          )}

          {/* Camera error */}
          {cameraError && (
            <div className="flex flex-col items-center gap-3 z-10 p-6">
              <span className="material-symbols-outlined text-neutral-500 text-5xl">no_photography</span>
              <p className="text-sm text-neutral-400 text-center">
                Camera unavailable. Upload a photo instead.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Bottom controls */}
      {!preview && (
        <div className="flex flex-col items-center gap-3 px-4 py-6 bg-black/80">
          {/* Capture button */}
          {!cameraError && cameraReady && (
            <button
              type="button"
              onClick={handleCapture}
              className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            >
              <div className="w-12 h-12 rounded-full bg-white" />
            </button>
          )}

          {/* Upload fallback */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-lg">photo_library</span>
            Upload from gallery
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      )}

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

export default CameraCapture
