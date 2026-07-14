import { useEffect, useRef, useState, useCallback } from 'react'
import { listScreenshots, uploadScreenshot, deleteScreenshot, type Screenshot } from '../lib/testScreenshots'
import styles from './Tests.module.css'

export default function Tests() {
  const [shots, setShots] = useState<Screenshot[]>([])
  const [pending, setPending] = useState(0) // in-flight upload count
  const [dragging, setDragging] = useState(false)
  const [zoom, setZoom] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try {
      setShots(await listScreenshots())
    } catch (e) {
      console.warn('listScreenshots failed', e)
      setShots([])
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const handleFiles = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) return
    setPending((n) => n + images.length)
    await Promise.all(
      images.map(async (f) => {
        try {
          await uploadScreenshot(f)
        } catch (e) {
          console.warn('uploadScreenshot failed', e)
        } finally {
          setPending((n) => Math.max(0, n - 1))
        }
      }),
    )
    await reload()
  }, [reload])

  // Paste screenshots from clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length) handleFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFiles])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  const remove = async (path: string) => {
    try {
      await deleteScreenshot(path)
      setShots((prev) => prev.filter((s) => s.path !== path))
    } catch (e) {
      console.warn('deleteScreenshot failed', e)
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Tests</h1>

      <div
        className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        Tap to add screenshots
        <span className={styles.hint}>or drop / paste them here</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          handleFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />

      {shots.length === 0 && pending === 0 ? (
        <p className={styles.empty}>No screenshots yet.</p>
      ) : (
        <div className={styles.grid}>
          {Array.from({ length: pending }).map((_, i) => (
            <div key={`p${i}`} className={`${styles.tile} ${styles.placeholder}`}>
              <div className={styles.spinner} />
            </div>
          ))}
          {shots.map((s) => (
            <div key={s.path} className={styles.tile}>
              <img className={styles.thumb} src={s.url} alt="" onClick={() => setZoom(s.url)} />
              <button className={styles.del} onClick={() => remove(s.path)} aria-label="Delete">×</button>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div className={styles.lightbox} onClick={() => setZoom(null)}>
          <button className={styles.lightboxClose} aria-label="Close">×</button>
          <img className={styles.lightboxImg} src={zoom} alt="" />
        </div>
      )}
    </div>
  )
}
