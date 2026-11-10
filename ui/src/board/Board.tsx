import { useEffect, useState } from 'react'
import type { Board as B } from '../studio/scene'

// Studio backdrop brand wall rendered via DUI texture at 1920x1080.
const DEF: B = { bg: '#121216', bg2: '#25252c', title: 'OsmFX', sub: 'Props built for roleplay', logo: true, align: 'left', accent: '#ff8a3d' }

export function Board() {
  const [b, setB] = useState<B>(DEF)
  useEffect(() => {
    const f = (e: MessageEvent) => {
      let d = e.data
      if (typeof d === 'string') { try { d = JSON.parse(d) } catch { return } }
      if (d && typeof d === 'object' && 'title' in d) setB({ ...DEF, ...d })
    }
    window.addEventListener('message', f)
    return () => window.removeEventListener('message', f)
  }, [])
  return (
    <div className="board" style={{ background: `radial-gradient(120% 140% at 30% 20%, ${b.bg2} 0%, ${b.bg} 70%)`, textAlign: b.align }}>
      {b.image && <img className="board-image" src={b.image} alt="" />}
      <div className={`board-copy board-copy--${b.align}`}>
        {b.logo && (
          <svg className="board-mark" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7Z" fill="none" stroke="#f4f4f0" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M3.8 7.2 12 11.6l8.2-4.4M12 11.6v9.6" fill="none" stroke="#f4f4f0" strokeWidth="1.7" strokeLinejoin="round" opacity=".55" />
            <circle cx="12" cy="11.6" r="2.4" fill={b.accent} />
          </svg>
        )}
        <div className="board-title">{b.title}</div>
        {b.sub && <div className="board-sub"><span className="board-rule" style={{ background: b.accent }} />{b.sub}</div>}
      </div>
    </div>
  )
}
