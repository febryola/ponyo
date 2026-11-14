export function JellyfishArtwork({ id, tone, direction }: { id: string; tone: "blue" | "silver" | "gold"; direction: 1 | -1 }) {
  const palettes = {
    blue: { light: "#e4fbff", mid: "#44b9e8", deep: "#0879b8", line: "#46b8e4", glint: "#ffffff" },
    silver: { light: "#ffffff", mid: "#c6d0dc", deep: "#718096", line: "#aeb9c6", glint: "#ffffff" },
    gold: { light: "#fff4c4", mid: "#e8bd62", deep: "#9c6726", line: "#d2a344", glint: "#fffdf2" },
  };
  const colors = palettes[tone];
  return (
    <svg viewBox="0 0 420 260" aria-hidden="true" focusable="false" role="presentation">
      <g transform={direction === -1 ? "translate(420 0) scale(-1 1)" : undefined}>
        <defs>
          <linearGradient id={`${id}-bell`} x1=".18" y1=".06" x2=".84" y2=".95">
            <stop offset="0" stopColor={colors.light} />
            <stop offset=".3" stopColor={colors.mid} />
            <stop offset=".72" stopColor={colors.deep} />
            <stop offset="1" stopColor={colors.mid} />
          </linearGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2=".4">
            <stop stopColor={colors.light} />
            <stop offset=".5" stopColor={colors.mid} />
            <stop offset="1" stopColor={colors.deep} />
          </linearGradient>
          <linearGradient id={`${id}-tentacle`} x1="0" y1="0" x2="1" y2=".1">
            <stop stopColor={colors.deep} />
            <stop offset=".45" stopColor={colors.mid} />
            <stop offset="1" stopColor={colors.light} />
          </linearGradient>
          <radialGradient id={`${id}-shine`} cx=".3" cy=".24" r=".8">
            <stop stopColor={colors.glint} stopOpacity=".88" />
            <stop offset="1" stopColor={colors.glint} stopOpacity="0" />
          </radialGradient>
        </defs>
        <g fill="none" stroke={`url(#${id}-tentacle)`} strokeLinecap="round">
          <path d="M130 131C190 142 201 78 252 92s76 56 142 8" strokeWidth="5" opacity=".8" />
          <path d="M137 139C194 154 218 117 253 126s72 57 138 43" strokeWidth="3" opacity=".9" />
          <path d="M129 145C183 173 204 151 245 170s83 17 142 48" strokeWidth="4" opacity=".78" />
          <path d="M124 151C170 191 198 180 234 198s77 6 111 34" strokeWidth="2.5" opacity=".82" />
          <path d="M119 154C164 206 174 211 212 215s70-20 101-9 37 28 64 19" strokeWidth="3" opacity=".72" />
          <path d="M135 125C194 126 222 61 272 65s75 31 114 4" strokeWidth="2.5" opacity=".7" />
          <path d="M141 133C203 139 222 99 278 101s77 39 112 26" strokeWidth="2" opacity=".72" />
          <path d="M120 159C150 198 146 222 180 232s49-13 68-4" strokeWidth="2.2" opacity=".75" />
          <path d="M111 153C146 178 148 196 159 210s27 21 38 14" strokeWidth="3.5" opacity=".8" />
        </g>
        <path d="M28 126C28 83 55 48 94 44c37-4 69 25 76 65 4 21-4 39-21 49-13 8-28 3-44 4-25 2-48 18-64 4-9-8-13-22-13-40Z" fill={`url(#${id}-bell)`} stroke={colors.deep} strokeWidth="2" />
        <path d="M36 122C40 84 62 58 94 55c30-3 55 18 63 48 5 19-1 34-15 44-12 8-27 4-42 6-22 2-41 15-54 4-8-7-11-19-10-35Z" fill={`url(#${id}-shine)`} />
        <path d="M36 128c5 22 17 32 31 33 10 1 18-4 28-4 13-1 24 5 36 2 11-3 19-12 25-24" fill="none" stroke={`url(#${id}-rim)`} strokeWidth="7" strokeLinecap="round" />
        <path d="M48 107c4-26 20-43 42-46M56 121c3-20 13-32 26-39M68 134c4-19 12-29 21-36M83 146c3-15 9-24 15-31M102 151c1-13 5-23 10-31M121 151c-1-12 1-22 5-30" fill="none" stroke={colors.light} strokeWidth="2.2" strokeLinecap="round" opacity=".72" />
        <path d="M49 89c13-23 34-35 56-35" fill="none" stroke={colors.glint} strokeWidth="6" strokeLinecap="round" opacity=".75" />
        <path d="M59 78c8-8 17-13 27-15" fill="none" stroke={colors.glint} strokeWidth="2.4" strokeLinecap="round" opacity=".9" />
        <g fill="none" stroke={`url(#${id}-tentacle)`} strokeLinecap="round">
          <path d="M57 159c-6 14 2 24-7 35-6 8-16 10-19 24" strokeWidth="4" />
          <path d="M75 162c-3 17 7 25 2 40-3 10-12 16-11 31" strokeWidth="4.5" />
          <path d="M94 162c1 16-5 28 1 41 4 8 12 12 12 26" strokeWidth="4" />
          <path d="M112 161c8 14 1 27 10 38 7 8 17 9 21 21" strokeWidth="3.7" />
          <path d="M131 157c12 11 9 23 21 29 8 4 17 1 23 9" strokeWidth="3.2" />
        </g>
        <path d="M57 159c-6 14 2 24-7 35m25-32c-3 17 7 25 2 40m17-40c1 16-5 28 1 41m17-42c8 14 1 27 10 38m9-42c12 11 9 23 21 29" fill="none" stroke={colors.glint} strokeWidth="1.2" strokeLinecap="round" opacity=".72" />
        <circle cx="75" cy="68" r="3" fill={colors.glint} opacity=".9" />
        <circle cx="129" cy="91" r="2" fill={colors.glint} opacity=".85" />
        <circle cx="148" cy="120" r="1.7" fill={colors.glint} opacity=".8" />
      </g>
    </svg>
  );
}