// 공식 항목명 매핑 — 임베딩(pgvector) 도입 전까지만 쓸 임시 하드코딩 표
const items = [
  { official: '인플루엔자 예방접종료', aliases: ['독감주사', '독감 예방접종', '독감백신'] },
  { official: '알레르기 검사료', aliases: ['알러지검사', '알레르기 검사', '알러지'] },
  { official: '도수치료', aliases: ['도수치료', '물리치료'] },
]

function normalize(text) {
  return text.replace(/\s/g, '').toLowerCase()
}

function findMatch(query) {
  const q = normalize(query)
  return items.find((item) =>
    [item.official, ...item.aliases].some((word) => {
      const w = normalize(word)
      return w.includes(q) || q.includes(w)
    }),
  )
}

module.exports = function handler(req, res) {
  const query = typeof req.query.q === 'string' ? req.query.q : ''
  if (!query.trim()) {
    res.status(200).json({ matched: false })
    return
  }
  const found = findMatch(query)
  if (found) {
    res.status(200).json({ matched: true, official: found.official })
  } else {
    res.status(200).json({ matched: false })
  }
}
