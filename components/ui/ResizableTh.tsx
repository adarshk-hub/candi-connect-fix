'use client'

import { useRef } from 'react'

const MIN_WIDTH = 60

// A <th> with a visible right-edge divider that doubles as a drag handle for
// adjusting column width in list-view tables — the same thin line the user
// sees is what they grab to resize, matching the reference design. Uses
// direct DOM style writes during drag (not React state) for smooth 60fps
// resizing, then commits the final width once on pointerup — same pattern as
// the Kanban drag-ghost card.
export default function ResizableTh({
  width,
  onResize,
  className,
  children,
}: {
  width: number
  onResize: (width: number) => void
  className?: string
  children: React.ReactNode
}) {
  const thRef = useRef<HTMLTableCellElement>(null)

  function startResize(e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = thRef.current?.getBoundingClientRect().width ?? width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMove(ev: PointerEvent) {
      const next = Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX))
      if (thRef.current) thRef.current.style.width = `${next}px`
    }
    function onUp(ev: PointerEvent) {
      const next = Math.max(MIN_WIDTH, startWidth + (ev.clientX - startX))
      onResize(next)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <th
      ref={thRef}
      style={{ width, minWidth: MIN_WIDTH }}
      className={`relative select-none border-r border-border px-4 py-3 last:border-r-0 ${className || ''}`}
    >
      {children}
      <div
        onPointerDown={startResize}
        className="group absolute -right-1.5 top-0 z-10 h-full w-3 cursor-col-resize"
      >
        <div className="mx-auto h-full w-px group-hover:w-0.5 group-hover:bg-blue-500" />
      </div>
    </th>
  )
}
